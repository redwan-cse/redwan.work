-- =============================================================================
-- Migration 0031: Deep Security & Financial Ledger Audit v3 Remediation
-- =============================================================================
-- Closes all verified PostgreSQL, RLS, RPC, trigger, cron, and ledger findings
-- from the pre-v2.0.0 adversarial audit:
--   1.  Enforces AAL2 MFA inside current_account_role() for admins (unconditional)
--       and MFA-enforced clients, plus unconditional AAL2 admin guard in
--       enforce_profile_privileged_columns().
--   2.  Prevents cross-tenant sequence-collision DoS on public.tickets and
--       public.payments by forcing sequence-generated numbers and server
--       timestamps on non-service_role inserts; caps pending payment proofs
--       against remaining balance and rejects client-forged review fields.
--   3.  Fixes live RLS tautology in payments_insert_own_issued_invoice
--       (qualifying payments.currency and payments.order_id against invoices i).
--   4.  Blocks deliverable review & auto-accept on cancelled/completed orders,
--       clears auto_accept_at when cancellations are approved, guards
--       completed_orders_count against double-increments, excludes draft invoices
--       from deliverable balance/completion checks, restores order_milestones
--       approval in run_auto_accept_deliverables(), and allows pg_cron
--       session_user ('postgres', 'supabase_admin') in cron functions.
--   5.  Adds retainer_plans.fx_rate_to_usd, fixes quarterly (3x) & annual (12x)
--       retainer renewal billing, and excludes void invoices from FX fallbacks.
--   6.  Adds validated optional p_fx_rate_to_usd to create_admin_order_atomic(),
--       stores FX on orders + deposit invoices, and fixes create_paid_revision_invoice_atomic()
--       FX inheritance (excluding void invoices and falling back to order FX).
--   7.  Hardens engagement_authorizations RLS + BEFORE INSERT trigger (no forged
--       signer_ip_hash/signed_at, non-empty targets, no terminal/non-RoE orders)
--       and adds atomic sign_order_roe_atomic() RPC.
--   8.  Blocks detaching invoice_items from issued/paid invoices via UPDATE
--       invoice_items.invoice_id.
--   9.  Hardens credit_notes (open-invoice status check, pinned FX, settlement
--       side-effects) and blocks void_invoice_atomic() on credited invoices.
--  10.  Blocks $0 issued invoices, verifies subtotal_cents = SUM(invoice_items)
--       before issuing, guards non-service_role direct INSERT of non-draft
--       invoices, locks is_deposit_invoice/milestone_id/revision_grant_* on
--       issued invoices, and rounds FX consistently to numeric(14,6) while
--       rejecting non-1.0 USD FX in review_invoice_payment / record_manual_payment_atomic.
--  11.  Expands orders_enforce_roe trigger scope & kickoff deposit guard across
--       queued/in_progress/in_review/delivered/completed, and forces requires_roe
--       for cybersecurity proposals in accept_proposal_and_create_order().
--  12.  Fixes run_daily_crm_maintenance() session_user guard, saves/restores
--       JWT GUCs, audits expired proposals, and isolates per-retainer errors.
--  13.  Prevents publish_consent_policy_atomic() from mutating historical
--       consent policy archive hashes and writes an audit_logs entry.
--  14.  Restricts private admin CRM columns on client_profiles from direct
--       authenticated SELECT and expands audit_logs_select_own_or_admin to hide
--       Phase 3 draft/internal actions.
--  15.  Adds service_role session revocation helper revoke_auth_user_sessions(),
--       unique pending cancellation index, attachment cardinality caps,
--       deliverable_id tenant integrity, order_requirements non-terminal guard,
--       decline_proposal NULL-actor guard, internal service_role guards on
--       consume_rate_limit / increment_vault_file_download, and expanded
--       rate_limits_kind_check.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enforce AAL2 MFA in current_account_role() & enforce_profile_privileged_columns()
-- -----------------------------------------------------------------------------
create or replace function public.current_account_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active is true
    and (
      (
        p.role = 'admin'::public.user_role
        and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      )
      or (
        p.role = 'client'::public.user_role
        and coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'client') = 'client'
        and (p.mfa_enforced is false or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
      )
    )
    and (
      (
        coalesce(auth.jwt() ->> 'iat', '') ~ '^[0-9]+$'
        and (auth.jwt() ->> 'iat')::numeric >= p.tokens_valid_after
      )
      or (
        coalesce(auth.jwt() ->> 'iat', '') = ''
        and p.tokens_valid_after = 0
      )
    )
$$;

revoke all on function public.current_account_role() from public, anon;
grant execute on function public.current_account_role() to authenticated, service_role;

create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(auth.role(), '');
begin
  if v_caller_role in ('authenticated', 'anon') then
    if (old.role = 'admin'::public.user_role or old.mfa_enforced is true)
       and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception 'Multi-factor authentication (AAL2) is required to modify this profile.';
    end if;

    if old.mfa_enforced is true and new.mfa_enforced is distinct from true then
      raise exception 'Privileged security policy: mfa_enforced cannot be disabled from an authenticated session.';
    end if;

    if not public.is_admin() then
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active
         or new.mfa_enforced is distinct from old.mfa_enforced
         or new.email is distinct from old.email
         or new.tokens_valid_after is distinct from old.tokens_valid_after
         or new.created_at is distinct from old.created_at then
        raise exception 'Privileged profile attributes cannot be modified.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_profile_privileged_columns() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Prevent Sequence-Collision DoS on tickets & payments + Fix Payments RLS Tautology
-- -----------------------------------------------------------------------------
create or replace function public.enforce_ticket_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.number := nextval('public.ticket_num_seq');
    new.created_at := now();
    new.updated_at := now();
    new.last_message_at := now();
    if not public.is_admin() then
      new.status := 'open'::public.ticket_status;
      new.first_responded_at := null;
      new.resolved_at := null;
      if new.priority = 'urgent'::public.ticket_priority then
        new.priority := 'high'::public.ticket_priority;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ticket_insert_defaults() from public, anon, authenticated;
drop trigger if exists tickets_enforce_insert_defaults on public.tickets;
create trigger tickets_enforce_insert_defaults
  before insert on public.tickets
  for each row execute function public.enforce_ticket_insert_defaults();

drop policy if exists "payments_insert_own_issued_invoice" on public.payments;
create policy "payments_insert_own_issued_invoice"
  on public.payments for insert
  with check (
    public.is_active_client()
    and client_id = (select auth.uid())
    and status = 'submitted'::public.payment_status
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and exists (
      select 1
      from public.invoices i
      where i.id = payments.invoice_id
        and i.client_id = (select auth.uid())
        and i.currency = payments.currency
        and (payments.order_id is null or payments.order_id is not distinct from i.order_id)
        and i.status in (
          'issued'::public.invoice_status,
          'partially_paid'::public.invoice_status,
          'overdue'::public.invoice_status
        )
    )
    and (
      proof_file_id is null
      or exists (
        select 1
        from public.vault_files vf
        where vf.id = payments.proof_file_id
          and vf.owner_client_id = (select auth.uid())
      )
    )
  );

create or replace function public.enforce_payment_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_remaining int;
  v_pending_cents bigint;
  v_caller_role text := coalesce(auth.role(), '');
begin
  select * into v_inv from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'Invoice not found for payment.';
  end if;

  if v_inv.status not in (
    'issued'::public.invoice_status,
    'partially_paid'::public.invoice_status,
    'overdue'::public.invoice_status
  ) then
    raise exception 'Invoice is not open for payments (status: %).', v_inv.status;
  end if;

  if new.client_id is distinct from v_inv.client_id then
    raise exception 'Payment client_id does not match invoice client_id.';
  end if;

  if new.currency is distinct from v_inv.currency then
    raise exception 'Payment currency (%) must match invoice currency (%).', new.currency, v_inv.currency;
  end if;

  if new.order_id is not null and new.order_id is distinct from v_inv.order_id then
    raise exception 'Payment order_id does not match invoice order_id.';
  end if;
  new.order_id := v_inv.order_id;
  new.reference := btrim(new.reference);

  if v_caller_role in ('authenticated', 'anon') then
    new.number := nextval('public.payment_num_seq');
    new.submitted_at := now();
    if not public.is_admin() then
      if new.status <> 'submitted'::public.payment_status
         or new.reviewed_by is not null
         or new.reviewed_at is not null
         or new.rejection_reason is not null then
        raise exception 'Client payment submissions cannot set review fields.';
      end if;
    end if;
  end if;

  if coalesce(current_setting('app.manual_payment_fx', true), '') <> 'on' then
    new.fx_rate_to_usd := v_inv.fx_rate_to_usd;
  elsif new.fx_rate_to_usd is null or new.fx_rate_to_usd = 'NaN'::numeric or new.fx_rate_to_usd <= 0 then
    new.fx_rate_to_usd := v_inv.fx_rate_to_usd;
  end if;

  if new.proof_file_id is not null then
    if not exists (
      select 1
      from public.vault_files vf
      where vf.id = new.proof_file_id
        and vf.owner_client_id = v_inv.client_id
        and vf.category = 'payment_proof'
        and vf.archived_at is null
    ) then
      raise exception 'Payment proof attachment must reference an active payment_proof vault file belonging to the invoice client.';
    end if;
  end if;

  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if new.amount_cents > v_remaining then
    raise exception 'Payment amount (%) exceeds remaining invoice balance (%).', new.amount_cents, v_remaining;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_payment_invariants() from public, anon, authenticated;

-- Enforce combined submitted-payment cap in an AFTER trigger so unique reference
-- constraints fire first and distinct pending submissions still roll back atomically.
create or replace function public.enforce_payment_pending_balance_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_remaining bigint;
  v_pending_cents bigint;
begin
  if new.status <> 'submitted'::public.payment_status then
    return new;
  end if;

  select * into v_inv from public.invoices where id = new.invoice_id;
  if not found then
    return new;
  end if;

  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents)::bigint;
  select coalesce(sum(p.amount_cents), 0)::bigint into v_pending_cents
    from public.payments p
   where p.invoice_id = v_inv.id
     and p.status = 'submitted'::public.payment_status;

  if v_pending_cents > v_remaining then
    raise exception 'Combined pending payment submissions exceed remaining invoice balance.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_payment_pending_balance_cap() from public, anon, authenticated;
drop trigger if exists payments_enforce_pending_balance_cap on public.payments;
create trigger payments_enforce_pending_balance_cap
  after insert or update of amount_cents, status on public.payments
  for each row execute function public.enforce_payment_pending_balance_cap();

-- -----------------------------------------------------------------------------
-- 3. Block Resurrecting Cancelled/Completed Orders & Fix Auto-Accept Cron / Milestones
-- -----------------------------------------------------------------------------
create or replace function public.resolve_order_cancellation_atomic(
  p_request_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_req public.cancellation_requests;
  v_ord public.orders;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if p_decision not in ('approved', 'declined') then
    raise exception 'Invalid cancellation decision.';
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'Cancellation request not found or already resolved.';
  end if;

  select * into v_ord from public.orders where id = v_req.order_id for update;

  update public.cancellation_requests
    set status = p_decision,
        resolution_notes = nullif(btrim(coalesce(p_resolution_notes, '')), ''),
        resolved_by = v_admin,
        resolved_at = now()
    where id = v_req.id;

  if p_decision = 'approved' and v_ord.status not in ('completed'::public.order_status, 'cancelled'::public.order_status) then
    update public.orders
      set status = 'cancelled'::public.order_status
      where id = v_ord.id;

    -- Disarm any open submitted deliverables so auto-accept cron can never bill a cancelled order
    update public.deliverables
      set auto_accept_at = null
      where order_id = v_ord.id
        and status = 'submitted'::public.deliverable_status;
  end if;

  insert into public.notifications (recipient_id, category, title, body, href)
  values (
    v_ord.client_id,
    'order',
    'Cancellation Request ' || initcap(p_decision) || ' — ' || v_ord.code,
    coalesce(nullif(btrim(coalesce(p_resolution_notes, '')), ''), 'Your cancellation request has been ' || p_decision || '.'),
    '/portal/orders/' || v_ord.id::text
  );

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_ord.client_id, v_ord.id, 'cancellation_request', v_req.id,
    'order.cancellation_' || p_decision,
    initcap(p_decision) || ' cancellation request for ' || v_ord.code,
    jsonb_build_object('decision', p_decision, 'resolution_notes', nullif(btrim(coalesce(p_resolution_notes, '')), ''))
  );

  return jsonb_build_object('request_id', v_req.id, 'decision', p_decision, 'order_id', v_ord.id);
