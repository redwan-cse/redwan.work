-- =============================================================================
-- Migration 0030: P0-P1 Security, Financial Ledger, Cron Outbox & RLS Hardening
-- =============================================================================
-- 1. Restores 0017 paid kickoff-deposit + active RoE testing window / targets
--    / client match guards in enforce_order_roe_before_progress().
-- 2. Hardens financial & ledger RPCs:
--    - Adds proposals.fx_rate_to_usd & orders.fx_rate_to_usd + NaN guards.
--    - Blocks confirming payments on paid/void/draft invoices or overpayments
--      in review_invoice_payment().
--    - Separates paid-revision addendum invoices from order balance calculation
--      in review_order_deliverable() & run_auto_accept_deliverables(), and stops
--      _handle_invoice_paid_effects() from immediately completing an order when
--      a paid-revision addendum invoice is settled.
--    - Uses bigint arithmetic, NaN FX rejection, and duplicate active milestone
--      guards in create_draft_invoice_multi_atomic() & issue_invoice_atomic().
--    - Adds idempotent next_invoice_date <= current_date guard + p_force param
--      to renew_retainer_cycle_atomic() (dropping 2-arg overload first).
-- 3. Atomically enqueues notifications + email_outbox rows inside
--    mark_overdue_invoices_atomic(), run_auto_accept_deliverables(), and
--    renew_retainer_cycle_atomic(), and prunes expired rate_limits and
--    vault_upload_reservations inside run_daily_crm_maintenance().
-- 4. Enforces tokens_valid_after across profiles RLS policies &
--    caller_account_state() (with initPlan-safe (select auth.uid()) /
--    (select auth.jwt()) wrappers and immutability of tokens_valid_after for
--    non-admins).
-- 5. Hardens direct PostgREST RLS & atomic ops:
--    - cancellation_requests_insert_own enforces status='pending', null
--      resolution fields, and non-terminal parent order status.
--    - notifications BEFORE UPDATE trigger permits non-admins to mutate only
--      read_at.
--    - ticket_messages blocks client replies on closed tickets.
--    - order_messages blocks client posts on cancelled orders.
--    - vault_files hides expired retention_until rows from clients.
--    - Adds atomic publish_consent_policy_atomic() RPC.
--    - Expands rate_limits_kind_check for per-email/route throttles.
-- =============================================================================

-- 1. Multi-currency FX columns & NaN constraints
alter table public.proposals
  add column if not exists fx_rate_to_usd numeric(14, 6) not null default 1.000000;

alter table public.proposals
  drop constraint if exists proposals_fx_rate_to_usd_check;
alter table public.proposals
  add constraint proposals_fx_rate_to_usd_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

alter table public.orders
  add column if not exists fx_rate_to_usd numeric(14, 6) not null default 1.000000;

alter table public.orders
  drop constraint if exists orders_fx_rate_to_usd_check;
alter table public.orders
  add constraint orders_fx_rate_to_usd_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

alter table public.invoices
  drop constraint if exists invoices_fx_rate_to_usd_check;
alter table public.invoices
  add constraint invoices_fx_rate_to_usd_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

alter table public.payments
  drop constraint if exists payments_fx_rate_to_usd_check;
alter table public.payments
  add constraint payments_fx_rate_to_usd_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

alter table public.credit_notes
  drop constraint if exists credit_notes_fx_rate_to_usd_check;
