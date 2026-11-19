-- =============================================================================
-- Migration 0028: Post-Audit v2 Security, RLS, Multi-Currency & Ledger Hardening
-- =============================================================================
-- Fixes:
--   1. current_account_role() allows newly registered/invited clients whose JWT
--      app_metadata omits 'role' while still strictly requiring app_metadata.role = 'admin'
--      for admins and rejecting demoted admin tokens. Also syncs auth.users.raw_app_meta_data.
--   2. Restores parent-order client ownership check on order_requirements_update_own,
--      blocks order_id reassignment, and extends guard_verified_order_requirements to INSERT.
--   3. Restores engagement_authorizations existence check in enforce_order_roe_before_progress().
--   4. Upgrades create_admin_order_atomic with p_currency text default 'USD' (replacing 9-arg
--      overload to prevent PostgREST PGRST203 overload ambiguity).
--   5. Validates p_fx_rate > 0 in record_manual_payment_atomic and inherits non-USD FX rate
--      from existing order/client invoices in create_paid_revision_invoice_atomic and
--      renew_retainer_cycle_atomic.
--   6. Blocks hard-deletion of issued/settled invoices and any UPDATE/DELETE on credit_notes.
--   7. Expands audit_logs_select_own_or_admin to filter metadata.isInternalNote,
--      proposal.draft_saved, and invoice.draft_created from client SELECTs.
--   8. Revokes public/anon/authenticated EXECUTE on rls_auto_enable() if present.
-- =============================================================================

-- 1. Account Role Resolution & auth.users app_metadata Sync
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
      )
      or (
        p.role = 'client'::public.user_role
        and coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'client') = 'client'
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_full_name text;
  v_company text;
begin
  v_role := case
    when coalesce(new.raw_app_meta_data ->> 'role', '') = 'admin' then 'admin'::public.user_role
    else 'client'::public.user_role
  end;
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_company := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  insert into public.profiles (id, role, email, full_name, company, mfa_enforced)
  values (new.id, v_role, new.email, v_full_name, v_company, (v_role = 'admin'))
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        company = coalesce(public.profiles.company, excluded.company);

  if v_role = 'client' then
    insert into public.client_profiles (user_id, company_name)
    values (new.id, v_company)
    on conflict (user_id) do nothing;
  end if;

  if coalesce(new.raw_app_meta_data ->> 'role', '') = '' then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role::text)
     where id = new.id;
  end if;

  return new;
end;
$$;

do $$
begin
  update auth.users u
     set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text)
    from public.profiles p
   where p.id = u.id
     and coalesce(u.raw_app_meta_data ->> 'role', '') = '';
exception
  when others then
    null;
end;
$$;

-- 2. Cross-Tenant order_requirements Ownership & Insert/Update Lock
drop policy if exists "order_requirements_update_own" on public.order_requirements;
create policy "order_requirements_update_own"
  on public.order_requirements for update
  using (
    client_id = auth.uid()
    and public.is_active_client()
    and verified_by_admin_at is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
    )
  )
  with check (
    client_id = auth.uid()
    and public.is_active_client()
    and verified_by_admin_at is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
    )
  );

create or replace function public.guard_verified_order_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'Order requirements cannot be reassigned to a different order.';
  end if;

  if auth.role() <> 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' and new.verified_by_admin_at is not null then
      raise exception 'Only administrators can verify order requirements.';
    end if;
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
  before insert or update on public.order_requirements
  for each row execute function public.guard_verified_order_requirements();

-- 3. Require Real Attested engagement_authorizations Row Before RoE Order Execution
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
     and (
       new.roe_signed_at is null
       or not exists (
         select 1
           from public.engagement_authorizations ea
          where ea.order_id = new.id
            and ea.ownership_attested is true
       )
     )
  then
    raise exception 'Rules of Engagement (RoE) digital authorization is required before entering execution.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;

-- 4. Multi-Currency create_admin_order_atomic (single signature with default p_currency = 'USD')
drop function if exists public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int
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
  p_currency text default 'USD'
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
    v_currency, p_total_cents, 0, 0, p_total_cents,
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
      p_client_id, v_order_id, 'draft'::public.invoice_status, true, v_currency, 1.000000,
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
    'currency', v_currency
  );
end;
$$;