end;
$$;

revoke all on function public.resolve_order_cancellation_atomic(uuid, uuid, text, text) from public, anon;
grant execute on function public.resolve_order_cancellation_atomic(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.block_deliverables_on_terminal_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  select o.status into v_status from public.orders o where o.id = new.order_id;
  if not found then
    raise exception 'Parent order not found for deliverable.';
  end if;
  if v_status in ('cancelled'::public.order_status, 'completed'::public.order_status) then
    raise exception 'Deliverables cannot be created on % orders.', v_status;
  end if;
  return new;
end;
$$;

revoke all on function public.block_deliverables_on_terminal_order() from public, anon, authenticated;
drop trigger if exists deliverables_block_terminal_order on public.deliverables;
create trigger deliverables_block_terminal_order
  after insert on public.deliverables
  for each row execute function public.block_deliverables_on_terminal_order();

create or replace function public.review_order_deliverable(
  p_deliverable_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_actor uuid;
  v_deliv public.deliverables;
  v_order public.orders;
  v_invoiced_cents bigint;
  v_balance_cents int;
  v_fx numeric := 1.000000;
  v_final_inv_id uuid := null;
  v_has_unpaid boolean;
  v_next_order_status public.order_status;
begin
  if p_decision not in ('accepted', 'revision_requested') then
    raise exception 'Invalid deliverable decision.';
  end if;

  if v_caller_role = 'service_role' then
    v_actor := p_actor_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Client authentication required to review deliverables.';
    end if;
    if p_actor_id is not null and p_actor_id is distinct from v_caller_uid then
      raise exception 'Actor mismatch: p_actor_id must match authenticated caller.';
    end if;
    v_actor := v_caller_uid;
  end if;

  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'client'::public.user_role and p.is_active is true
  ) then
    raise exception 'Active client account required to review deliverables.';
  end if;

  select * into v_deliv from public.deliverables where id = p_deliverable_id for update;
  if not found then
    raise exception 'Deliverable not found.';
  end if;

  select * into v_order from public.orders where id = v_deliv.order_id for update;
  if v_order.client_id is distinct from v_actor then
    raise exception 'Unauthorized to review this deliverable.';
  end if;

  if v_order.status in ('cancelled'::public.order_status, 'completed'::public.order_status) then
    raise exception 'Deliverables cannot be reviewed on % orders.', v_order.status;
  end if;

  if v_deliv.status <> 'submitted'::public.deliverable_status then
    raise exception 'Deliverable has already been reviewed.';
  end if;

  if p_decision = 'revision_requested' then
    if v_order.revisions_used >= v_order.revisions_included then
      raise exception 'Included revisions exhausted (% of %). Please request a paid revision or scope extension.', v_order.revisions_used, v_order.revisions_included;
    end if;

    update public.deliverables
      set status = 'revision_requested'::public.deliverable_status,
          client_feedback = p_feedback,
          reviewed_by = v_actor,
          reviewed_at = now()
      where id = v_deliv.id;

    update public.orders
      set status = 'revision_requested'::public.order_status,
          revisions_used = revisions_used + 1
      where id = v_order.id;

    insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
    values (
      v_actor, 'client', v_order.client_id, v_order.id, 'deliverable', v_deliv.id,
      'deliverable.revision_requested', 'Requested revision on deliverable ' || v_deliv.code,
      jsonb_build_object('feedback', p_feedback, 'revisions_used', v_order.revisions_used + 1)
    );

    return jsonb_build_object(
      'status', p_decision,
      'order_id', v_order.id,
      'order_status', 'revision_requested'
    );
  end if;

  update public.deliverables
    set status = 'accepted'::public.deliverable_status,
        client_feedback = p_feedback,
        reviewed_by = v_actor,
        reviewed_at = now()
    where id = v_deliv.id;

  if v_deliv.milestone_id is not null then
    update public.order_milestones
      set status = 'approved', completed_at = coalesce(completed_at, now())
      where id = v_deliv.milestone_id;
  end if;

  v_next_order_status := v_order.status;

  if v_deliv.is_final_delivery is true then
    -- Exclude draft, void, and paid-revision addendum invoices from contract balance computation
    select coalesce(sum(i.total_cents), 0)::bigint
      into v_invoiced_cents
      from public.invoices i
      where i.order_id = v_order.id
        and i.revision_grant_order_id is null
        and i.status not in ('draft'::public.invoice_status, 'void'::public.invoice_status);

    v_balance_cents := greatest(0::bigint, v_order.total_cents::bigint - v_invoiced_cents)::int;

    if v_balance_cents > 0 then
      select coalesce(i.fx_rate_to_usd, v_order.fx_rate_to_usd, 1.000000) into v_fx
        from public.invoices i
       where i.order_id = v_order.id
         and i.currency = v_order.currency
         and i.status not in ('draft'::public.invoice_status, 'void'::public.invoice_status)
       order by i.created_at desc
       limit 1;
      v_fx := coalesce(v_fx, v_order.fx_rate_to_usd, 1.000000);

      insert into public.invoices (
        client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
        subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
        due_at, notes
      )
      values (
        v_order.client_id, v_order.id, false, 'draft'::public.invoice_status, v_order.currency, v_fx,
        v_balance_cents, 0, 0, 0, v_balance_cents,
        current_date + 7,
        'Final balance settlement for ' || v_order.code || ': ' || v_order.title
      )
      returning id into v_final_inv_id;

      insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
      values (
        v_final_inv_id,
        0,
        'Final Balance Settlement — ' || v_order.code || ': ' || v_order.title,
        1,
        v_balance_cents
      );

      perform set_config('app.invoice_status_transition', 'on', true);
      update public.invoices
        set status = 'issued'::public.invoice_status,
            issued_at = now()
        where id = v_final_inv_id;

      insert into public.notifications (recipient_id, category, title, body, href)
      values (
        v_order.client_id,
        'invoice',
        'Final Balance Invoice Ready for ' || v_order.code,
        'Your deliverable sign-off is recorded. Settle the remaining balance invoice to complete the contract.',
        '/portal/invoices/' || v_final_inv_id::text
      );
    end if;

    -- Only open issued/partially_paid/overdue invoices hold completion (never unsent drafts)
    select exists (
      select 1
      from public.invoices i
      where i.order_id = v_order.id
        and i.status in (
          'issued'::public.invoice_status,
          'partially_paid'::public.invoice_status,
          'overdue'::public.invoice_status
        )
    ) into v_has_unpaid;

    if not v_has_unpaid then
      v_next_order_status := 'completed'::public.order_status;
      update public.orders
        set status = 'completed'::public.order_status,
            progress_percent = 100,
            completed_at = coalesce(completed_at, now())
        where id = v_order.id;

      if v_order.completed_at is null and v_order.status <> 'completed'::public.order_status then
        update public.client_profiles
          set completed_orders_count = completed_orders_count + 1
          where user_id = v_order.client_id;
      end if;
    else
      v_next_order_status := 'delivered'::public.order_status;
      update public.orders
        set status = 'delivered'::public.order_status,
            progress_percent = greatest(progress_percent, 98)
        where id = v_order.id;
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor, 'client', v_order.client_id, v_order.id, 'deliverable', v_deliv.id,
    'deliverable.accepted', 'Accepted deliverable ' || v_deliv.code,
    jsonb_build_object('final_invoice_id', v_final_inv_id, 'order_status', v_next_order_status)
  );

  return jsonb_build_object(
    'status', p_decision,
    'order_id', v_order.id,
    'order_status', v_next_order_status,
    'final_invoice_id', v_final_inv_id
  );
end;
$$;