alter table public.credit_notes
  add constraint credit_notes_fx_rate_to_usd_check
  check (fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'::numeric);

-- 2. Restore paid kickoff-deposit + active RoE window/targets/client guards
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

  if new.status = 'in_progress'::public.order_status
     and (tg_op = 'INSERT' or old.status is distinct from 'in_progress'::public.order_status)
  then
    if exists (
      select 1
        from public.invoices i
       where i.order_id = new.id
         and i.is_deposit_invoice is true
         and i.total_cents > 0
         and i.status not in ('paid'::public.invoice_status, 'void'::public.invoice_status)
    ) then
      raise exception 'Kickoff deposit invoice must be paid before order execution can enter in_progress.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;

-- 3. Propagate proposals.fx_rate_to_usd -> orders & deposit invoices
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

  v_fx := coalesce(v_prop.fx_rate_to_usd, 1.000000);
  if v_fx = 'NaN'::numeric or v_fx <= 0 then
    v_fx := 1.000000;
  end if;

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
    v_prop.auto_accept_days, v_prop.requires_roe,
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

  update public.client_profiles
    set total_orders_count = total_orders_count + 1
    where user_id = v_prop.client_id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary)
  values (
    v_actor, 'client', v_prop.client_id, v_order_id, 'proposal', v_prop.id,
    'proposal.accepted', 'Accepted proposal ' || v_prop.code || ' and created order'
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'deposit_invoice_id', v_invoice_id,
    'status', v_initial_status
  );
end;
$$;

-- 4. Financial RPC hardening: issue_invoice_atomic, create_draft_invoice_multi_atomic,
--    _handle_invoice_paid_effects, review_invoice_payment, record_manual_payment_atomic
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
  v_taxable bigint;
  v_tax_cents bigint;
  v_total_cents bigint;
  v_inv_id uuid;
  v_inv_code text;
begin
  if v_caller_role <> 'service_role' and not public.is_admin() then
    raise exception 'Admin authorization required to issue invoices.';
  end if;

  if p_fx_rate_to_usd is not null and (p_fx_rate_to_usd = 'NaN'::numeric or p_fx_rate_to_usd <= 0) then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
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
    upper(btrim(coalesce(p_currency, 'USD'))), coalesce(p_fx_rate_to_usd, 1.000000),
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

  if p_fx_rate_to_usd is not null and (p_fx_rate_to_usd = 'NaN'::numeric or p_fx_rate_to_usd <= 0) then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
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
    upper(btrim(coalesce(p_currency, 'USD'))), coalesce(p_fx_rate_to_usd, 1.000000),
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

