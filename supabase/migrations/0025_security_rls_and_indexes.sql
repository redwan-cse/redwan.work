-- =============================================================================
-- 0025_security_rls_and_indexes.sql
-- Phase 1 Security, Database Integrity, Financial Guards & Index Hardening:
--   1. profiles.tokens_valid_after epoch token cutoff + unconditional AAL2 is_admin()
--   2. Hardened create_package_order_atomic (catalog lookup) & forced cybersecurity RoE
--   3. Financial RLS & trigger guards (payments DELETE block, FX lock, invoice status guard)
--   4. Locked verified order_requirements, immutable signed engagement_authorizations,
--      expanded enforce_order_roe_before_progress, sanitized client audit_logs,
--      strict tickets insert policy
--   5. Atomic vault upload quota reservation (concurrent presign protection)
--   6. Missing foreign-key and query-path composite indexes
-- =============================================================================

-- 1. Account authority cutoff (tokens_valid_after) & unconditional AAL2 admin check
alter table public.profiles
  add column if not exists tokens_valid_after bigint not null default 0;

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
    and p.role::text = coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role(), '') = 'admin'
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_role() is not null
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;

create or replace function public.is_active_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role(), '') = 'client'
$$;

revoke all on function public.is_active_client() from public, anon;
grant execute on function public.is_active_client() to authenticated, service_role;

create or replace function public.invalidate_changed_account_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     or (old.is_active is true and new.is_active is false) then
    new.tokens_valid_after := greatest(
      old.tokens_valid_after,
      floor(extract(epoch from clock_timestamp()))::bigint + 1
    );
  elsif new.tokens_valid_after < old.tokens_valid_after then
    raise exception 'Account token cutoff cannot move backward.';
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_changed_account_tokens() from public, anon, authenticated;
drop trigger if exists invalidate_changed_account_tokens on public.profiles;
create trigger invalidate_changed_account_tokens
  before update on public.profiles
  for each row execute function public.invalidate_changed_account_tokens();

-- 2. Financial RLS, Invoice Status Transition Guards, Payment Delete & FX Lock
create or replace function public.guard_payment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.invoice_payment_cascade', true), '') <> 'on' then
    raise exception 'Payments cannot be deleted directly.';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_payment_delete() from public, anon, authenticated;

create or replace function public.mark_invoice_payment_cascade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.invoice_payment_cascade', 'on', true);
  return old;
end;
$$;

revoke all on function public.mark_invoice_payment_cascade() from public, anon, authenticated;

drop trigger if exists payment_delete_guard on public.payments;
create trigger payment_delete_guard
  before delete on public.payments
  for each row execute function public.guard_payment_delete();

drop trigger if exists invoice_delete_payment_cascade on public.invoices;
create trigger invoice_delete_payment_cascade
  before delete on public.invoices
  for each row execute function public.mark_invoice_payment_cascade();

-- Payments: replace admin FOR ALL with select-only + RPC-only mutations
drop policy if exists "payments_admin_all" on public.payments;
drop policy if exists "payments_admin_select" on public.payments;
create policy "payments_admin_select"
  on public.payments for select
  using (public.is_admin());

-- Lock payment FX rate to parent invoice FX rate & validate proof attachments
create or replace function public.enforce_payment_invariants()
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
  new.fx_rate_to_usd := v_inv.fx_rate_to_usd;

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

-- Invoice immutability & controlled status transitions
create or replace function public.guard_invoice_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_items jsonb;
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
        raise exception 'Issued invoices are immutable and cannot modify financial totals, currency, FX rate, dates, or snapshot.';
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

  return new;
end;
$$;

-- Controlled invoice transition RPCs
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
  if v_inv.amount_paid_cents > 0 then
    raise exception 'Partially paid invoices cannot be voided directly; issue a credit note instead.';
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

create or replace function public.mark_overdue_invoices_atomic()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  perform set_config('app.invoice_status_transition', 'on', true);
  with updated as (
    update public.invoices
       set status = 'overdue'::public.invoice_status
     where status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
       and due_at is not null
       and due_at < current_date
    returning id, client_id, order_id, code
  )
  insert into public.audit_logs (actor_role, client_id, order_id, entity_type, entity_id, action, summary)
  select 'system', u.client_id, u.order_id, 'invoice', u.id, 'invoice.overdue', 'Marked invoice ' || u.code || ' overdue'
  from updated u;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_overdue_invoices_atomic() from public, anon, authenticated;