revoke all on function public.review_order_deliverable(uuid, uuid, text, text) from public, anon;
grant execute on function public.review_order_deliverable(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.mark_overdue_invoices_atomic()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_rec record;
  v_due_cents int;
  v_client_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  perform set_config('app.invoice_status_transition', 'on', true);

  for v_rec in
    update public.invoices
       set status = 'overdue'::public.invoice_status
     where status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
       and due_at is not null
       and due_at < current_date
    returning id, client_id, order_id, code, currency, total_cents, amount_paid_cents, credited_cents
  loop
    v_due_cents := greatest(0, v_rec.total_cents - v_rec.amount_paid_cents - v_rec.credited_cents);

    insert into public.audit_logs (actor_role, client_id, order_id, entity_type, entity_id, action, summary)
    values (
      'system', v_rec.client_id, v_rec.order_id, 'invoice', v_rec.id,
      'invoice.overdue', 'Marked invoice ' || v_rec.code || ' overdue'
    );

    insert into public.notifications (recipient_id, category, title, body, href)
    values (
      v_rec.client_id,
      'invoice',
      'Invoice Overdue: ' || v_rec.code,
      'Balance due: ' || v_rec.currency || ' ' || to_char(v_due_cents / 100.0, 'FM999,999,990.00'),
      '/portal/invoices/' || v_rec.id::text
    );

    select p.email into v_client_email
      from public.profiles p
     where p.id = v_rec.client_id;

    if v_client_email is not null and btrim(v_client_email) <> '' then
      insert into public.email_outbox (to_email, template, subject, payload, entity_type, entity_id)
      values (
        v_client_email,
        'invoice_overdue',
        'Action Required: Invoice ' || v_rec.code || ' is Overdue',
        jsonb_build_object(
          'message',
          'Invoice ' || v_rec.code || ' (' || v_rec.currency || ' ' || to_char(v_due_cents / 100.0, 'FM999,999,990.00') || ' remaining balance) is now past its due date. Please submit payment proof or contact support.',
          'actionUrl',
          'https://redwan.work/portal/invoices/' || v_rec.id::text
        ),
        'invoice',
        v_rec.id
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.mark_overdue_invoices_atomic() from public, anon, authenticated;
grant execute on function public.mark_overdue_invoices_atomic() to service_role;

create or replace function public.run_auto_accept_deliverables()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_invoiced_cents bigint;
  v_balance_cents int;
  v_fx numeric := 1.000000;
  v_final_inv_id uuid;
  v_has_unpaid boolean;
  v_client_email text;
  v_count int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  for v_rec in
    select
      d.id as deliverable_id,
      d.code as deliverable_code,
      d.order_id,
      d.milestone_id,
      d.is_final_delivery,
      o.client_id,
      o.code as order_code,
      o.title as order_title,
      o.currency as order_currency,
      o.fx_rate_to_usd as order_fx_rate,
      o.total_cents as order_total_cents,
      o.status as order_status,
      o.completed_at as order_completed_at
    from public.deliverables d
    join public.orders o on o.id = d.order_id
    where d.status = 'submitted'::public.deliverable_status
      and d.auto_accept_at is not null
      and d.auto_accept_at <= now()
      and o.status not in ('cancelled'::public.order_status, 'completed'::public.order_status)
    for update of d, o skip locked
  loop
    v_final_inv_id := null;

    update public.deliverables
      set status = 'accepted'::public.deliverable_status,
          reviewed_at = now(),
          client_feedback = 'Auto-accepted after review window elapsed without revision request.'
      where id = v_rec.deliverable_id;

    if v_rec.milestone_id is not null then
      update public.order_milestones
        set status = 'approved',
            completed_at = coalesce(completed_at, now())
        where id = v_rec.milestone_id;
    end if;

    if v_rec.is_final_delivery is true then
      select coalesce(sum(i.total_cents), 0)::bigint
        into v_invoiced_cents
        from public.invoices i
        where i.order_id = v_rec.order_id
          and i.revision_grant_order_id is null
          and i.status not in ('draft'::public.invoice_status, 'void'::public.invoice_status);

      v_balance_cents := greatest(0::bigint, v_rec.order_total_cents::bigint - v_invoiced_cents)::int;

      if v_balance_cents > 0 then
        select coalesce(i.fx_rate_to_usd, v_rec.order_fx_rate, 1.000000) into v_fx
          from public.invoices i
         where i.order_id = v_rec.order_id
           and i.currency = v_rec.order_currency
           and i.status not in ('draft'::public.invoice_status, 'void'::public.invoice_status)
         order by i.created_at desc
         limit 1;
        v_fx := coalesce(v_fx, v_rec.order_fx_rate, 1.000000);

        insert into public.invoices (
          client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
          subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
          due_at, notes
        )
        values (
          v_rec.client_id, v_rec.order_id, false, 'draft'::public.invoice_status, v_rec.order_currency, v_fx,
          v_balance_cents, 0, 0, 0, v_balance_cents,
          current_date + 7,
          'Final balance settlement for ' || v_rec.order_code || ': ' || v_rec.order_title
        )
        returning id into v_final_inv_id;

        insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
        values (
          v_final_inv_id,
          0,
          'Final Balance Settlement — ' || v_rec.order_code || ': ' || v_rec.order_title,
          1,
          v_balance_cents
        );

        perform set_config('app.invoice_status_transition', 'on', true);
        update public.invoices
          set status = 'issued'::public.invoice_status,
              issued_at = now()
          where id = v_final_inv_id;
      end if;

      select exists (
        select 1 from public.invoices i
        where i.order_id = v_rec.order_id
          and i.status in (
            'issued'::public.invoice_status,
            'partially_paid'::public.invoice_status,
            'overdue'::public.invoice_status
          )
      ) into v_has_unpaid;

      if not v_has_unpaid then
        update public.orders
          set status = 'completed'::public.order_status,
              progress_percent = 100,
              completed_at = coalesce(completed_at, now())
          where id = v_rec.order_id;

        if v_rec.order_completed_at is null and v_rec.order_status <> 'completed'::public.order_status then
          update public.client_profiles
            set completed_orders_count = completed_orders_count + 1
            where user_id = v_rec.client_id;
        end if;
      else
        update public.orders
          set status = 'delivered'::public.order_status,
              progress_percent = greatest(progress_percent, 98)
          where id = v_rec.order_id;
      end if;
    end if;

    insert into public.notifications (recipient_id, category, title, body, href)
    values (
      v_rec.client_id,
      'deliverable',
      'Deliverable Auto-Accepted: ' || v_rec.deliverable_code,
      'The review window for ' || v_rec.order_code || ' elapsed with no revision request and deliverable ' || v_rec.deliverable_code || ' has been accepted.',
      '/portal/orders/' || v_rec.order_id::text
    );

    select p.email into v_client_email
      from public.profiles p
     where p.id = v_rec.client_id;

    if v_client_email is not null and btrim(v_client_email) <> '' then
      insert into public.email_outbox (to_email, template, subject, payload, entity_type, entity_id)
      values (
        v_client_email,
        'deliverable_auto_accepted',
        'Deliverable ' || v_rec.deliverable_code || ' Auto-Accepted — ' || v_rec.order_code,
        jsonb_build_object(
          'message',
          'Deliverable ' || v_rec.deliverable_code || ' for ' || v_rec.order_code || ' (' || v_rec.order_title || ') was automatically accepted after the review window elapsed.' ||
          case when v_final_inv_id is not null then ' A final balance invoice has been issued in your Client Portal.' else '' end,
          'actionUrl',
          'https://redwan.work/portal/orders/' || v_rec.order_id::text
        ),
        'deliverable',
        v_rec.deliverable_id
      );
    end if;

    insert into public.audit_logs (actor_role, client_id, order_id, entity_type, entity_id, action, summary)
    values (
      'system', v_rec.client_id, v_rec.order_id, 'deliverable', v_rec.deliverable_id,
      'deliverable.auto_accepted', 'Auto-accepted deliverable ' || v_rec.deliverable_code
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.run_auto_accept_deliverables() from public, anon, authenticated;
grant execute on function public.run_auto_accept_deliverables() to service_role;

-- -----------------------------------------------------------------------------
-- 4. Retainer Plan FX & Quarterly/Annual (3x / 12x) Cycle Renewal Billing
-- -----------------------------------------------------------------------------
alter table public.retainer_plans
  add column if not exists fx_rate_to_usd numeric(14, 6) not null default 1.000000;

alter table public.retainer_plans
  drop constraint if exists retainer_plans_fx_positive_check;

alter table public.retainer_plans
  add constraint retainer_plans_fx_positive_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

create or replace function public.renew_retainer_cycle_atomic(
  p_retainer_id uuid,
  p_admin_id uuid default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid := null;
  v_ret public.retainer_plans;
  v_days int;
  v_cycle_months int;
  v_cycle_fee_bigint bigint;
  v_cycle_fee_cents int;
  v_next_start date;
  v_next_end date;
  v_latest_fx numeric := null;
  v_fx numeric := 1.000000;
  v_inv_id uuid;
  v_inv_code text;
  v_client_email text;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  select * into v_ret from public.retainer_plans where id = p_retainer_id for update;
  if not found then
    raise exception 'Retainer plan not found.';
  end if;
  if v_ret.status <> 'active' then
    raise exception 'Only active retainer plans can be renewed.';
  end if;

  if v_admin is null and not coalesce(p_force, false) and v_ret.next_invoice_date > current_date then
    return jsonb_build_object(
      'retainer_id', v_ret.id,
      'skipped', true,
      'reason', 'not_due',
      'next_invoice_date', v_ret.next_invoice_date
    );
  end if;

  v_cycle_months := case v_ret.billing_cycle
    when 'annual' then 12
    when 'quarterly' then 3
    else 1
  end;

  v_cycle_fee_bigint := v_ret.monthly_fee_cents::bigint * v_cycle_months::bigint;
  if v_cycle_fee_bigint <= 0 or v_cycle_fee_bigint > 2147483647 then
    raise exception 'Retainer cycle fee exceeds supported amount bounds.';
  end if;
  v_cycle_fee_cents := v_cycle_fee_bigint::int;

  if upper(v_ret.currency) = 'USD' then
    v_fx := 1.000000;
  else
    select i.fx_rate_to_usd into v_latest_fx
      from public.invoices i
     where i.client_id = v_ret.client_id
       and i.currency = v_ret.currency
       and i.status <> 'void'::public.invoice_status
       and i.fx_rate_to_usd > 0
     order by i.created_at desc
     limit 1;
    v_fx := case
      when v_ret.fx_rate_to_usd is not null and v_ret.fx_rate_to_usd <> 1.000000 then v_ret.fx_rate_to_usd
      else coalesce(v_latest_fx, v_ret.fx_rate_to_usd, 1.000000)
    end;
  end if;
  v_fx := round(v_fx, 6);

  v_days := case v_ret.billing_cycle
    when 'annual' then 365
    when 'quarterly' then 90
    else 30
  end;

  v_next_start := greatest(current_date, v_ret.current_period_end);
  v_next_end := v_next_start + v_days;

  update public.retainer_plans
    set current_period_start = v_next_start,
        current_period_end = v_next_end,
        next_invoice_date = v_next_end,
        hours_used_current_period = 0
    where id = v_ret.id;

  insert into public.invoices (
    client_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    due_at, notes
  )
  values (
    v_ret.client_id, false, 'draft'::public.invoice_status, v_ret.currency, v_fx,
    v_cycle_fee_cents, 0, 0, 0, v_cycle_fee_cents,
    current_date + 7,
    'Retainer cycle renewal (' || v_ret.billing_cycle || ') — ' || v_ret.title || ' (' || v_next_start || ' to ' || v_next_end || ')'
  )
  returning id, code into v_inv_id, v_inv_code;

  insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
  values (
    v_inv_id,
    0,
    v_ret.title || ' (' || initcap(v_ret.billing_cycle) || ' Retainer: ' || v_next_start || ' – ' || v_next_end || ')',
    v_cycle_months,
    v_ret.monthly_fee_cents
  );

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'issued'::public.invoice_status,
        issued_at = now()
    where id = v_inv_id;

  insert into public.notifications (recipient_id, category, title, body, href)
  values (
    v_ret.client_id,
    'invoice',
    'Retainer Cycle Renewed: ' || v_inv_code,
    v_ret.title || ' renewed for ' || v_next_start || ' – ' || v_next_end || ' (' || v_ret.hours_per_month || 'h/mo reset).',
    '/portal/invoices/' || v_inv_id::text
  );

  select p.email into v_client_email
    from public.profiles p
   where p.id = v_ret.client_id;

  if v_client_email is not null and btrim(v_client_email) <> '' then
    insert into public.email_outbox (to_email, template, subject, payload, entity_type, entity_id)
    values (
      v_client_email,
      'retainer_renewed',
      'Retainer Renewed — Invoice ' || v_inv_code || ' (' || v_ret.title || ')',
      jsonb_build_object(
        'message',
        'Your ' || v_ret.title || ' retainer has renewed for ' || v_next_start || ' to ' || v_next_end || '. Invoice ' || v_inv_code || ' (' || v_ret.currency || ' ' || to_char(v_cycle_fee_cents / 100.0, 'FM999,999,990.00') || ') is ready in your Client Portal.',
        'actionUrl',
        'https://redwan.work/portal/invoices/' || v_inv_id::text
      ),
      'invoice',
      v_inv_id
    );
  end if;

  insert into public.audit_logs (actor_id, actor_role, client_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, case when v_admin is null then 'system' else 'admin' end,
    v_ret.client_id, 'retainer_plan', v_ret.id,
    'retainer.renewed', 'Renewed retainer ' || v_ret.title || ' and issued ' || v_inv_code,
    jsonb_build_object('invoice_id', v_inv_id, 'invoice_code', v_inv_code, 'cycle_months', v_cycle_months, 'total_cents', v_cycle_fee_cents, 'period_start', v_next_start, 'period_end', v_next_end)
  );

  return jsonb_build_object(
    'retainer_id', v_ret.id,
    'invoice_id', v_inv_id,
    'invoice_code', v_inv_code,
    'total_cents', v_cycle_fee_cents,
    'period_start', v_next_start,
    'period_end', v_next_end
  );
end;
$$;

revoke all on function public.renew_retainer_cycle_atomic(uuid, uuid, boolean) from public, anon;
grant execute on function public.renew_retainer_cycle_atomic(uuid, uuid, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Multi-Currency FX Propagation on Admin Orders & Paid Revisions
-- -----------------------------------------------------------------------------
drop function if exists public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int, text
);

create or replace function public.create_admin_order_atomic(
  p_admin_id uuid,
  p_client_id uuid,
  p_title text,
  p_description text,
  p_pillar public.service_pillar,
  p_total_cents int,
  p_deposit_percent int,
  p_requires_roe boolean,
  p_due_days int,
  p_currency text default 'USD',
  p_fx_rate_to_usd numeric default 1.000000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_currency text;
  v_fx numeric := 1.000000;
  v_effective_roe boolean;
  v_deposit_cents int;
  v_initial_status public.order_status;
  v_order_id uuid;
  v_order_code text;
  v_inv_id uuid := null;
  v_m0 int;
  v_m1 int;
  v_m2 int;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  if p_total_cents < 0 or p_deposit_percent < 0 or p_deposit_percent > 100 then
    raise exception 'Invalid order amount or deposit_percent.';
  end if;

  v_currency := upper(btrim(coalesce(nullif(p_currency, ''), 'USD')));
  if v_currency not in ('USD', 'BDT', 'EUR', 'GBP') then
    raise exception 'Unsupported order currency: %.', v_currency;
  end if;

  if p_fx_rate_to_usd is null or p_fx_rate_to_usd = 'NaN'::numeric or p_fx_rate_to_usd <= 0 then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
  end if;
  v_fx := case when v_currency = 'USD' then 1.000000 else round(p_fx_rate_to_usd, 6) end;
  if v_currency = 'USD' and round(p_fx_rate_to_usd, 6) <> 1.000000 then
    raise exception 'USD orders must use fx_rate_to_usd = 1.000000.';
  end if;

  v_effective_roe := coalesce(p_requires_roe, false) or (p_pillar = 'cybersecurity'::public.service_pillar);
  v_deposit_cents := round((p_total_cents::numeric * p_deposit_percent::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, title, description, pillar, pricing_model, status, requires_roe,
    currency, fx_rate_to_usd, subtotal_cents, discount_cents, tax_cents, total_cents,
    deposit_percent, due_at
  )
  values (
    p_client_id, btrim(p_title), p_description, p_pillar, 'fixed_package'::public.pricing_model,
    v_initial_status, v_effective_roe,
    v_currency, v_fx, p_total_cents, 0, 0, p_total_cents,
    p_deposit_percent, now() + make_interval(days => greatest(1, coalesce(p_due_days, 10)))
  )
  returning id, code into v_order_id, v_order_code;

  v_m0 := round(p_total_cents::numeric * 0.30)::int;
  v_m1 := round(p_total_cents::numeric * 0.50)::int;
  v_m2 := greatest(0, p_total_cents - v_m0 - v_m1);

  insert into public.order_milestones (order_id, position, title, weight_percent, amount_cents, currency, status)
  values
    (v_order_id, 0, 'Kickoff & Scope Alignment', 30, v_m0, v_currency, 'in_progress'),
    (v_order_id, 1, 'Core Execution & Verification', 50, v_m1, v_currency, 'pending'),
    (v_order_id, 2, 'Final Deliverable Handover & Sign-Off', 20, v_m2, v_currency, 'pending');

  if v_deposit_cents > 0 then
    insert into public.invoices (
      client_id, order_id, status, is_deposit_invoice, currency, fx_rate_to_usd,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      p_client_id, v_order_id, 'draft'::public.invoice_status, true, v_currency, v_fx,
      v_deposit_cents, 0, 0, 0, v_deposit_cents,
      current_date + 5,
      'Kickoff deposit (' || p_deposit_percent || '%) for ' || v_order_code || ': ' || btrim(p_title)
    )
    returning id into v_inv_id;

    insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
    values (
      v_inv_id,
      0,
      'Kickoff Deposit (' || p_deposit_percent || '%) — ' || v_order_code || ': ' || btrim(p_title),
      1,
      v_deposit_cents
    );

    perform set_config('app.invoice_status_transition', 'on', true);
    update public.invoices
      set status = 'issued'::public.invoice_status,
          issued_at = now()
      where id = v_inv_id;
  end if;

  update public.client_profiles
    set total_orders_count = total_orders_count + 1
    where user_id = p_client_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'code', v_order_code,
    'deposit_invoice_id', v_inv_id,
    'status', v_initial_status,
    'currency', v_currency,
    'fx_rate_to_usd', v_fx
  );
end;
$$;

revoke all on function public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int, text, numeric
) from public, anon;
grant execute on function public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int, text, numeric
) to authenticated, service_role;

create or replace function public.create_paid_revision_invoice_atomic(
  p_order_id uuid,
  p_admin_id uuid,
  p_extra_revisions int,
  p_fee_cents int,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_ord public.orders;
  v_fx numeric := 1.000000;
  v_inv_id uuid;
  v_inv_code text;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  if p_extra_revisions is null or p_extra_revisions < 1 or p_fee_cents is null or p_fee_cents <= 0 then
    raise exception 'Positive extra revisions count and fee required.';
  end if;

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  select i.fx_rate_to_usd into v_fx
    from public.invoices i
   where i.order_id = v_ord.id
     and i.currency = v_ord.currency
     and i.status <> 'void'::public.invoice_status
     and i.fx_rate_to_usd > 0
   order by i.created_at desc
   limit 1;
  v_fx := round(coalesce(v_fx, v_ord.fx_rate_to_usd, 1.000000), 6);

  insert into public.invoices (
    client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    due_at, revision_grant_order_id, revision_grant_count, notes
  )
  values (
    v_ord.client_id, v_ord.id, false, 'draft'::public.invoice_status, v_ord.currency, v_fx,
    p_fee_cents, 0, 0, 0, p_fee_cents,
    current_date + 7, v_ord.id, p_extra_revisions,
    coalesce(nullif(btrim(p_summary), ''), 'Paid revision scope extension (' || p_extra_revisions || ' extra rounds) for ' || v_ord.code)
  )
  returning id, code into v_inv_id, v_inv_code;

  insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
  values (
    v_inv_id,
    0,
    coalesce(nullif(btrim(p_summary), ''), 'Additional Revision Rounds (' || p_extra_revisions || ') — ' || v_ord.code),
    1,
    p_fee_cents
  );

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'issued'::public.invoice_status,
        issued_at = now()
    where id = v_inv_id;

  insert into public.notifications (recipient_id, category, title, body, href)
  values (
    v_ord.client_id,
    'invoice',
    'Paid Revision Invoice Ready: ' || v_inv_code,
    'Once paid, ' || p_extra_revisions || ' additional revision round(s) will be unlocked on ' || v_ord.code || '.',
    '/portal/invoices/' || v_inv_id::text
  );

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_ord.client_id, v_ord.id, 'invoice', v_inv_id,
    'invoice.paid_revision_created', 'Issued paid revision invoice ' || v_inv_code || ' for ' || v_ord.code,
    jsonb_build_object('extra_revisions', p_extra_revisions, 'fee_cents', p_fee_cents, 'fx_rate_to_usd', v_fx)
  );

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'extra_revisions', p_extra_revisions);
end;
$$;

revoke all on function public.create_paid_revision_invoice_atomic(uuid, uuid, int, int, text) from public, anon;
grant execute on function public.create_paid_revision_invoice_atomic(uuid, uuid, int, int, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Engagement Authorization (RoE) Hardening & Atomic Sign-Off RPC
-- -----------------------------------------------------------------------------
create or replace function public.enforce_engagement_authorization_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ord public.orders;
  v_caller_role text := coalesce(auth.role(), '');
begin
  select * into v_ord from public.orders where id = new.order_id for update;
  if not found then
    raise exception 'Referenced order does not exist for Rules of Engagement.';
  end if;
  if v_ord.client_id is distinct from new.client_id then
    raise exception 'Engagement authorization client_id must match order client_id.';
  end if;
  if v_ord.requires_roe is not true then
    raise exception 'Rules of Engagement authorization is not applicable to this order.';
  end if;
  if v_ord.status in ('completed'::public.order_status, 'cancelled'::public.order_status) then
    raise exception 'Rules of Engagement cannot be signed on % orders.', v_ord.status;
  end if;
  if v_ord.roe_signed_at is not null then
    raise exception 'Rules of Engagement has already been signed for this order.';
  end if;
  if new.ownership_attested is not true then
    raise exception 'Ownership attestation is mandatory to execute Rules of Engagement.';
  end if;
  if new.authorized_targets is null
     or cardinality(new.authorized_targets) < 1
     or exists (
       select 1 from unnest(new.authorized_targets) as t(val)
       where btrim(coalesce(t.val, '')) = ''
     ) then
    raise exception 'At least one non-empty authorized target is required.';
  end if;

  if v_caller_role in ('authenticated', 'anon') then
    new.signed_at := now();
    if coalesce(current_setting('app.roe_rpc_sign', true), '') <> 'on' then
      new.signer_ip_hash := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_engagement_authorization_insert() from public, anon, authenticated;
drop trigger if exists engagement_authorizations_enforce_insert on public.engagement_authorizations;
create trigger engagement_authorizations_enforce_insert
  before insert on public.engagement_authorizations
  for each row execute function public.enforce_engagement_authorization_insert();

drop policy if exists "roe_insert_own_client" on public.engagement_authorizations;
create policy "roe_insert_own_client"
  on public.engagement_authorizations for insert
  with check (
    public.is_active_client()
    and client_id = (select auth.uid())
    and ownership_attested is true
    and cardinality(authorized_targets) >= 1
    and exists (
      select 1 from public.orders o
      where o.id = engagement_authorizations.order_id
        and o.client_id = (select auth.uid())
        and o.requires_roe is true
        and o.roe_signed_at is null
        and o.status not in ('completed'::public.order_status, 'cancelled'::public.order_status)
    )
  );

create or replace function public.sign_order_roe_atomic(
  p_order_id uuid,
  p_actor_id uuid,
  p_authorized_targets text[],
  p_excluded_systems text,
  p_testing_window_start timestamptz,
  p_testing_window_end timestamptz,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_signer_full_name text,
  p_signer_title text,
  p_signer_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_actor uuid;
  v_ord public.orders;
  v_now timestamptz := now();
  v_next_status public.order_status;
  v_roe_id uuid;
begin
  if v_caller_role = 'service_role' then
    v_actor := p_actor_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Active client authentication required to sign Rules of Engagement.';
    end if;
    if p_actor_id is not null and p_actor_id is distinct from v_caller_uid then
      raise exception 'Actor mismatch.';
    end if;
    v_actor := v_caller_uid;
  end if;

  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'client'::public.user_role and p.is_active is true
  ) then
    raise exception 'Active client account required.';
  end if;

  if p_testing_window_start is null or p_testing_window_end is null or p_testing_window_end <= p_testing_window_start then
    raise exception 'Testing window end must be strictly after start.';
  end if;
  if p_testing_window_end <= v_now then
    raise exception 'Testing window end must be in the future.';
  end if;

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found or v_ord.client_id is distinct from v_actor then
    raise exception 'Order not found or unauthorized.';
  end if;
  if v_ord.requires_roe is not true then
    raise exception 'Rules of Engagement is not required for this order.';
  end if;
  if v_ord.status in ('completed'::public.order_status, 'cancelled'::public.order_status) then
    raise exception 'Rules of Engagement cannot be signed on % orders.', v_ord.status;
  end if;
  if v_ord.roe_signed_at is not null then
    raise exception 'Rules of Engagement has already been signed for this order.';
  end if;

  perform set_config('app.roe_rpc_sign', 'on', true);
  insert into public.engagement_authorizations (
    order_id, client_id, authorized_targets, excluded_systems,
    testing_window_start, testing_window_end,
    emergency_contact_name, emergency_contact_phone,
    ownership_attested, signer_full_name, signer_title,
    signer_ip_hash, signed_at
  )
  values (
    v_ord.id, v_actor, p_authorized_targets, nullif(btrim(coalesce(p_excluded_systems, '')), ''),
    p_testing_window_start, p_testing_window_end,
    btrim(p_emergency_contact_name), btrim(p_emergency_contact_phone),
    true, btrim(p_signer_full_name), nullif(btrim(coalesce(p_signer_title, '')), ''),
    p_signer_ip_hash, v_now
  )
  returning id into v_roe_id;

  v_next_status := case
    when v_ord.status = 'pending_requirements'::public.order_status then 'in_progress'::public.order_status
    else v_ord.status
  end;

  update public.orders
    set roe_signed_at = v_now,
        status = v_next_status,
        progress_percent = case when v_next_status = 'in_progress'::public.order_status then greatest(progress_percent, 25) else progress_percent end
    where id = v_ord.id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor, 'client', v_ord.client_id, v_ord.id, 'engagement_authorization', v_roe_id,
    'roe.signed', 'Executed Rules of Engagement for ' || v_ord.code,
    jsonb_build_object('targets_count', cardinality(p_authorized_targets), 'signer_full_name', btrim(p_signer_full_name))
  );

  return jsonb_build_object('roe_id', v_roe_id, 'order_id', v_ord.id, 'order_code', v_ord.code, 'order_status', v_next_status, 'signed_at', v_now);
end;
$$;

revoke all on function public.sign_order_roe_atomic(uuid, uuid, text[], text, timestamptz, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.sign_order_roe_atomic(uuid, uuid, text[], text, timestamptz, timestamptz, text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Invoice Items, Credit Notes, Invoice Immutability, $0 Invoices & FX Rounding
-- -----------------------------------------------------------------------------
create or replace function public.guard_invoice_items_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status public.invoice_status;
  v_new_status public.invoice_status;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Invoice line items cannot be reassigned to a different invoice.';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select i.status into v_old_status from public.invoices i where i.id = old.invoice_id;
    if v_old_status is not null and v_old_status <> 'draft'::public.invoice_status then
      raise exception 'Cannot modify line items of a non-draft invoice.';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select i.status into v_new_status from public.invoices i where i.id = new.invoice_id;
    if v_new_status is not null and v_new_status <> 'draft'::public.invoice_status then
      raise exception 'Cannot modify line items of a non-draft invoice.';
    end if;
    return new;
  end if;

  return old;
end;
$$;

revoke all on function public.guard_invoice_items_immutability() from public, anon, authenticated;

create or replace function public.enforce_credit_note_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_remaining int;
begin
  select * into v_inv from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'Invoice not found for credit note.';
  end if;
  if v_inv.status not in (
    'issued'::public.invoice_status,
    'partially_paid'::public.invoice_status,
    'overdue'::public.invoice_status
  ) then
    raise exception 'Credit notes can only be issued against open invoices (status: %).', v_inv.status;
  end if;
  if new.client_id is distinct from v_inv.client_id then
    raise exception 'Credit note client_id must match invoice client_id.';
  end if;
  if new.currency is distinct from v_inv.currency then
    raise exception 'Credit note currency must match invoice currency.';
  end if;
  new.fx_rate_to_usd := v_inv.fx_rate_to_usd;
  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if new.amount_cents > v_remaining then
    raise exception 'Credit note amount exceeds remaining uncredited balance.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_credit_note_invariants() from public, anon, authenticated;

create or replace function public.apply_credit_note_to_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_new_credited int;
  v_new_status public.invoice_status;
begin
  select * into v_inv from public.invoices where id = new.invoice_id for update;
  if not found then
    return new;
  end if;

  v_new_credited := least(v_inv.total_cents - v_inv.amount_paid_cents, v_inv.credited_cents + new.amount_cents);
  v_new_status := case
    when (v_inv.amount_paid_cents + v_new_credited) >= v_inv.total_cents then 'paid'::public.invoice_status
    when v_inv.amount_paid_cents > 0 then 'partially_paid'::public.invoice_status
    else v_inv.status
  end;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set credited_cents = v_new_credited,
        status = v_new_status,
        paid_at = case when v_new_status = 'paid'::public.invoice_status then coalesce(paid_at, now()) else paid_at end
    where id = v_inv.id;

  if v_new_status = 'paid'::public.invoice_status then
    perform public._handle_invoice_paid_effects(v_inv.id);
  end if;

  return new;
end;
$$;

revoke all on function public.apply_credit_note_to_invoice() from public, anon, authenticated;

create or replace function public.void_invoice_atomic(p_invoice_id uuid, p_admin_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_inv public.invoices;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_inv.status not in ('draft'::public.invoice_status, 'issued'::public.invoice_status, 'overdue'::public.invoice_status) then
    raise exception 'Only draft, issued, or overdue invoices without settled payments can be voided.';
  end if;
  if v_inv.amount_paid_cents > 0 or v_inv.credited_cents > 0 then
    raise exception 'Invoices with settled payments or credit notes cannot be voided directly.';
  end if;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'void'::public.invoice_status
    where id = v_inv.id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary)
  values (v_admin, 'admin', v_inv.client_id, v_inv.order_id, 'invoice', v_inv.id, 'invoice.voided', 'Voided invoice ' || v_inv.code);

  return jsonb_build_object('invoice_id', v_inv.id, 'code', v_inv.code, 'status', 'void');
end;
$$;

revoke all on function public.void_invoice_atomic(uuid, uuid) from public, anon;
grant execute on function public.void_invoice_atomic(uuid, uuid) to authenticated, service_role;

create or replace function public.guard_invoice_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_items jsonb;
  v_caller_role text := coalesce(auth.role(), '');
begin
  if new.order_id is not null then
    select * into v_order from public.orders where id = new.order_id;
    if not found then
      raise exception 'Referenced order does not exist for invoice.';
    end if;
    if new.client_id is distinct from v_order.client_id then
      raise exception 'Invoice client_id must match parent order client_id.';
    end if;
    if new.currency is distinct from v_order.currency then
      raise exception 'Invoice currency (%) must match parent order currency (%).', new.currency, v_order.currency;
    end if;
  end if;

  if tg_op = 'INSERT' and v_caller_role in ('authenticated', 'anon') then
    if (
      new.status <> 'draft'::public.invoice_status
      or new.amount_paid_cents <> 0
      or new.credited_cents <> 0
      or new.paid_at is not null
    ) and coalesce(current_setting('app.invoice_status_transition', true), '') <> 'on' then
      raise exception 'Non-draft or settled invoices must be created through controlled atomic RPCs.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status
       and coalesce(current_setting('app.invoice_status_transition', true), '') <> 'on' then
      raise exception 'Invoice status transitions must execute through controlled atomic RPCs.';
    end if;

    if (
      new.amount_paid_cents is distinct from old.amount_paid_cents
      or new.credited_cents is distinct from old.credited_cents
      or new.paid_at is distinct from old.paid_at
    ) and coalesce(current_setting('app.invoice_status_transition', true), '') <> 'on' then
      raise exception 'Invoice settlement counters can only be updated by controlled atomic RPCs.';
    end if;

    if old.status <> 'draft'::public.invoice_status then
      if new.client_id is distinct from old.client_id
         or new.order_id is distinct from old.order_id
         or new.is_deposit_invoice is distinct from old.is_deposit_invoice
         or new.milestone_id is distinct from old.milestone_id
         or new.revision_grant_order_id is distinct from old.revision_grant_order_id
         or new.revision_grant_count is distinct from old.revision_grant_count
         or new.number is distinct from old.number
         or new.currency is distinct from old.currency
         or new.fx_rate_to_usd is distinct from old.fx_rate_to_usd
         or new.subtotal_cents is distinct from old.subtotal_cents
         or new.discount_cents is distinct from old.discount_cents
         or new.tax_rate_bps is distinct from old.tax_rate_bps
         or new.tax_cents is distinct from old.tax_cents
         or new.total_cents is distinct from old.total_cents
         or (old.issued_at is not null and new.issued_at is distinct from old.issued_at)
         or new.due_at is distinct from old.due_at
         or (old.immutable_snapshot is not null and new.immutable_snapshot is distinct from old.immutable_snapshot)
      then
        raise exception 'Issued invoices are immutable and cannot modify financial totals, currency, FX rate, dates, metadata links, or snapshot.';
      end if;
    end if;
  end if;

  if new.status <> 'draft'::public.invoice_status
     and (tg_op = 'INSERT' or old.status = 'draft'::public.invoice_status)
     and new.immutable_snapshot is null
  then
    new.issued_at := coalesce(new.issued_at, now());
    if tg_op = 'UPDATE' then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'position', ii.position,
            'description', ii.description,
            'qty', ii.qty,
            'unit_price_cents', ii.unit_price_cents,
            'line_total_cents', ii.line_total_cents
          )
          order by ii.position
        ),
        '[]'::jsonb
      )
        into v_items
        from public.invoice_items ii
        where ii.invoice_id = new.id;
    else
      v_items := '[]'::jsonb;
    end if;

    new.immutable_snapshot := jsonb_build_object(
      'code', 'INV-' || new.number::text,
      'client_id', new.client_id,
      'order_id', new.order_id,
      'is_deposit_invoice', new.is_deposit_invoice,
      'currency', new.currency,
      'fx_rate_to_usd', new.fx_rate_to_usd,
      'subtotal_cents', new.subtotal_cents,
      'discount_cents', new.discount_cents,
      'tax_rate_bps', new.tax_rate_bps,
      'tax_cents', new.tax_cents,
      'total_cents', new.total_cents,
      'issued_at', new.issued_at,
      'due_at', new.due_at,
      'items', v_items
    );
  end if;

  return new;
end;
$$;

revoke all on function public.guard_invoice_immutable_fields() from public, anon, authenticated;

create or replace function public.issue_invoice_atomic(
  p_client_id uuid,
  p_order_id uuid,
  p_is_deposit boolean,
  p_currency text,
  p_fx_rate_to_usd numeric,
  p_subtotal_cents int,
  p_discount_cents int,
  p_tax_rate_bps int,
  p_due_days int,
  p_notes text,
  p_item_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_inv_id uuid;
  v_inv_code text;
  v_currency text;
  v_fx numeric;
  v_taxable bigint;
  v_tax_cents bigint;
  v_total_cents bigint;
begin
  if v_caller_role in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'Admin authorization required to issue invoices.';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, 'USD')));
  if p_fx_rate_to_usd is not null and (p_fx_rate_to_usd = 'NaN'::numeric or p_fx_rate_to_usd <= 0) then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
  end if;
  v_fx := round(coalesce(p_fx_rate_to_usd, 1.000000), 6);
  if v_currency = 'USD' and v_fx <> 1.000000 then
    raise exception 'USD invoices must use fx_rate_to_usd = 1.000000.';
  end if;

  if p_subtotal_cents is null or p_subtotal_cents <= 0 or p_discount_cents is null or p_discount_cents < 0 or p_discount_cents > p_subtotal_cents then
    raise exception 'Invalid invoice subtotal or discount.';
  end if;
  if p_tax_rate_bps is null or p_tax_rate_bps < 0 or p_tax_rate_bps > 10000 then
    raise exception 'Invalid tax_rate_bps.';
  end if;

  v_taxable := p_subtotal_cents::bigint - p_discount_cents::bigint;
  v_tax_cents := round((v_taxable::numeric * p_tax_rate_bps::numeric) / 10000.0)::bigint;
  v_total_cents := v_taxable + v_tax_cents;
  if v_total_cents <= 0 then
    raise exception 'Issued invoice total must be positive.';
  end if;
  if v_total_cents > 2147483647 then
    raise exception 'Invoice total exceeds supported maximum amount.';
  end if;

  insert into public.invoices (
    client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    due_at, notes
  )
  values (
    p_client_id, p_order_id, coalesce(p_is_deposit, false), 'draft'::public.invoice_status,
    v_currency, v_fx,
    p_subtotal_cents, p_discount_cents, p_tax_rate_bps, v_tax_cents::int, v_total_cents::int,
    current_date + greatest(1, coalesce(p_due_days, 7)), p_notes
  )
  returning id, code into v_inv_id, v_inv_code;

  insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
  values (v_inv_id, 0, btrim(p_item_description), 1, p_subtotal_cents);

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'issued'::public.invoice_status,
        issued_at = now()
    where id = v_inv_id;

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'total_cents', v_total_cents::int);
end;
$$;