create or replace function public._handle_invoice_paid_effects(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_order public.orders;
  v_has_unpaid boolean := false;
  v_has_accepted_final boolean := false;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'paid'::public.invoice_status then
    return;
  end if;

  -- Paid-revision addendum: grant extra revisions and transition delivered -> revision_requested;
  -- NEVER fall through to the final-settlement auto-complete block in the same transition.
  if v_inv.revision_grant_order_id is not null and v_inv.revision_grant_count > 0 then
    update public.orders
      set revisions_included = revisions_included + v_inv.revision_grant_count,
          status = case
            when status = 'delivered'::public.order_status then 'revision_requested'::public.order_status
            else status
          end
      where id = v_inv.revision_grant_order_id;
    return;
  end if;

  if v_inv.order_id is not null then
    select * into v_order from public.orders where id = v_inv.order_id for update;

    if v_inv.is_deposit_invoice is true and v_order.status = 'awaiting_payment'::public.order_status then
      update public.orders
        set status = 'pending_requirements'::public.order_status
        where id = v_order.id;
    end if;

    select exists (
      select 1
      from public.invoices i
      where i.order_id = v_order.id
        and i.status not in ('paid'::public.invoice_status, 'void'::public.invoice_status)
    ) into v_has_unpaid;

    select exists (
      select 1
      from public.deliverables d
      where d.order_id = v_order.id
        and d.is_final_delivery is true
        and d.status = 'accepted'::public.deliverable_status
    ) into v_has_accepted_final;

    if not v_has_unpaid
       and v_has_accepted_final
       and v_order.status not in ('completed'::public.order_status, 'cancelled'::public.order_status)
    then
      update public.orders
        set status = 'completed'::public.order_status,
            progress_percent = 100,
            completed_at = coalesce(completed_at, now())
        where id = v_order.id;

      update public.client_profiles
        set completed_orders_count = completed_orders_count + 1
        where user_id = v_order.client_id;
    end if;
  end if;
end;
$$;

revoke all on function public._handle_invoice_paid_effects(uuid) from public, anon, authenticated;

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

  v_effective_fx := coalesce(p_fx_rate, v_inv.fx_rate_to_usd, v_pay.fx_rate_to_usd, 1.000000);
  if v_effective_fx = 'NaN'::numeric or v_effective_fx <= 0 then
    raise exception 'FX rate must be a positive finite number.';
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

  v_effective_fx := coalesce(p_fx_rate, v_inv.fx_rate_to_usd, 1.000000);
  if v_effective_fx = 'NaN'::numeric or v_effective_fx <= 0 then
    raise exception 'fx_rate_to_usd must be a positive finite number.';
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

-- 5. Exclude paid-revision addendum invoices from final balance calculation + inherit FX
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
  v_has_unpaid boolean := false;
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
      set status = 'approved', completed_at = now()
      where id = v_deliv.milestone_id;
  end if;

  v_next_order_status := v_order.status;

  if v_deliv.is_final_delivery is true then
    -- Exclude paid-revision addendum invoices from contract balance computation
    select coalesce(sum(i.total_cents), 0)::bigint
      into v_invoiced_cents
      from public.invoices i
      where i.order_id = v_order.id
        and i.revision_grant_order_id is null
        and i.status <> 'void'::public.invoice_status;

    v_balance_cents := greatest(0, (v_order.total_cents::bigint - v_invoiced_cents)::int);

    if v_balance_cents > 0 then
      select coalesce(i.fx_rate_to_usd, v_order.fx_rate_to_usd, 1.000000) into v_fx
        from public.invoices i
       where i.order_id = v_order.id
         and i.currency = v_order.currency
         and i.status <> 'void'::public.invoice_status
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

    select exists (
      select 1
      from public.invoices i
      where i.order_id = v_order.id
        and i.status not in ('paid'::public.invoice_status, 'void'::public.invoice_status)
    ) into v_has_unpaid;

    if not v_has_unpaid then
      v_next_order_status := 'completed'::public.order_status;
      update public.orders
        set status = 'completed'::public.order_status,
            progress_percent = 100,
            completed_at = coalesce(completed_at, now())
        where id = v_order.id;

      if v_order.status <> 'completed'::public.order_status then
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

-- 6. Atomic cron notifications + email_outbox in mark_overdue_invoices_atomic,
--    run_auto_accept_deliverables, renew_retainer_cycle_atomic, and maintenance pruning
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
  if coalesce(auth.role(), '') <> 'service_role' then
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
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  for v_rec in
    select
      d.id as deliverable_id,
      d.code as deliverable_code,
      d.order_id,
      d.is_final_delivery,
      o.client_id,
      o.code as order_code,
      o.title as order_title,
      o.currency as order_currency,
      o.fx_rate_to_usd as order_fx_rate,
      o.total_cents as order_total_cents,
      o.status as order_status
    from public.deliverables d
    join public.orders o on o.id = d.order_id
    where d.status = 'submitted'::public.deliverable_status
      and d.auto_accept_at is not null
      and d.auto_accept_at <= now()
    for update of d, o skip locked
  loop
    v_final_inv_id := null;

    update public.deliverables
      set status = 'accepted'::public.deliverable_status,
          reviewed_at = now(),
          client_feedback = 'Auto-accepted after review window elapsed without revision request.'
      where id = v_rec.deliverable_id;

    if v_rec.is_final_delivery is true then
      select coalesce(sum(i.total_cents), 0)::bigint
        into v_invoiced_cents
        from public.invoices i
        where i.order_id = v_rec.order_id
          and i.revision_grant_order_id is null
          and i.status <> 'void'::public.invoice_status;

      v_balance_cents := greatest(0, (v_rec.order_total_cents::bigint - v_invoiced_cents)::int);

      if v_balance_cents > 0 then
        select coalesce(i.fx_rate_to_usd, v_rec.order_fx_rate, 1.000000) into v_fx
          from public.invoices i
         where i.order_id = v_rec.order_id
           and i.currency = v_rec.order_currency
           and i.status <> 'void'::public.invoice_status
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
          and i.status not in ('paid'::public.invoice_status, 'void'::public.invoice_status)
      ) into v_has_unpaid;

      if not v_has_unpaid then
        update public.orders
          set status = 'completed'::public.order_status,
              progress_percent = 100,
              completed_at = coalesce(completed_at, now())
          where id = v_rec.order_id;

        if v_rec.order_status <> 'completed'::public.order_status then
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

