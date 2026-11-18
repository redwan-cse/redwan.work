-- =============================================================================
-- 0026_lifecycle_workflows.sql
-- Phase 2 Atomic CRM & Client Portal Lifecycle Workflows (A1-A4, Billing, Retainers):
--   1. Multi-line draft invoice builder RPC + send/void parity
--   2. Atomic Credit Note issuance (create_credit_note_atomic) with order settlement
--   3. Atomic Manual Payment recording (record_manual_payment_atomic)
--   4. Paid Revision Amendment A3 (invoices.revision_grant_* + RPC + payment hook)
--   5. Client Proposal Decline (decline_proposal_client_atomic)
--   6. Explicit NDA Acceptance Amendment A1 (accept_order_nda_atomic)
--   7. Cancellation Request Resolution Amendment A4 (resolve_order_cancellation_atomic)
--   8. Retainer Cycle Renewal & Hours Reset (renew_retainer_cycle_atomic)
--   9. Order Task -> Progress % automatic sync trigger
-- =============================================================================

alter table public.invoices
  add column if not exists revision_grant_order_id uuid references public.orders (id) on delete set null,
  add column if not exists revision_grant_count int not null default 0 check (revision_grant_count >= 0);

create index if not exists invoices_revision_grant_idx
  on public.invoices (revision_grant_order_id)
  where revision_grant_order_id is not null;

-- 1. Multi-line Draft / Immediate Invoice Builder
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
  v_subtotal int := 0;
  v_discount int := greatest(0, coalesce(p_discount_cents, 0));
  v_tax_bps int := coalesce(p_tax_rate_bps, 0);
  v_taxable int;
  v_tax_cents int;
  v_total_cents int;
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
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::int, nullif(v_item ->> 'quantity', '')::int, 1);
    v_unit := coalesce((v_item ->> 'unit_price_cents')::int, 0);
    if v_desc = '' or v_qty < 1 or v_unit <= 0 then
      raise exception 'Each invoice line item requires a description, qty >= 1, and unit_price_cents > 0.';
    end if;
    v_subtotal := v_subtotal + (v_qty * v_unit);
  end loop;

  if v_discount > v_subtotal then
    raise exception 'Discount cannot exceed invoice subtotal.';
  end if;

  v_taxable := v_subtotal - v_discount;
  v_tax_cents := round((v_taxable::numeric * v_tax_bps::numeric) / 10000.0)::int;
  v_total_cents := v_taxable + v_tax_cents;

  insert into public.invoices (
    client_id, order_id, milestone_id, is_deposit_invoice, status,
    currency, fx_rate_to_usd, subtotal_cents, discount_cents, tax_rate_bps,
    tax_cents, total_cents, due_at, payment_instructions, notes
  )
  values (
    p_client_id, p_order_id, p_milestone_id, false, 'draft'::public.invoice_status,
    upper(btrim(coalesce(p_currency, 'USD'))), coalesce(nullif(p_fx_rate_to_usd, 0), 1.000000),
    v_subtotal, v_discount, v_tax_bps, v_tax_cents, v_total_cents,
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
    jsonb_build_object('total_cents', v_total_cents, 'items_count', v_pos)
  );

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'total_cents', v_total_cents, 'status', v_status);
end;
$$;

revoke all on function public.create_draft_invoice_multi_atomic(uuid, uuid, uuid, text, numeric, int, int, int, text, text, jsonb, boolean, uuid) from public, anon;
grant execute on function public.create_draft_invoice_multi_atomic(uuid, uuid, uuid, text, numeric, int, int, int, text, text, jsonb, boolean, uuid) to authenticated, service_role;

-- Helper: Internal settlement hook when an invoice transitions to 'paid'
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

  if v_inv.revision_grant_order_id is not null and v_inv.revision_grant_count > 0 then
    update public.orders
      set revisions_included = revisions_included + v_inv.revision_grant_count,
          status = case
            when status = 'delivered'::public.order_status then 'revision_requested'::public.order_status
            else status
          end
      where id = v_inv.revision_grant_order_id;
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
end;
$$;

revoke all on function public._handle_invoice_paid_effects(uuid) from public, anon, authenticated;