revoke all on function public.issue_invoice_atomic(uuid, uuid, boolean, text, numeric, int, int, int, int, text, text) from public, anon;
grant execute on function public.issue_invoice_atomic(uuid, uuid, boolean, text, numeric, int, int, int, int, text, text) to authenticated, service_role;

create or replace function public.create_draft_invoice_multi_atomic(
  p_client_id uuid,
  p_order_id uuid,
  p_milestone_id uuid,
  p_currency text,
  p_fx_rate_to_usd numeric,
  p_discount_cents int,
  p_tax_rate_bps int,
  p_due_days int,
  p_payment_instructions text,
  p_notes text,
  p_items jsonb,
  p_issue_immediately boolean default false,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_currency text;
  v_fx numeric;
  v_item jsonb;
  v_pos int := 0;
  v_qty int;
  v_unit int;
  v_desc text;
  v_subtotal bigint := 0;
  v_discount int := greatest(0, coalesce(p_discount_cents, 0));
  v_tax_bps int := coalesce(p_tax_rate_bps, 0);
  v_taxable bigint;
  v_tax_cents bigint;
  v_total_cents bigint;
  v_inv_id uuid;
  v_inv_code text;
  v_status public.invoice_status;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, 'USD')));
  if p_fx_rate_to_usd is not null and (p_fx_rate_to_usd = 'NaN'::numeric or p_fx_rate_to_usd <= 0) then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
  end if;
  v_fx := round(coalesce(p_fx_rate_to_usd, 1.000000), 6);
  if v_currency = 'USD' and v_fx <> 1.000000 then
    raise exception 'USD invoices must use fx_rate_to_usd = 1.000000.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Invoice must contain between 1 and 50 line items.';
  end if;

  if v_tax_bps < 0 or v_tax_bps > 10000 then
    raise exception 'Invalid tax_rate_bps.';
  end if;

  if p_milestone_id is not null then
    if p_order_id is null or not exists (
      select 1 from public.order_milestones m where m.id = p_milestone_id and m.order_id = p_order_id
    ) then
      raise exception 'Milestone must belong to the referenced order.';
    end if;
    perform 1 from public.order_milestones where id = p_milestone_id for update;
    if exists (
      select 1 from public.invoices i
      where i.milestone_id = p_milestone_id
        and i.status <> 'void'::public.invoice_status
    ) then
      raise exception 'Milestone already has an active invoice.';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::int, nullif(v_item ->> 'quantity', '')::int, 1);
    v_unit := coalesce((v_item ->> 'unit_price_cents')::int, 0);
    if v_desc = '' or v_qty < 1 or v_unit <= 0 then
      raise exception 'Each invoice line item requires a description, qty >= 1, and unit_price_cents > 0.';
    end if;
    v_subtotal := v_subtotal + (v_qty::bigint * v_unit::bigint);
    if v_subtotal > 2147483647 then
      raise exception 'Invoice subtotal exceeds supported maximum amount.';
    end if;
  end loop;

  if v_discount::bigint > v_subtotal then
    raise exception 'Discount cannot exceed invoice subtotal.';
  end if;

  v_taxable := v_subtotal - v_discount::bigint;
  v_tax_cents := round((v_taxable::numeric * v_tax_bps::numeric) / 10000.0)::bigint;
  v_total_cents := v_taxable + v_tax_cents;
  if coalesce(p_issue_immediately, false) is true and v_total_cents <= 0 then
    raise exception 'Issued invoice total must be positive.';
  end if;
  if v_total_cents > 2147483647 then
    raise exception 'Invoice total exceeds supported maximum amount.';
  end if;

  insert into public.invoices (
    client_id, order_id, milestone_id, is_deposit_invoice, status,
    currency, fx_rate_to_usd, subtotal_cents, discount_cents, tax_rate_bps,
    tax_cents, total_cents, due_at, payment_instructions, notes
  )
  values (
    p_client_id, p_order_id, p_milestone_id, false, 'draft'::public.invoice_status,
    v_currency, v_fx,
    v_subtotal::int, v_discount, v_tax_bps, v_tax_cents::int, v_total_cents::int,
    current_date + greatest(1, coalesce(p_due_days, 7)),
    nullif(btrim(coalesce(p_payment_instructions, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id, code into v_inv_id, v_inv_code;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::int, nullif(v_item ->> 'quantity', '')::int, 1);
    v_unit := coalesce((v_item ->> 'unit_price_cents')::int, 0);
    insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
    values (v_inv_id, v_pos, v_desc, v_qty, v_unit);
    v_pos := v_pos + 1;
  end loop;

  v_status := 'draft'::public.invoice_status;
  if coalesce(p_issue_immediately, false) is true then
    perform set_config('app.invoice_status_transition', 'on', true);
    update public.invoices
      set status = 'issued'::public.invoice_status,
          issued_at = now()
      where id = v_inv_id;
    v_status := 'issued'::public.invoice_status;
  end if;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', p_client_id, p_order_id, 'invoice', v_inv_id,
    case when v_status = 'issued' then 'invoice.issued' else 'invoice.draft_created' end,
    case when v_status = 'issued' then 'Issued multi-line invoice ' else 'Created draft invoice ' end || v_inv_code,
    jsonb_build_object('total_cents', v_total_cents::int, 'items_count', v_pos)
  );

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'total_cents', v_total_cents::int, 'status', v_status);
end;
$$;

revoke all on function public.create_draft_invoice_multi_atomic(uuid, uuid, uuid, text, numeric, int, int, int, text, text, jsonb, boolean, uuid) from public, anon;
grant execute on function public.create_draft_invoice_multi_atomic(uuid, uuid, uuid, text, numeric, int, int, int, text, text, jsonb, boolean, uuid) to authenticated, service_role;

create or replace function public.send_draft_invoice_atomic(p_invoice_id uuid, p_admin_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_inv public.invoices;
  v_items_sum bigint;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'draft'::public.invoice_status then
    raise exception 'Only draft invoices can be issued.';
  end if;
  if not exists (select 1 from public.invoice_items where invoice_id = v_inv.id) then
    raise exception 'Draft invoice must contain at least one line item.';
  end if;

  select coalesce(sum(ii.line_total_cents), 0)::bigint into v_items_sum
    from public.invoice_items ii
   where ii.invoice_id = v_inv.id;

  if v_items_sum <> v_inv.subtotal_cents::bigint then
    raise exception 'Draft invoice subtotal (%) does not match sum of line items (%).', v_inv.subtotal_cents, v_items_sum;
  end if;
  if v_inv.total_cents <= 0 then
    raise exception 'Invoice total must be positive.';
  end if;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'issued'::public.invoice_status,
        issued_at = now()
    where id = v_inv.id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary)
  values (v_admin, 'admin', v_inv.client_id, v_inv.order_id, 'invoice', v_inv.id, 'invoice.issued', 'Issued draft invoice ' || v_inv.code);

  return jsonb_build_object('invoice_id', v_inv.id, 'code', v_inv.code, 'status', 'issued');
end;
$$;

revoke all on function public.send_draft_invoice_atomic(uuid, uuid) from public, anon;
grant execute on function public.send_draft_invoice_atomic(uuid, uuid) to authenticated, service_role;

create or replace function public.review_invoice_payment(
  p_payment_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_fx_rate numeric default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_pay public.payments;
  v_inv public.invoices;
  v_effective_fx numeric;
  v_remaining_before int;
  v_capped_native_cents int;
  v_capped_usd_delta bigint;
  v_confirmed_total bigint;
  v_new_inv_status public.invoice_status;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin authorization required to review payments.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'Invalid payment review decision.';
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment record not found.';
  end if;
  if v_pay.status <> 'submitted'::public.payment_status then
    raise exception 'Payment has already been reviewed.';
  end if;

  select * into v_inv from public.invoices where id = v_pay.invoice_id for update;

  if p_decision = 'rejected' then
    update public.payments
      set status = 'rejected'::public.payment_status,
          rejection_reason = p_reason,
          reviewed_by = v_admin,
          reviewed_at = now()
      where id = v_pay.id;

    insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
    values (
      v_admin, 'admin', v_pay.client_id, v_pay.order_id, 'payment', v_pay.id,
      'payment.rejected', 'Rejected payment ' || v_pay.code,
      jsonb_build_object('reason', p_reason)
    );

    return jsonb_build_object('payment_status', 'rejected', 'invoice_status', v_inv.status);
  end if;

  if v_inv.status not in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'overdue'::public.invoice_status) then
    raise exception 'Invoice is not open for payment confirmation (already settled, voided, or draft).';
  end if;

  if p_fx_rate is not null and (p_fx_rate = 'NaN'::numeric or p_fx_rate <= 0) then
    raise exception 'FX rate must be a positive finite number.';
  end if;

  v_effective_fx := round(coalesce(p_fx_rate, v_inv.fx_rate_to_usd, v_pay.fx_rate_to_usd, 1.000000), 6);
  if v_effective_fx = 'NaN'::numeric or v_effective_fx <= 0 then
    raise exception 'FX rate must be a positive finite number.';
  end if;
  if v_inv.currency = 'USD' and v_effective_fx <> 1.000000 then
    raise exception 'USD invoices must use fx_rate_to_usd = 1.000000.';
  end if;

  v_remaining_before := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if v_pay.amount_cents > v_remaining_before then
    raise exception 'Payment exceeds remaining invoice balance.';
  end if;

  v_capped_native_cents := least(v_pay.amount_cents, v_remaining_before);
  v_capped_usd_delta := round(v_capped_native_cents::numeric * v_effective_fx)::bigint;

  update public.payments
    set status = 'confirmed'::public.payment_status,
        fx_rate_to_usd = v_effective_fx,
        reviewed_by = v_admin,
        reviewed_at = now()
    where id = v_pay.id;

  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed_total
    from public.payments
    where invoice_id = v_inv.id and status = 'confirmed'::public.payment_status;

  v_new_inv_status := case
    when (v_confirmed_total + v_inv.credited_cents) >= v_inv.total_cents then 'paid'::public.invoice_status
    when v_confirmed_total > 0 then 'partially_paid'::public.invoice_status
    else v_inv.status
  end;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set amount_paid_cents = least(v_confirmed_total::int, (v_inv.total_cents - v_inv.credited_cents)),
        status = v_new_inv_status,
        paid_at = case when v_new_inv_status = 'paid'::public.invoice_status then coalesce(paid_at, now()) else paid_at end
    where id = v_inv.id;

  update public.client_profiles
    set lifetime_value_usd_cents = lifetime_value_usd_cents + coalesce(v_capped_usd_delta, 0)
    where user_id = v_pay.client_id;

  perform public._handle_invoice_paid_effects(v_inv.id);

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_pay.client_id, v_pay.order_id, 'payment', v_pay.id,
    'payment.confirmed', 'Confirmed payment ' || v_pay.code || ' for invoice ' || v_inv.code,
    jsonb_build_object(
      'amount_cents', v_pay.amount_cents,
      'currency', v_pay.currency,
      'usd_equivalent_cents', v_capped_usd_delta
    )
  );

  return jsonb_build_object('payment_status', 'confirmed', 'invoice_status', v_new_inv_status);