-- Drop old 2-arg signature before adding p_force default to prevent PGRST203 overload ambiguity
drop function if exists public.renew_retainer_cycle_atomic(uuid, uuid);

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
  v_admin uuid;
  v_ret public.retainer_plans;
  v_fx numeric := 1.000000;
  v_days int;
  v_next_start date;
  v_next_end date;
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
  if not found or v_ret.status <> 'active' then
    raise exception 'Only active retainers can be renewed.';
  end if;

  -- Automated cron/system renewals are idempotent and never double-bill ahead of next_invoice_date.
  -- Explicit admin manual renewals (v_admin is not null) or p_force = true may advance early.
  if v_admin is null and not coalesce(p_force, false) and v_ret.next_invoice_date > current_date then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'not_due',
      'next_invoice_date', v_ret.next_invoice_date
    );
  end if;

  select coalesce(i.fx_rate_to_usd, 1.000000) into v_fx
    from public.invoices i
   where i.client_id = v_ret.client_id
     and i.currency = v_ret.currency
   order by i.created_at desc
   limit 1;
  v_fx := coalesce(v_fx, 1.000000);

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
    v_ret.monthly_fee_cents, 0, 0, 0, v_ret.monthly_fee_cents,
    current_date + 7,
    'Retainer cycle renewal (' || v_ret.billing_cycle || ') — ' || v_ret.title || ' (' || v_next_start || ' to ' || v_next_end || ')'
  )
  returning id, code into v_inv_id, v_inv_code;

  insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
  values (
    v_inv_id,
    0,
    v_ret.title || ' (' || initcap(v_ret.billing_cycle) || ' Retainer: ' || v_next_start || ' – ' || v_next_end || ')',
    1,
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
    'Retainer Renewal Invoice ' || v_inv_code || ' Issued',
    v_ret.title || ' renewed through ' || v_next_end || ' with reset advisory hours.',
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
      'Retainer Cycle Invoice ' || v_inv_code || ' — ' || v_ret.title,
      jsonb_build_object(
        'message',
        'Your retainer (' || v_ret.title || ') rolled into the new cycle (' || v_next_start || ' to ' || v_next_end || ') and invoice ' || v_inv_code || ' for ' || v_ret.currency || ' ' || to_char(v_ret.monthly_fee_cents / 100.0, 'FM999,999,990.00') || ' has been issued.',
        'actionUrl',
        'https://redwan.work/portal/invoices/' || v_inv_id::text
      ),
      'invoice',
      v_inv_id
    );
  end if;

  insert into public.audit_logs (actor_id, actor_role, client_id, entity_type, entity_id, action, summary)
  values (
    v_admin,
    case when v_admin is not null then 'admin' else 'system' end,
    v_ret.client_id, 'retainer', v_ret.id,
    'retainer.cycle_renewed', 'Renewed retainer cycle and issued ' || v_inv_code
  );

  return jsonb_build_object(
    'retainer_id', v_ret.id,
    'invoice_id', v_inv_id,
    'invoice_code', v_inv_code,
    'period_start', v_next_start,
    'period_end', v_next_end
  );
end;
$$;

revoke all on function public.renew_retainer_cycle_atomic(uuid, uuid, boolean) from public, anon;
grant execute on function public.renew_retainer_cycle_atomic(uuid, uuid, boolean) to authenticated, service_role;