-- 2. Atomic Credit Note Issuance (CRN-XXXX)
create or replace function public.create_credit_note_atomic(
  p_invoice_id uuid,
  p_admin_id uuid,
  p_amount_cents int,
  p_reason text
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
  v_cn_id uuid;
  v_cn_code text;
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

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Credit note amount must be positive.';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;

  if v_inv.status not in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'overdue'::public.invoice_status) then
    raise exception 'Credit notes can only be issued against open invoices.';
  end if;

  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if p_amount_cents > v_remaining then
    raise exception 'Credit note amount (%) exceeds remaining uncredited balance (%).', p_amount_cents, v_remaining;
  end if;

  insert into public.credit_notes (invoice_id, client_id, currency, fx_rate_to_usd, amount_cents, reason, issued_by)
  values (v_inv.id, v_inv.client_id, v_inv.currency, v_inv.fx_rate_to_usd, p_amount_cents, btrim(p_reason), v_admin)
  returning id, code into v_cn_id, v_cn_code;

  perform public._handle_invoice_paid_effects(v_inv.id);

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_admin, 'admin', v_inv.client_id, v_inv.order_id, 'credit_note', v_cn_id,
    'credit_note.issued', 'Issued credit note ' || v_cn_code || ' on ' || v_inv.code,
    jsonb_build_object('amount_cents', p_amount_cents, 'currency', v_inv.currency, 'reason', btrim(p_reason))
  );

  insert into public.notifications (recipient_id, category, title, body, href)
  values (
    v_inv.client_id,
    'invoice',
    'Credit Note ' || v_cn_code || ' Issued',
    'A credit note was applied to invoice ' || v_inv.code || '.',
    '/portal/invoices/' || v_inv.id::text
  );

  return jsonb_build_object('credit_note_id', v_cn_id, 'code', v_cn_code);
end;
$$;

revoke all on function public.create_credit_note_atomic(uuid, uuid, int, text) from public, anon;
grant execute on function public.create_credit_note_atomic(uuid, uuid, int, text) to authenticated, service_role;

-- 3. Admin Manual / Offline Payment Recording
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

  v_effective_fx := coalesce(nullif(p_fx_rate, 0), v_inv.fx_rate_to_usd, 1.000000);
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

-- Hook review_invoice_payment into _handle_invoice_paid_effects so paid-revision addenda unlock automatically on client payment proof confirm
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

-- 4. Paid Revision Amendment A3 Invoice Issuance
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

  insert into public.invoices (
    client_id, order_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    due_at, revision_grant_order_id, revision_grant_count, notes
  )
  values (
    v_ord.client_id, v_ord.id, false, 'draft'::public.invoice_status, v_ord.currency, 1.000000,
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

-- 5. Client Proposal Decline RPC
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

-- 6. Explicit NDA Acceptance RPC (Amendment A1)
create or replace function public.accept_order_nda_atomic(
  p_order_id uuid,
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
  v_ord public.orders;
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

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found or v_ord.client_id is distinct from v_actor then
    raise exception 'Order not found or unauthorized.';
  end if;

  if v_ord.nda_accepted_at is not null then
    return jsonb_build_object('order_id', v_ord.id, 'nda_accepted_at', v_ord.nda_accepted_at, 'already_accepted', true);
  end if;

  update public.orders
    set nda_accepted_at = now()
    where id = v_ord.id
    returning nda_accepted_at into v_ord.nda_accepted_at;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary)
  values (
    v_actor, 'client', v_ord.client_id, v_ord.id, 'order', v_ord.id,
    'order.nda_accepted', 'Accepted mutual NDA for order ' || v_ord.code
  );

  return jsonb_build_object('order_id', v_ord.id, 'nda_accepted_at', v_ord.nda_accepted_at);
end;
$$;

revoke all on function public.accept_order_nda_atomic(uuid, uuid) from public, anon;
grant execute on function public.accept_order_nda_atomic(uuid, uuid) to authenticated, service_role;

-- 7. Order Cancellation Request Resolution (Amendment A4)
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
    jsonb_build_object('notes', p_resolution_notes)
  );

  return jsonb_build_object('request_id', v_req.id, 'status', p_decision, 'order_id', v_ord.id);
end;
$$;

revoke all on function public.resolve_order_cancellation_atomic(uuid, uuid, text, text) from public, anon;
grant execute on function public.resolve_order_cancellation_atomic(uuid, uuid, text, text) to authenticated, service_role;

-- 8. Retainer Cycle Renewal & Hours Reset
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
    v_ret.client_id, false, 'draft'::public.invoice_status, v_ret.currency, 1.000000,
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

-- 9. Order Task Completion -> Progress Percent Auto-Sync Trigger
create or replace function public.sync_order_task_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  v_total int := 0;
  v_done int := 0;
  v_pct int := 0;
begin
  select count(*)::int, count(*) filter (where is_completed)::int
    into v_total, v_done
    from public.order_tasks
    where order_id = v_order_id;

  if v_total > 0 then
    v_pct := least(95, round((v_done * 100.0) / v_total)::int);
    update public.orders
      set progress_percent = v_pct
      where id = v_order_id
        and status in (
          'pending_requirements'::public.order_status,
          'queued'::public.order_status,
          'in_progress'::public.order_status,
          'in_review'::public.order_status,
          'revision_requested'::public.order_status
        );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_order_task_progress() from public, anon, authenticated;
drop trigger if exists order_tasks_sync_progress on public.order_tasks;
create trigger order_tasks_sync_progress
  after insert or update of is_completed or delete on public.order_tasks
  for each row execute function public.sync_order_task_progress();