end;
$$;

revoke all on function public.review_invoice_payment(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.review_invoice_payment(uuid, uuid, text, numeric, text) to authenticated, service_role;

create or replace function public.record_manual_payment_atomic(
  p_invoice_id uuid,
  p_admin_id uuid,
  p_method public.payment_method,
  p_amount_cents int,
  p_reference text,
  p_fx_rate numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_inv public.invoices;
  v_remaining int;
  v_effective_fx numeric;
  v_capped_usd bigint;
  v_pay_id uuid;
  v_pay_code text;
  v_confirmed_total bigint;
  v_new_status public.invoice_status;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_admin is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin and p.role = 'admin'::public.user_role and p.is_active is true
  ) then
    raise exception 'Admin authorization required.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or coalesce(btrim(p_reference), '') = '' then
    raise exception 'Positive amount and payment reference are required.';
  end if;

  if p_fx_rate is not null and (p_fx_rate = 'NaN'::numeric or p_fx_rate <= 0) then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_inv.status not in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'overdue'::public.invoice_status) then
    raise exception 'Invoice is not open for payment recording.';
  end if;

  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if p_amount_cents > v_remaining then
    raise exception 'Payment exceeds remaining invoice balance.';
  end if;

  v_effective_fx := round(coalesce(p_fx_rate, v_inv.fx_rate_to_usd, 1.000000), 6);
  if v_effective_fx = 'NaN'::numeric or v_effective_fx <= 0 then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
  end if;
  if v_inv.currency = 'USD' and v_effective_fx <> 1.000000 then
    raise exception 'USD invoices must use fx_rate_to_usd = 1.000000.';
  end if;
  v_capped_usd := round(p_amount_cents::numeric * v_effective_fx)::bigint;

  perform set_config('app.manual_payment_fx', 'on', true);
  insert into public.payments (
    invoice_id, client_id, order_id, method, currency, fx_rate_to_usd,
    amount_cents, reference, status, reviewed_by, reviewed_at
  )
  values (
    v_inv.id, v_inv.client_id, v_inv.order_id, p_method, v_inv.currency,
    v_effective_fx, p_amount_cents, btrim(p_reference), 'confirmed'::public.payment_status,
    v_admin, now()
  )
  returning id, code into v_pay_id, v_pay_code;

  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed_total
    from public.payments
    where invoice_id = v_inv.id and status = 'confirmed'::public.payment_status;

  v_new_status := case
    when (v_confirmed_total + v_inv.credited_cents) >= v_inv.total_cents then 'paid'::public.invoice_status
    when v_confirmed_total > 0 then 'partially_paid'::public.invoice_status
    else v_inv.status
  end;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set amount_paid_cents = least(v_confirmed_total::int, (v_inv.total_cents - v_inv.credited_cents)),
        status = v_new_status,
        paid_at = case when v_new_status = 'paid'::public.invoice_status then coalesce(paid_at, now()) else paid_at end
    where id = v_inv.id;

  update public.client_profiles
    set lifetime_value_usd_cents = lifetime_value_usd_cents + coalesce(v_capped_usd, 0)
    where user_id = v_inv.client_id;

  perform public._handle_invoice_paid_effects(v_inv.id);

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_inv.client_id, v_inv.order_id, 'payment', v_pay_id,
    'payment.manual_recorded', 'Recorded manual payment ' || v_pay_code || ' on ' || v_inv.code,
    jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method, 'reference', btrim(p_reference))
  );

  return jsonb_build_object('payment_id', v_pay_id, 'code', v_pay_code, 'invoice_status', v_new_status);