grant execute on function public.mark_overdue_invoices_atomic() to service_role;

-- Update existing RPCs so every invoice status update sets app.invoice_status_transition = 'on'
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
  v_taxable int;
  v_tax_cents int;
  v_total_cents int;
  v_inv_id uuid;
  v_inv_code text;
begin
  if v_caller_role <> 'service_role' and not public.is_admin() then
    raise exception 'Admin authorization required to issue invoices.';
  end if;

  if p_subtotal_cents <= 0 or p_discount_cents < 0 or p_discount_cents > p_subtotal_cents then
    raise exception 'Invalid invoice subtotal or discount.';
  end if;
  if p_tax_rate_bps < 0 or p_tax_rate_bps > 10000 then
    raise exception 'Invalid tax_rate_bps.';
  end if;

  v_taxable := p_subtotal_cents - p_discount_cents;
  v_tax_cents := round((v_taxable::numeric * p_tax_rate_bps::numeric) / 10000.0)::int;
  v_total_cents := v_taxable + v_tax_cents;

  insert into public.invoices (
    client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    due_at, notes
  )
  values (
    p_client_id, p_order_id, coalesce(p_is_deposit, false), 'draft'::public.invoice_status,
    upper(btrim(coalesce(p_currency, 'USD'))), coalesce(p_fx_rate_to_usd, 1.000000),
    p_subtotal_cents, p_discount_cents, p_tax_rate_bps, v_tax_cents, v_total_cents,
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

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'total_cents', v_total_cents);
end;
$$;

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

  v_deposit_cents := round((v_prop.total_cents::numeric * v_prop.deposit_percent::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, service_id, proposal_id, inquiry_id, title, description, pillar,
    status, pricing_model, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, deposit_percent, revisions_included, auto_accept_days,
    requires_roe, due_at
  )
  values (
    v_prop.client_id, v_prop.service_id, v_prop.id, v_prop.inquiry_id, v_prop.title,
    v_prop.scope_summary, v_prop.pillar, v_initial_status, v_prop.pricing_model,
    v_prop.currency, v_prop.subtotal_cents, v_prop.discount_cents, v_prop.tax_cents,
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
      client_id, order_id, is_deposit_invoice, status, currency,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      v_prop.client_id, v_order_id, true, 'draft'::public.invoice_status, v_prop.currency,
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
    select coalesce(sum(i.total_cents), 0)::bigint
      into v_invoiced_cents
      from public.invoices i
      where i.order_id = v_order.id
        and i.status <> 'void'::public.invoice_status;

    v_balance_cents := greatest(0, (v_order.total_cents::bigint - v_invoiced_cents)::int);

    if v_balance_cents > 0 then
      insert into public.invoices (
        client_id, order_id, is_deposit_invoice, status, currency,
        subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
        due_at, notes
      )
      values (
        v_order.client_id, v_order.id, false, 'draft'::public.invoice_status, v_order.currency,
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

create or replace function public.review_invoice_payment(
  p_payment_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_fx_rate numeric default 1.000000,
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
  v_order public.orders;
  v_effective_fx numeric;
  v_remaining_before int;
  v_capped_native_cents int;
  v_capped_usd_delta bigint;
  v_confirmed_total bigint;
  v_new_inv_status public.invoice_status;
  v_has_unpaid boolean := false;
  v_has_accepted_final boolean := false;
begin
  if v_caller_role = 'service_role' then
    v_admin := p_admin_id;
  else
    if v_caller_uid is null or not public.is_admin() then
      raise exception 'Admin MFA (AAL2) authorization required.';
    end if;
    if p_admin_id is not null and p_admin_id is distinct from v_caller_uid then
      raise exception 'Admin actor mismatch: p_admin_id must match authenticated caller.';
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

  v_effective_fx := coalesce(nullif(p_fx_rate, 0), v_inv.fx_rate_to_usd, v_pay.fx_rate_to_usd, 1.000000);
  if v_effective_fx <= 0 then
    raise exception 'FX rate must be positive.';
  end if;

  v_remaining_before := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
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

  if v_inv.order_id is not null and v_new_inv_status = 'paid'::public.invoice_status then
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

    if not v_has_unpaid and v_has_accepted_final and v_order.status <> 'completed'::public.order_status then
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

  update public.client_profiles
    set lifetime_value_usd_cents = lifetime_value_usd_cents + coalesce(v_capped_usd_delta, 0)
    where user_id = v_pay.client_id;

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
  v_final_inv_id uuid;
  v_has_unpaid boolean;
  v_count int := 0;
begin
  if auth.role() <> 'service_role' then
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
      o.total_cents as order_total_cents,
      o.status as order_status
    from public.deliverables d
    join public.orders o on o.id = d.order_id
    where d.status = 'submitted'::public.deliverable_status
      and d.auto_accept_at is not null
      and d.auto_accept_at <= now()
    for update of d, o skip locked
  loop
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
          and i.status <> 'void'::public.invoice_status;

      v_balance_cents := greatest(0, (v_rec.order_total_cents::bigint - v_invoiced_cents)::int);

      if v_balance_cents > 0 then
        insert into public.invoices (
          client_id, order_id, is_deposit_invoice, status, currency,
          subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
          due_at, notes
        )
        values (
          v_rec.client_id, v_rec.order_id, false, 'draft'::public.invoice_status, v_rec.order_currency,
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

-- 3. Authoritative Package Order RPC & Forced Cybersecurity RoE
create or replace function public.create_admin_order_atomic(
  p_admin_id uuid,
  p_client_id uuid,
  p_title text,
  p_description text,
  p_pillar public.service_pillar,
  p_total_cents int,
  p_deposit_percent int,
  p_requires_roe boolean,
  p_due_days int
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

  v_effective_roe := coalesce(p_requires_roe, false) or (p_pillar = 'cybersecurity'::public.service_pillar);
  v_deposit_cents := round((p_total_cents::numeric * p_deposit_percent::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, title, description, pillar, pricing_model, status, requires_roe,
    currency, subtotal_cents, discount_cents, tax_cents, total_cents,
    deposit_percent, due_at
  )
  values (
    p_client_id, btrim(p_title), p_description, p_pillar, 'fixed_package'::public.pricing_model,
    v_initial_status, v_effective_roe,
    'USD', p_total_cents, 0, 0, p_total_cents,
    p_deposit_percent, now() + make_interval(days => greatest(1, coalesce(p_due_days, 10)))
  )
  returning id, code into v_order_id, v_order_code;

  v_m0 := round(p_total_cents::numeric * 0.30)::int;
  v_m1 := round(p_total_cents::numeric * 0.50)::int;
  v_m2 := greatest(0, p_total_cents - v_m0 - v_m1);

  insert into public.order_milestones (order_id, position, title, weight_percent, amount_cents, currency, status)
  values
    (v_order_id, 0, 'Kickoff & Scope Alignment', 30, v_m0, 'USD', 'in_progress'),
    (v_order_id, 1, 'Core Execution & Verification', 50, v_m1, 'USD', 'pending'),
    (v_order_id, 2, 'Final Deliverable Handover & Sign-Off', 20, v_m2, 'USD', 'pending');

  if v_deposit_cents > 0 then
    insert into public.invoices (
      client_id, order_id, status, is_deposit_invoice, currency, fx_rate_to_usd,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      p_client_id, v_order_id, 'draft'::public.invoice_status, true, 'USD', 1.000000,
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
    'status', v_initial_status
  );
end;
$$;

create or replace function public.create_package_order_atomic(
  p_client_id uuid,
  p_service_id uuid,
  p_title text,
  p_description text,
  p_pillar public.service_pillar,
  p_is_custom_deal boolean,
  p_requires_roe boolean,
  p_revisions_included int,
  p_total_cents int,
  p_deposit_percent int,
  p_delivery_days int,
  p_target_scope_notes text,
  p_requirements_responses jsonb,
  p_milestone_titles text[],
  p_initial_message text,
  p_deposit_item_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := auth.role();
  v_caller_uid uuid := auth.uid();
  v_client uuid;
  v_tier text := lower(btrim(coalesce(p_requirements_responses ->> 'package_tier', '')));
  v_pkg record;
  v_effective_pillar public.service_pillar;
  v_effective_roe boolean;
  v_effective_revisions int;
  v_effective_total int;
  v_effective_deposit_pct int;
  v_effective_days int;
  v_effective_currency text;
  v_auto_accept_days int;
  v_deposit_cents int;
  v_initial_status public.order_status;
  v_order_id uuid;
  v_order_code text;
  v_inv_id uuid := null;
  v_m0 int;
  v_m1 int;
  v_m2 int;
  v_t0 text;
  v_t1 text;
  v_t2 text;
begin
  if v_caller_role = 'service_role' then
    v_client := p_client_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Active client authentication required.';
    end if;
    if p_client_id is not null and p_client_id is distinct from v_caller_uid then
      raise exception 'Client actor mismatch.';
    end if;
    v_client := v_caller_uid;
  end if;

  if v_client is null or not exists (
    select 1 from public.profiles p
    where p.id = v_client and p.role = 'client'::public.user_role and p.is_active is true
  ) then
    raise exception 'Active client profile required.';
  end if;

  if coalesce(p_is_custom_deal, false) is true or p_service_id is null then
    raise exception 'Custom engagements must be submitted as a quote inquiry for administrator review.';
  end if;

  if v_tier = '' then
    raise exception 'Package tier selection is required.';
  end if;

  select
    s.pillar,
    s.requires_roe,
    sp.price_cents,
    sp.currency,
    sp.deposit_percent,
    sp.delivery_days,
    sp.revisions_included,
    sp.auto_accept_days
  into v_pkg
  from public.services s
  join public.service_packages sp on sp.service_id = s.id
  where s.id = p_service_id
    and s.is_public is true
    and sp.is_active is true
    and lower(btrim(sp.tier_name)) = v_tier
  limit 1;

  if not found then
    raise exception 'Selected catalog service package is invalid or inactive.';
  end if;

  if v_pkg.price_cents is null or v_pkg.price_cents <= 0 then
    raise exception 'Selected package does not have a fixed catalog price; submit a quote inquiry instead.';
  end if;

  v_effective_pillar := v_pkg.pillar;
  v_effective_roe := (v_pkg.requires_roe is true) or (v_effective_pillar = 'cybersecurity'::public.service_pillar);
  v_effective_revisions := greatest(0, coalesce(v_pkg.revisions_included, 2));
  v_effective_total := v_pkg.price_cents;
  v_effective_deposit_pct := greatest(0, least(100, coalesce(v_pkg.deposit_percent, 50)));
  v_effective_days := greatest(1, coalesce(v_pkg.delivery_days, 7));
  v_effective_currency := coalesce(nullif(btrim(v_pkg.currency), ''), 'USD');
  v_auto_accept_days := greatest(1, coalesce(v_pkg.auto_accept_days, 7));

  v_deposit_cents := round((v_effective_total::numeric * v_effective_deposit_pct::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, service_id, title, description, pillar, pricing_model,
    status, is_custom_deal, requires_roe, revisions_included, auto_accept_days,
    currency, subtotal_cents, discount_cents, tax_cents, total_cents,
    deposit_percent, proposed_budget_cents, proposed_delivery_days, due_at
  )
  values (
    v_client,
    p_service_id,
    btrim(p_title),
    p_description,
    v_effective_pillar,
    'fixed_package'::public.pricing_model,
    v_initial_status,
    false,
    v_effective_roe,
    v_effective_revisions,
    v_auto_accept_days,
    v_effective_currency,
    v_effective_total,
    0,
    0,
    v_effective_total,
    v_effective_deposit_pct,
    null,
    v_effective_days,
    now() + make_interval(days => v_effective_days)
  )
  returning id, code into v_order_id, v_order_code;

  v_m0 := round(v_effective_total::numeric * 0.30)::int;
  v_m1 := round(v_effective_total::numeric * 0.45)::int;
  v_m2 := greatest(0, v_effective_total - v_m0 - v_m1);

  v_t0 := coalesce(p_milestone_titles[1], 'Kickoff & Requirements Alignment');
  v_t1 := coalesce(p_milestone_titles[2], 'Core Delivery');
  v_t2 := coalesce(p_milestone_titles[3], 'Final Deliverable & Sign-off');

  insert into public.order_milestones (order_id, position, title, weight_percent, amount_cents, currency, status)
  values
    (v_order_id, 0, v_t0, 30, v_m0, v_effective_currency, 'in_progress'),
    (v_order_id, 1, v_t1, 45, v_m1, v_effective_currency, 'pending'),
    (v_order_id, 2, v_t2, 25, v_m2, v_effective_currency, 'pending');

  insert into public.order_requirements (order_id, client_id, target_scope_notes, responses)
  values (
    v_order_id,
    v_client,
    nullif(btrim(p_target_scope_notes), ''),
    coalesce(p_requirements_responses, '{}'::jsonb)
  );

  if coalesce(btrim(p_initial_message), '') <> '' then
    insert into public.order_messages (order_id, author_id, body, is_internal_note)
    values (v_order_id, v_client, btrim(p_initial_message), false);
  end if;

  if v_deposit_cents > 0 then
    insert into public.invoices (
      client_id, order_id, status, is_deposit_invoice, currency, fx_rate_to_usd,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      v_client, v_order_id, 'draft'::public.invoice_status, true, v_effective_currency, 1.000000,
      v_deposit_cents, 0, 0, 0, v_deposit_cents,
      current_date + 3,
      coalesce(nullif(btrim(p_deposit_item_label), ''), v_order_code || ' kickoff deposit')
    )
    returning id into v_inv_id;

    insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
    values (
      v_inv_id,
      0,
      coalesce(nullif(btrim(p_deposit_item_label), ''), v_order_code || ': ' || btrim(p_title) || ' (' || v_effective_deposit_pct || '% Deposit)'),
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
    where user_id = v_client;

  return jsonb_build_object(
    'order_id', v_order_id,
    'code', v_order_code,
    'deposit_invoice_id', v_inv_id,
    'status', v_initial_status
  );
end;
$$;

-- 4. Requirements Lock, RoE Re-Sign Block, Order Queued RoE Check, Audit Filter & Tickets Policy
drop policy if exists "order_requirements_update_own" on public.order_requirements;
create policy "order_requirements_update_own"
  on public.order_requirements for update
  using (client_id = auth.uid() and public.is_active_client() and verified_by_admin_at is null)
  with check (client_id = auth.uid() and public.is_active_client() and verified_by_admin_at is null);

create or replace function public.guard_verified_order_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    if tg_op = 'UPDATE' and old.verified_by_admin_at is not null then
      raise exception 'Verified order requirements are locked and cannot be edited.';
    end if;
    if tg_op = 'UPDATE' and (
      new.verified_by_admin_at is distinct from old.verified_by_admin_at
    ) then
      raise exception 'Only administrators can verify order requirements.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_verified_order_requirements() from public, anon, authenticated;
drop trigger if exists order_requirements_guard_verified on public.order_requirements;
create trigger order_requirements_guard_verified
  before update on public.order_requirements
  for each row execute function public.guard_verified_order_requirements();

-- Block RoE re-sign / overwrite once orders.roe_signed_at is set
drop policy if exists "roe_insert_own_client" on public.engagement_authorizations;
create policy "roe_insert_own_client"
  on public.engagement_authorizations for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and ownership_attested is true
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
        and o.roe_signed_at is null
    )
  );

create or replace function public.guard_signed_engagement_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signed_at timestamptz;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Signed Rules of Engagement attestations are immutable legal records.';
  end if;

  select o.roe_signed_at into v_signed_at
    from public.orders o
    where o.id = new.order_id;

  if v_signed_at is not null then
    raise exception 'Rules of Engagement have already been signed for this order.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_signed_engagement_authorization() from public, anon, authenticated;
drop trigger if exists engagement_authorizations_guard_immutable on public.engagement_authorizations;
create trigger engagement_authorizations_guard_immutable
  before insert or update or delete on public.engagement_authorizations
  for each row execute function public.guard_signed_engagement_authorization();

-- Expand RoE prerequisite guard to include queued + all active delivery states
create or replace function public.enforce_order_roe_before_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requires_roe is true
     and new.status in (
       'queued'::public.order_status,
       'in_progress'::public.order_status,
       'in_review'::public.order_status,
       'delivered'::public.order_status,
       'completed'::public.order_status
     )
     and new.roe_signed_at is null
  then
    raise exception 'Rules of Engagement (RoE) digital authorization is required before entering execution.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;

-- Filter internal admin CRM events out of client audit_logs reads
drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin"
  on public.audit_logs for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and (client_id = auth.uid() or actor_id = auth.uid())
      and action not in (
        'client.note_added',
        'client.note_deleted',
        'client.tier_updated',
        'client.followup_updated',
        'order.internal_note_added',
        'admin.internal_note'
      )
      and coalesce((metadata ->> 'internal')::boolean, false) is false
    )
  );

-- Harden client ticket inserts against pre-populating resolved/closed states
drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own"
  on public.tickets for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and status = 'open'::public.ticket_status
    and first_responded_at is null
    and resolved_at is null
    and (
      order_id is null
      or exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

-- 5. Concurrent-Safe Pending R2 Vault Upload Reservations (500 MiB Quota Enforcement)
create table if not exists public.vault_upload_reservations (
  r2_key text primary key,
  client_id uuid not null references public.profiles (id) on delete cascade,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists vault_upload_reservations_client_exp_idx
  on public.vault_upload_reservations (client_id, expires_at);

alter table public.vault_upload_reservations enable row level security;
revoke all on public.vault_upload_reservations from public, anon, authenticated;

create or replace function public.reserve_vault_upload_quota(
  p_client_id uuid,
  p_r2_key text,
  p_size_bytes bigint,
  p_ttl_seconds int default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_bytes bigint := 0;
  v_pending_bytes bigint := 0;
  v_quota_bytes constant bigint := 524288000; -- 500 MiB active per client
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required to reserve vault quota.';
  end if;
  if p_client_id is null or p_size_bytes is null or p_size_bytes <= 0 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 901));

  delete from public.vault_upload_reservations
  where client_id = p_client_id
    and expires_at <= now();

  select coalesce(sum(vf.size_bytes), 0)::bigint
    into v_active_bytes
    from public.vault_files vf
    where vf.owner_client_id = p_client_id
      and vf.archived_at is null;

  select coalesce(sum(r.size_bytes), 0)::bigint
    into v_pending_bytes
    from public.vault_upload_reservations r
    where r.client_id = p_client_id
      and r.expires_at > now()
      and r.r2_key <> p_r2_key
      and not exists (
        select 1 from public.vault_files vf where vf.r2_key = r.r2_key
      );

  if (v_active_bytes + v_pending_bytes + p_size_bytes) > v_quota_bytes then
    return false;
  end if;

  insert into public.vault_upload_reservations (r2_key, client_id, size_bytes, expires_at)
  values (
    p_r2_key,
    p_client_id,
    p_size_bytes,
    now() + make_interval(secs => greatest(60, least(3600, coalesce(p_ttl_seconds, 900))))
  )
  on conflict (r2_key) do update set
    size_bytes = excluded.size_bytes,
    expires_at = excluded.expires_at;

  return true;
end;
$$;

revoke all on function public.reserve_vault_upload_quota(uuid, text, bigint, int) from public, anon, authenticated;
grant execute on function public.reserve_vault_upload_quota(uuid, text, bigint, int) to service_role;

create or replace function public.enforce_vault_file_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_bytes bigint := 0;
  v_quota_bytes constant bigint := 524288000;
begin
  delete from public.vault_upload_reservations where r2_key = new.r2_key;

  if new.owner_client_id is not null and new.archived_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.owner_client_id::text, 901));
    select coalesce(sum(vf.size_bytes), 0)::bigint
      into v_active_bytes
      from public.vault_files vf
      where vf.owner_client_id = new.owner_client_id
        and vf.archived_at is null;

    if (v_active_bytes + new.size_bytes::bigint) > v_quota_bytes then
      raise exception 'Client vault storage quota exceeded (500 MB active limit).';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vault_file_quota() from public, anon, authenticated;

-- Expand rate_limits check for chat messages & auth sub-actions while keeping backward compat
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
      'auth',
      'retry-recovery',
      'retry-invite',
      'portal-presign',
      'password-login',
      'register-ip',
      'order-message'
    )
  );

-- 6. Missing FK & Composite Performance Indexes
create index if not exists vault_files_ticket_idx
  on public.vault_files (ticket_id) where ticket_id is not null;
create index if not exists vault_files_invoice_idx
  on public.vault_files (invoice_id) where invoice_id is not null;
create index if not exists portfolio_items_published_sort_idx
  on public.portfolio_items (is_published, sort_order, created_at desc);
create index if not exists resume_items_visible_sort_idx
  on public.resume_items (is_visible, section, sort_order);
create index if not exists inquiry_attachments_retained_created_idx
  on public.inquiry_attachments (retained, created_at);
create index if not exists proposals_status_valid_until_idx
  on public.proposals (status, valid_until) where valid_until is not null;
create index if not exists payments_status_submitted_idx
  on public.payments (status, submitted_at desc);
create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);
create index if not exists credit_notes_client_idx
  on public.credit_notes (client_id, created_at desc);