create or replace function public.run_daily_crm_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_overdue int := 0;
  v_expired_proposals int := 0;
  v_auto_accepted int := 0;
  v_renewed_retainers int := 0;
  v_pruned_rate_limits int := 0;
  v_pruned_reservations int := 0;
  v_ret record;
  v_renew_res jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  v_overdue := public.mark_overdue_invoices_atomic();

  update public.proposals
     set status = 'expired'
   where status in ('sent', 'viewed')
     and valid_until is not null
     and valid_until < current_date;
  get diagnostics v_expired_proposals = row_count;

  v_auto_accepted := public.run_auto_accept_deliverables();

  for v_ret in
    select id
      from public.retainer_plans
     where status = 'active'
       and next_invoice_date <= current_date
     for update skip locked
  loop
    v_renew_res := public.renew_retainer_cycle_atomic(v_ret.id, null, false);
    if coalesce((v_renew_res ->> 'skipped')::boolean, false) is not true then
      v_renewed_retainers := v_renewed_retainers + 1;
    end if;
  end loop;

  delete from public.rate_limits
   where window_started_at < now() - interval '24 hours';
  get diagnostics v_pruned_rate_limits = row_count;

  delete from public.vault_upload_reservations
   where expires_at < now();
  get diagnostics v_pruned_reservations = row_count;

  return jsonb_build_object(
    'overdue_invoices', v_overdue,
    'expired_proposals', v_expired_proposals,
    'auto_accepted_deliverables', v_auto_accepted,
    'renewed_retainers', v_renewed_retainers,
    'pruned_rate_limits', v_pruned_rate_limits,
    'pruned_upload_reservations', v_pruned_reservations
  );
end;
$$;

revoke all on function public.run_daily_crm_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_crm_maintenance() to service_role;

-- 7. Enforce tokens_valid_after in caller_account_state() & profiles RLS policies
create or replace function public.caller_account_state()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_active boolean;
  v_valid_after bigint;
  v_iat text := coalesce(auth.jwt() ->> 'iat', '');
begin
  if v_uid is null then
    return 'unauthenticated';
  end if;
  select p.is_active, coalesce(p.tokens_valid_after, 0)
    into v_active, v_valid_after
    from public.profiles p
    where p.id = v_uid;
  if not found then
    return 'missing';
  end if;
  if v_active is not true then
    return 'inactive';
  end if;
  if v_valid_after > 0 and (v_iat !~ '^[0-9]+$' or v_iat::numeric < v_valid_after) then
    return 'revoked';
  end if;
  return 'active';
end;
$$;

revoke all on function public.caller_account_state() from public, anon;
grant execute on function public.caller_account_state() to authenticated, service_role;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    public.is_admin()
    or (
      id = (select auth.uid())
      and is_active is true
      and (
        (
          coalesce((select auth.jwt()) ->> 'iat', '') ~ '^[0-9]+$'
          and ((select auth.jwt()) ->> 'iat')::numeric >= tokens_valid_after
        )
        or (
          coalesce((select auth.jwt()) ->> 'iat', '') = ''
          and tokens_valid_after = 0
        )
      )
    )
  );