end;
$$;

revoke all on function public.record_manual_payment_atomic(uuid, uuid, public.payment_method, int, text, numeric) from public, anon;
grant execute on function public.record_manual_payment_atomic(uuid, uuid, public.payment_method, int, text, numeric) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Expand orders_enforce_roe Trigger & Proposal Cybersecurity RoE Enforcement
-- -----------------------------------------------------------------------------
create or replace function public.enforce_order_roe_before_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entering_execution boolean := (
    new.status in ('queued'::public.order_status, 'in_progress'::public.order_status)
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  );
  v_entering_post_deposit boolean := (
    new.status in (
      'queued'::public.order_status,
      'in_progress'::public.order_status,
      'in_review'::public.order_status,
      'delivered'::public.order_status,
      'completed'::public.order_status
    )
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
    )
  );
begin
  if new.requires_roe is true
     and new.status in (
       'queued'::public.order_status,
       'in_progress'::public.order_status,
       'in_review'::public.order_status,
       'delivered'::public.order_status,
       'completed'::public.order_status
     )
  then
    if new.roe_signed_at is null
       or not exists (
         select 1
           from public.engagement_authorizations ea
          where ea.order_id = new.id
            and ea.client_id = new.client_id
            and ea.ownership_attested is true
            and ea.signed_at is not null
            and cardinality(ea.authorized_targets) >= 1
            and (not v_entering_execution or ea.testing_window_end > now())
       )
    then
      raise exception 'Signed Rules of Engagement (RoE) authorization within an active testing window is required before entering execution.';
    end if;
  end if;

  if v_entering_post_deposit then
    if exists (
      select 1
        from public.invoices i
       where i.order_id = new.id
         and i.is_deposit_invoice is true
         and i.total_cents > 0
         and i.status not in ('paid'::public.invoice_status, 'void'::public.invoice_status)
    ) then
      raise exception 'Kickoff deposit invoice must be paid before order execution can advance to %.', new.status;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;