revoke all on function public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int, text
) from public, anon;
grant execute on function public.create_admin_order_atomic(
  uuid, uuid, text, text, public.service_pillar, int, int, boolean, int, text
) to authenticated, service_role;

-- 5. Positive FX Validation in record_manual_payment_atomic & Inherited FX on Revisions/Retainers
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

  if p_fx_rate is not null and p_fx_rate <= 0 then
    raise exception 'fx_rate_to_usd must be a positive number.';
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

  select coalesce(i.fx_rate_to_usd, 1.000000) into v_fx
    from public.invoices i
   where i.order_id = v_ord.id
     and i.currency = v_ord.currency
   order by i.created_at desc
   limit 1;
  v_fx := coalesce(v_fx, 1.000000);

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
    'Paid Revision Invoice ' || v_inv_code || ' Ready',
    'Settle invoice ' || v_inv_code || ' to unlock ' || p_extra_revisions || ' additional revision round(s) on ' || v_ord.code || '.',
    '/portal/invoices/' || v_inv_id::text
  );

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_ord.client_id, v_ord.id, 'invoice', v_inv_id,
    'order.paid_revision_invoiced', 'Issued paid revision invoice ' || v_inv_code || ' for ' || v_ord.code,
    jsonb_build_object('extra_revisions', p_extra_revisions, 'fee_cents', p_fee_cents)
  );

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code);
end;
$$;

revoke all on function public.create_paid_revision_invoice_atomic(uuid, uuid, int, int, text) from public, anon;
grant execute on function public.create_paid_revision_invoice_atomic(uuid, uuid, int, int, text) to authenticated, service_role;

create or replace function public.renew_retainer_cycle_atomic(
  p_retainer_id uuid,
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
  v_ret public.retainer_plans;
  v_fx numeric := 1.000000;
  v_days int;
  v_next_start date;
  v_next_end date;
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

  select * into v_ret from public.retainer_plans where id = p_retainer_id for update;
  if not found or v_ret.status <> 'active' then
    raise exception 'Only active retainers can be renewed.';
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

  insert into public.audit_logs (actor_id, actor_role, client_id, entity_type, entity_id, action, summary)
  values (
    v_admin,
    case when v_admin is null then 'system' else 'admin' end,
    v_ret.client_id,
    'retainer_plan',
    v_ret.id,
    'retainer.cycle_renewed',
    'Renewed retainer ' || v_ret.title || ' & issued ' || v_inv_code
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

revoke all on function public.renew_retainer_cycle_atomic(uuid, uuid) from public, anon;
grant execute on function public.renew_retainer_cycle_atomic(uuid, uuid) to authenticated, service_role;

-- 6. Guard Issued/Settled Invoices & Credit Notes Against Direct Deletion/Mutation
create or replace function public.guard_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'::public.invoice_status then
    raise exception 'Issued or settled invoices are immutable financial ledger records and cannot be deleted.';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_invoice_delete() from public, anon, authenticated;
drop trigger if exists invoices_guard_delete on public.invoices;
create trigger invoices_guard_delete
  before delete on public.invoices
  for each row execute function public.guard_invoice_delete();

create or replace function public.guard_credit_note_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Issued credit notes are immutable financial ledger records and cannot be modified or deleted.';
end;
$$;

revoke all on function public.guard_credit_note_immutable() from public, anon, authenticated;
drop trigger if exists credit_notes_guard_immutable on public.credit_notes;
create trigger credit_notes_guard_immutable
  before update or delete on public.credit_notes
  for each row execute function public.guard_credit_note_immutable();

-- 7. Expanded Audit Log Client Filter
drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin"
  on public.audit_logs for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and (client_id = auth.uid() or actor_id = auth.uid())
      and action not in (
        'client.crm_updated',
        'client.note_added',
        'client.notes_updated',
        'client.note_deleted',
        'client.tier_updated',
        'client.followup_updated',
        'order.internal_note_added',
        'admin.internal_note',
        'proposal.draft_saved',
        'invoice.draft_created'
      )
      and coalesce((metadata ->> 'internal')::boolean, false) is false
      and coalesce((metadata ->> 'isInternalNote')::boolean, false) is false
    )
  );

-- 8. Tighten rls_auto_enable ACL if present in environment
do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
exception
  when others then
    null;
end;
$$;