drop policy if exists "profiles_update_own_non_privileged" on public.profiles;
create policy "profiles_update_own_non_privileged"
  on public.profiles for update
  using (
    public.is_admin()
    or (
      id = (select auth.uid())
      and is_active is true
      and (
        (
          coalesce((select auth.jwt()) ->> 'iat', '') ~ '^[0-9]+$'
          and ((select auth.jwt()) ->> 'iat')::numeric >= tokens_valid_after
        )
        or (
          coalesce((select auth.jwt()) ->> 'iat', '') = ''
          and tokens_valid_after = 0
        )
      )
    )
  )
  with check (
    public.is_admin()
    or (
      id = (select auth.uid())
      and is_active is true
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
      and mfa_enforced = (select p.mfa_enforced from public.profiles p where p.id = (select auth.uid()))
      and tokens_valid_after = (select p.tokens_valid_after from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- 8. Direct PostgREST RLS hardening: cancellation_requests, notifications, tickets, orders, vault_files
drop policy if exists "cancellation_requests_insert_own" on public.cancellation_requests;
create policy "cancellation_requests_insert_own"
  on public.cancellation_requests for insert
  with check (
    public.is_admin()
    or (
      public.is_active_client()
      and requested_by = (select auth.uid())
      and status = 'pending'
      and resolved_by is null
      and resolved_at is null
      and resolution_notes is null
      and exists (
        select 1 from public.orders o
        where o.id = cancellation_requests.order_id
          and o.client_id = (select auth.uid())
          and o.status not in ('completed'::public.order_status, 'cancelled'::public.order_status)
      )
    )
  );

create or replace function public.guard_notifications_client_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    if new.id is distinct from old.id
       or new.recipient_id is distinct from old.recipient_id
       or new.category is distinct from old.category
       or new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.href is distinct from old.href
       or new.created_at is distinct from old.created_at
    then
      raise exception 'Only read_at may be updated on notifications by non-administrators.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_notifications_client_update() from public, anon, authenticated;
drop trigger if exists notifications_guard_client_update on public.notifications;
create trigger notifications_guard_client_update
  before update on public.notifications
  for each row execute function public.guard_notifications_client_update();

drop policy if exists "ticket_messages_insert_client_or_admin" on public.ticket_messages;
create policy "ticket_messages_insert_client_or_admin"
  on public.ticket_messages for insert
  with check (
    public.is_admin()
    or (
      author_id = (select auth.uid())
      and public.is_active_client()
      and is_internal_note is false
      and exists (
        select 1 from public.tickets t
        where t.id = ticket_messages.ticket_id
          and t.client_id = (select auth.uid())
          and t.status <> 'closed'::public.ticket_status
      )
      and not exists (
        select 1
        from unnest(ticket_messages.attachment_file_ids) as fid(fid)
        left join public.vault_files vf on vf.id = fid.fid
        where vf.id is null or vf.owner_client_id is distinct from (select auth.uid())
      )
    )
  );

drop policy if exists "order_messages_insert_client_or_admin" on public.order_messages;
create policy "order_messages_insert_client_or_admin"
  on public.order_messages for insert
  with check (
    public.is_admin()
    or (
      author_id = (select auth.uid())
      and public.is_active_client()
      and is_internal_note is false
      and exists (
        select 1 from public.orders o
        where o.id = order_messages.order_id
          and o.client_id = (select auth.uid())
          and o.status <> 'cancelled'::public.order_status
      )
      and not exists (
        select 1
        from unnest(order_messages.attachment_file_ids) as fid(fid)
        left join public.vault_files vf on vf.id = fid.fid
        where vf.id is null or vf.owner_client_id is distinct from (select auth.uid())
      )
    )
  );

drop policy if exists "vault_files_select_own_or_admin" on public.vault_files;
create policy "vault_files_select_own_or_admin"
  on public.vault_files for select
  using (
    public.is_admin()
    or bucket = 'public'
    or (
      public.is_active_user()
      and archived_at is null
      and (retention_until is null or retention_until > now())
      and (
        owner_client_id = (select auth.uid())
        or exists (
          select 1 from public.orders o
          where o.id = order_id and o.client_id = (select auth.uid())
        )
      )
    )
  );

-- 9. Atomic consent policy publishing RPC (prevents brief 0-active-policy 503 window)
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

  if v_ver !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'Invalid consent policy version identifier.';
  end if;
  if v_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid consent policy SHA-256 hash.';
  end if;
  if coalesce(btrim(p_canonical), '') = '' then
    raise exception 'Canonical consent policy JSON is required.';
  end if;

  update public.consent_policies
     set is_active = false
   where is_active is true
     and version <> v_ver;

  insert into public.consent_policies (version, canonical, hash, is_active)
  values (v_ver, p_canonical, v_hash, true)
  on conflict (version) do update
    set canonical = excluded.canonical,
        hash = excluded.hash,
        is_active = true;

  return jsonb_build_object('version', v_ver, 'hash', v_hash);
end;
$$;

revoke all on function public.publish_consent_policy_atomic(text, text, text, uuid) from public, anon;
grant execute on function public.publish_consent_policy_atomic(text, text, text, uuid) to authenticated, service_role;

-- 10. Expand rate_limits kind vocabulary for per-account & route throttles
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
      'client-mutation'
    )
  );