drop trigger if exists orders_enforce_roe on public.orders;
create trigger orders_enforce_roe
  before insert or update of status, requires_roe, roe_signed_at, client_id on public.orders
  for each row execute function public.enforce_order_roe_before_progress();

create or replace function public.accept_proposal_and_create_order(
  p_proposal_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_actor uuid;
  v_prop public.proposals;
  v_order_id uuid;
  v_invoice_id uuid := null;
  v_deposit_cents int;
  v_initial_status public.order_status;
  v_fx numeric := 1.000000;
  v_effective_roe boolean;
begin
  if v_caller_role = 'service_role' then
    v_actor := p_actor_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Client authentication required to accept a proposal.';
    end if;
    if p_actor_id is not null and p_actor_id is distinct from v_caller_uid then
      raise exception 'Actor mismatch: p_actor_id must match authenticated caller.';
    end if;
    v_actor := v_caller_uid;
  end if;

  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'client'::public.user_role and p.is_active is true
  ) then
    raise exception 'Active client account required to accept a proposal.';
  end if;

  select * into v_prop
    from public.proposals
    where id = p_proposal_id
    for update;

  if not found then
    raise exception 'Proposal not found.';
  end if;

  if v_prop.client_id is distinct from v_actor then
    raise exception 'Unauthorized to accept this proposal.';
  end if;

  if v_prop.status = 'accepted'::public.proposal_status then
    select o.id into v_order_id from public.orders o where o.proposal_id = v_prop.id limit 1;
    select i.id into v_invoice_id
      from public.invoices i
      where i.order_id = v_order_id and i.is_deposit_invoice is true
      limit 1;
    return jsonb_build_object(
      'order_id', v_order_id,
      'deposit_invoice_id', v_invoice_id,
      'already_accepted', true
    );
  end if;

  if v_prop.status not in ('sent'::public.proposal_status, 'viewed'::public.proposal_status) then
    raise exception 'Proposal is not open for client acceptance.';
  end if;

  if v_prop.valid_until is not null and v_prop.valid_until < current_date then
    raise exception 'Proposal has expired.';
  end if;

  v_fx := round(coalesce(v_prop.fx_rate_to_usd, 1.000000), 6);
  if v_fx = 'NaN'::numeric or v_fx <= 0 then
    v_fx := 1.000000;
  end if;

  v_effective_roe := coalesce(v_prop.requires_roe, false);
  v_deposit_cents := round((v_prop.total_cents::numeric * v_prop.deposit_percent::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, service_id, proposal_id, inquiry_id, title, description, pillar,
    status, pricing_model, currency, fx_rate_to_usd, subtotal_cents, discount_cents, tax_cents,
    total_cents, deposit_percent, revisions_included, auto_accept_days,
    requires_roe, due_at
  )
  values (
    v_prop.client_id, v_prop.service_id, v_prop.id, v_prop.inquiry_id, v_prop.title,
    v_prop.scope_summary, v_prop.pillar, v_initial_status, v_prop.pricing_model,
    v_prop.currency, v_fx, v_prop.subtotal_cents, v_prop.discount_cents, v_prop.tax_cents,
    v_prop.total_cents, v_prop.deposit_percent, v_prop.revisions_included,
    v_prop.auto_accept_days, v_effective_roe,
    now() + make_interval(days => v_prop.estimated_days)
  )
  returning id into v_order_id;

  insert into public.order_milestones (order_id, title, description, amount_cents, currency, weight_percent, position, due_date)
  select
    v_order_id, pm.title, pm.description, pm.amount_cents, v_prop.currency,
    pm.weight_percent, pm.position, (current_date + pm.due_days_offset)
  from public.proposal_milestones pm
  where pm.proposal_id = v_prop.id
  order by pm.position;

  if v_deposit_cents > 0 then
    insert into public.invoices (
      client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      v_prop.client_id, v_order_id, true, 'draft'::public.invoice_status, v_prop.currency, v_fx,
      v_deposit_cents, 0, 0, 0, v_deposit_cents,
      current_date + 7,
      'Initial deposit (' || v_prop.deposit_percent || '%) for ' || v_prop.title
    )
    returning id into v_invoice_id;

    insert into public.invoice_items (invoice_id, description, qty, unit_price_cents, position)
    values (
      v_invoice_id,
      'Deposit (' || v_prop.deposit_percent || '%) — ' || v_prop.title,
      1,
      v_deposit_cents,
      0
    );

    perform set_config('app.invoice_status_transition', 'on', true);
    update public.invoices
      set status = 'issued'::public.invoice_status,
          issued_at = now()
      where id = v_invoice_id;
  end if;

  update public.proposals
    set status = 'accepted'::public.proposal_status,
        accepted_at = now()
    where id = v_prop.id;

  if v_prop.inquiry_id is not null then
    update public.inquiries
      set status = 'won'::public.inquiry_status,
          converted_client_id = v_prop.client_id
      where id = v_prop.inquiry_id;
  end if;

  update public.client_profiles
    set total_orders_count = total_orders_count + 1
    where user_id = v_prop.client_id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor, 'client', v_prop.client_id, v_order_id, 'proposal', v_prop.id,
    'proposal.accepted', 'Accepted proposal ' || v_prop.code || ' and initialized order',
    jsonb_build_object('order_id', v_order_id, 'deposit_invoice_id', v_invoice_id, 'fx_rate_to_usd', v_fx)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'deposit_invoice_id', v_invoice_id,
    'already_accepted', false
  );
end;
$$;

revoke all on function public.accept_proposal_and_create_order(uuid, uuid) from public, anon;
grant execute on function public.accept_proposal_and_create_order(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Harden run_daily_crm_maintenance() & publish_consent_policy_atomic()
-- -----------------------------------------------------------------------------
create or replace function public.run_daily_crm_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_role text := current_setting('request.jwt.claim.role', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
  v_overdue int := 0;
  v_expired_proposals int := 0;
  v_auto_accepted int := 0;
  v_renewed_retainers int := 0;
  v_failed_retainers int := 0;
  v_pruned_rate_limits int := 0;
  v_pruned_reservations int := 0;
  v_prop record;
  v_ret record;
  v_renew_res jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  v_overdue := public.mark_overdue_invoices_atomic();

  for v_prop in
    update public.proposals
       set status = 'expired'::public.proposal_status
     where status in ('sent'::public.proposal_status, 'viewed'::public.proposal_status)
       and valid_until is not null
       and valid_until < current_date
    returning id, code, client_id
  loop
    insert into public.audit_logs (actor_role, client_id, entity_type, entity_id, action, summary)
    values (
      'system', v_prop.client_id, 'proposal', v_prop.id,
      'proposal.expired', 'Proposal ' || v_prop.code || ' expired automatically past valid_until'
    );
    v_expired_proposals := v_expired_proposals + 1;
  end loop;

  v_auto_accepted := public.run_auto_accept_deliverables();

  for v_ret in
    select id
      from public.retainer_plans
     where status = 'active'
       and next_invoice_date <= current_date
     for update skip locked
  loop
    begin
      v_renew_res := public.renew_retainer_cycle_atomic(v_ret.id, null, false);
      if coalesce((v_renew_res ->> 'skipped')::boolean, false) is not true then
        v_renewed_retainers := v_renewed_retainers + 1;
      end if;
    exception when others then
      v_failed_retainers := v_failed_retainers + 1;
    end;
  end loop;

  delete from public.rate_limits
   where window_started_at < now() - interval '24 hours';
  get diagnostics v_pruned_rate_limits = row_count;

  delete from public.vault_upload_reservations
   where expires_at < now();
  get diagnostics v_pruned_reservations = row_count;

  -- Restore prior transaction-local JWT settings cleanly
  perform set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);

  return jsonb_build_object(
    'overdue_invoices', v_overdue,
    'expired_proposals', v_expired_proposals,
    'auto_accepted_deliverables', v_auto_accepted,
    'renewed_retainers', v_renewed_retainers,
    'failed_retainers', v_failed_retainers,
    'pruned_rate_limits', v_pruned_rate_limits,
    'pruned_upload_reservations', v_pruned_reservations
  );
end;
$$;

revoke all on function public.run_daily_crm_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_crm_maintenance() to service_role;

create or replace function public.publish_consent_policy_atomic(
  p_version text,
  p_canonical text,
  p_hash text,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_admin uuid;
  v_ver text := btrim(coalesce(p_version, ''));
  v_hash text := lower(btrim(coalesce(p_hash, '')));
  v_existing_hash text;
  v_exists boolean := false;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch.';
    end if;
    v_admin := v_caller_uid;
  end if;

  if v_ver !~ '^[a-z][a-z0-9-]{0,63}$' then
    raise exception 'Invalid consent policy version identifier.';
  end if;
  if v_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid consent policy SHA-256 hash.';
  end if;
  if coalesce(btrim(p_canonical), '') = '' then
    raise exception 'Canonical consent policy JSON is required.';
  end if;

  select cp.hash into v_existing_hash
    from public.consent_policies cp
   where cp.version = v_ver
   for update;
  v_exists := found;

  if v_exists and v_existing_hash is distinct from v_hash then
    raise exception 'Consent policy version % already exists with a different hash; publish a new version identifier.', v_ver;
  end if;

  update public.consent_policies
     set is_active = false
   where is_active is true
     and version <> v_ver;

  if v_exists then
    update public.consent_policies
       set is_active = true
     where version = v_ver;
  else
    insert into public.consent_policies (version, canonical, hash, is_active)
    values (v_ver, p_canonical, v_hash, true);
  end if;

  insert into public.audit_logs (actor_id, actor_role, entity_type, action, summary, metadata)
  values (
    v_admin, case when v_admin is null then 'system' else 'admin' end,
    'consent_policy', 'consent_policy.published',
    'Activated consent policy version ' || v_ver,
    jsonb_build_object('version', v_ver, 'hash', v_hash)
  );

  return jsonb_build_object('version', v_ver, 'hash', v_hash);
end;
$$;

revoke all on function public.publish_consent_policy_atomic(text, text, text, uuid) from public, anon;
grant execute on function public.publish_consent_policy_atomic(text, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. Restrict Private Admin CRM Columns on client_profiles & Expand audit_logs Filter
-- -----------------------------------------------------------------------------
revoke select on public.client_profiles from authenticated;
grant select (
  user_id,
  company_name,
  company_role,
  website_url,
  industry,
  billing_address,
  tax_id,
  preferred_currency,
  lifetime_value_usd_cents,
  total_orders_count,
  completed_orders_count,
  average_rating,
  created_at,
  updated_at
) on public.client_profiles to authenticated;

drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin"
  on public.audit_logs for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and (client_id = (select auth.uid()) or actor_id = (select auth.uid()))
      and action not in (
        'client.crm_updated',
        'client.note_added',
        'client.notes_updated',
        'client.note_deleted',
        'client.note_pinned',
        'client.tier_updated',
        'client.followup_updated',
        'order.internal_note_added',
        'order.task_added',
        'order.task_toggled',
        'order.task_deleted',
        'admin.internal_note',
        'proposal.draft_saved',
        'proposal.draft_updated',
        'proposal.cloned',
        'invoice.draft_created',
        'invoice.draft_updated',
        'vault_file.retention_updated'
      )
      and not (
        action = 'proposal.expired'
        and coalesce(metadata ->> 'previousStatus', '') = 'draft'
      )
      and coalesce((metadata ->> 'internal')::boolean, false) is false
      and coalesce((metadata ->> 'isInternalNote')::boolean, false) is false
    )
  );

-- -----------------------------------------------------------------------------
-- 11. Additional Defense-in-Depth Hardening & Auth Session Revocation Helper
-- -----------------------------------------------------------------------------
-- Prevent duplicate pending cancellation requests for the same order
create unique index if not exists cancellation_requests_one_pending_uidx
  on public.cancellation_requests (order_id)
  where status = 'pending';

-- Cap message attachment_file_ids array lengths
alter table public.order_messages
  drop constraint if exists order_messages_attachments_max_check;
alter table public.order_messages
  add constraint order_messages_attachments_max_check
  check (cardinality(attachment_file_ids) <= 10);

alter table public.ticket_messages
  drop constraint if exists ticket_messages_attachments_max_check;
alter table public.ticket_messages
  add constraint ticket_messages_attachments_max_check
  check (cardinality(attachment_file_ids) <= 10);

-- Prevent editing order_requirements on terminal orders
create or replace function public.guard_verified_order_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_ord_status public.order_status;
begin
  if v_caller_role in ('authenticated', 'anon') and not public.is_admin() then
    select o.status into v_ord_status from public.orders o where o.id = new.order_id;
    if v_ord_status in ('completed'::public.order_status, 'cancelled'::public.order_status) then
      raise exception 'Order requirements cannot be modified on % orders.', v_ord_status;
    end if;

    if tg_op = 'INSERT' then
      if new.verified_by_admin_at is not null then
        raise exception 'Only administrators may verify order requirements.';
      end if;
      new.submitted_at := now();
      return new;
    end if;

    if old.verified_by_admin_at is not null then
      raise exception 'Order requirements are locked after admin verification.';
    end if;
    if new.order_id is distinct from old.order_id
       or new.client_id is distinct from old.client_id then
      raise exception 'Order requirement ownership cannot be reassigned.';
    end if;
    if new.verified_by_admin_at is not null then
      raise exception 'Only administrators may verify order requirements.';
    end if;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.guard_verified_order_requirements() from public, anon, authenticated;

-- Add NULL actor guard to decline_proposal_client_atomic
create or replace function public.decline_proposal_client_atomic(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_actor uuid;
  v_prop public.proposals;
begin
  if v_caller_role = 'service_role' then
    v_actor := p_actor_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Active client authentication required.';
    end if;
    if p_actor_id is not null and p_actor_id is distinct from v_caller_uid then
      raise exception 'Actor mismatch.';
    end if;
    v_actor := v_caller_uid;
  end if;

  if v_actor is null then
    raise exception 'Active client actor required.';
  end if;

  select * into v_prop from public.proposals where id = p_proposal_id for update;
  if not found or v_prop.client_id is distinct from v_actor then
    raise exception 'Proposal not found or unauthorized.';
  end if;
  if v_prop.status not in ('sent'::public.proposal_status, 'viewed'::public.proposal_status) then
    raise exception 'Proposal can no longer be declined.';
  end if;

  update public.proposals
    set status = 'declined'::public.proposal_status,
        declined_at = now(),
        decline_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = v_prop.id;

  insert into public.audit_logs (actor_id, actor_role, client_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor, 'client', v_prop.client_id, 'proposal', v_prop.id,
    'proposal.declined', 'Client declined proposal ' || v_prop.code,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return jsonb_build_object('proposal_id', v_prop.id, 'status', 'declined');
end;
$$;

revoke all on function public.decline_proposal_client_atomic(uuid, uuid, text) from public, anon;
grant execute on function public.decline_proposal_client_atomic(uuid, uuid, text) to authenticated, service_role;

-- Add deliverable_id parent tenant validation to enforce_vault_file_tenant_integrity
create or replace function public.enforce_vault_file_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_client uuid;
  v_invoice_client uuid;
  v_ticket_client uuid;
  v_deliverable_client uuid;
begin
  if new.order_id is not null then
    select o.client_id into v_order_client from public.orders o where o.id = new.order_id;
    if not found then
      raise exception 'Referenced order does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_order_client then
      raise exception 'Vault file owner_client_id does not match order client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_order_client);
  end if;

  if new.deliverable_id is not null then
    select o.client_id into v_deliverable_client
      from public.deliverables d
      join public.orders o on o.id = d.order_id
     where d.id = new.deliverable_id;
    if not found then
      raise exception 'Referenced deliverable does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_deliverable_client then
      raise exception 'Vault file owner_client_id does not match deliverable order client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_deliverable_client);
  end if;

  if new.invoice_id is not null then
    select i.client_id into v_invoice_client from public.invoices i where i.id = new.invoice_id;
    if not found then
      raise exception 'Referenced invoice does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_invoice_client then
      raise exception 'Vault file owner_client_id does not match invoice client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_invoice_client);
  end if;

  if new.ticket_id is not null then
    select t.client_id into v_ticket_client from public.tickets t where t.id = new.ticket_id;
    if not found then
      raise exception 'Referenced ticket does not exist for vault file.';
    end if;
    if new.owner_client_id is not null and new.owner_client_id is distinct from v_ticket_client then
      raise exception 'Vault file owner_client_id does not match ticket client_id.';
    end if;
    new.owner_client_id := coalesce(new.owner_client_id, v_ticket_client);
  end if;

  if new.bucket = 'private'
     and new.category in (
       'order_attachment',
       'requirement_attachment',
       'ticket_attachment',
       'payment_proof',
       'roe_document'
     )
     and new.owner_client_id is not null
     and exists (
       select 1 from public.profiles p
       where p.id = new.uploaded_by and p.role = 'client'::public.user_role
     )
  then
    if new.uploaded_by is distinct from new.owner_client_id then
      raise exception 'Client uploader must match vault file owner.';
    end if;
    if position(('private/' || new.owner_client_id::text || '/') in new.r2_key) <> 1 then
      raise exception 'Vault file r2_key prefix does not belong to uploading client.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vault_file_tenant_integrity() from public, anon, authenticated;

-- Internal service_role guards on consume_rate_limit & increment_vault_file_download
create or replace function public.consume_rate_limit(
  p_kind text,
  p_key_hash text,
  p_window_seconds int,
  p_max_count int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => greatest(1, p_window_seconds));
  v_count int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  insert into public.rate_limits (kind, key_hash, window_started_at, count)
  values (p_kind, p_key_hash, v_now, 1)
  on conflict (kind, key_hash) do update
    set window_started_at = case
          when public.rate_limits.window_started_at <= v_cutoff then v_now
          else public.rate_limits.window_started_at
        end,
        count = case
          when public.rate_limits.window_started_at <= v_cutoff then 1
          else public.rate_limits.count + 1
        end
  returning count into v_count;

  return v_count <= greatest(1, p_max_count);
end;
$$;

revoke all on function public.consume_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, int, int) to service_role;

create or replace function public.increment_vault_file_download(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  update public.vault_files
     set download_count = download_count + 1,
         last_downloaded_at = now()
   where id = p_file_id;
end;
$$;

revoke all on function public.increment_vault_file_download(uuid) from public, anon, authenticated;
grant execute on function public.increment_vault_file_download(uuid) to service_role;

-- Service-role-only helper to revoke active Supabase Auth sessions & refresh tokens on deactivation/revocation
create or replace function public.revoke_auth_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  if p_user_id is null then
    return;
  end if;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user_id;
  end if;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;

  update public.profiles
     set tokens_valid_after = greatest(
           coalesce(tokens_valid_after, 0),
           floor(extract(epoch from now()))::bigint + 1
         )
   where id = p_user_id;
end;
$$;

revoke all on function public.revoke_auth_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_auth_user_sessions(uuid) to service_role;

-- Expand rate_limits kind vocabulary for newly throttled auth & export routes
alter table public.rate_limits
  drop constraint if exists rate_limits_kind_check;

alter table public.rate_limits
  add constraint rate_limits_kind_check check (
    kind in (
      'ip',
      'turnstile',
      'presign',
      'presign-ip',
      'otp',
      'otp-ip',
      'otp-email',
      'auth',
      'auth-callback',
      'mfa-reset',
      'retry-recovery',
      'retry-invite',
      'portal-presign',
      'password-login',
      'password-login-email',
      'register-ip',
      'order-message',
      'blogs-preload',
      'file-download',
      'admin-search',
      'recovery-export',
      'client-mutation',
      'client-order'
    )
  );
