-- =============================================================================
-- 0013_financial_invariants_and_atomic_flows.sql
-- Remediates Phase D Money Invariants & Complete Order-Deliver-Pay Lifecycle:
--   - Exact cent conservation constraints on proposals, orders, and invoices
--   - Order/Invoice/Payment/CreditNote currency & tenant consistency triggers
--   - Immutable invoice snapshots & post-draft invoice_items lock
--   - Payment reference idempotency index & overpayment prevention
--   - LTV overpayment cap + atomic 50/50 split-deposit final balance invoicing
--     and order completion settlement
--   - Atomic RPCs for invoice issuance, admin order creation, and portal
--     package/custom-deal order placement
-- =============================================================================

-- 1. Arithmetic conservation constraints on proposals, orders, and invoices
alter table public.proposals
  drop constraint if exists proposals_totals_conservation_check;
alter table public.proposals
  add constraint proposals_totals_conservation_check check (
    discount_cents <= subtotal_cents
    and total_cents = (subtotal_cents - discount_cents + tax_cents)
  );

alter table public.orders
  drop constraint if exists orders_totals_conservation_check;
alter table public.orders
  add constraint orders_totals_conservation_check check (
    discount_cents <= subtotal_cents
    and total_cents = (subtotal_cents - discount_cents + tax_cents)
  );

alter table public.invoices
  drop constraint if exists invoices_totals_conservation_check;
alter table public.invoices
  add constraint invoices_totals_conservation_check check (
    discount_cents <= subtotal_cents
    and total_cents = (subtotal_cents - discount_cents + tax_cents)
    and (amount_paid_cents + credited_cents) <= total_cents
  );

-- 2. Invoice consistency, immutable_snapshot capture, and post-draft lock
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

  if tg_op = 'UPDATE' and old.status <> 'draft'::public.invoice_status then
    if new.client_id is distinct from old.client_id
       or new.order_id is distinct from old.order_id
       or new.number is distinct from old.number
       or new.currency is distinct from old.currency
       or new.subtotal_cents is distinct from old.subtotal_cents
       or new.discount_cents is distinct from old.discount_cents
       or new.tax_rate_bps is distinct from old.tax_rate_bps
       or new.tax_cents is distinct from old.tax_cents
       or new.total_cents is distinct from old.total_cents
       or (old.immutable_snapshot is not null and new.immutable_snapshot is distinct from old.immutable_snapshot)
    then
      raise exception 'Issued invoices cannot modify financial totals, currency, or immutable snapshot.';
    end if;
  end if;

  -- Freeze immutable_snapshot when leaving 'draft' (or when inserted directly as non-draft)
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

drop trigger if exists invoices_guard_immutable on public.invoices;
create trigger invoices_guard_immutable
  before insert or update on public.invoices
  for each row execute function public.guard_invoice_immutable_fields();

create or replace function public.guard_invoice_items_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_status public.invoice_status;
begin
  select i.status into v_status from public.invoices i where i.id = v_invoice_id;
  if v_status is not null and v_status <> 'draft'::public.invoice_status then
    raise exception 'Cannot modify line items of a non-draft invoice.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_items_guard_immutability on public.invoice_items;
create trigger invoice_items_guard_immutability
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_items_immutability();

-- 3. Payment idempotency, currency match, and overpayment prevention
create unique index if not exists payments_active_reference_uidx
  on public.payments (invoice_id, lower(btrim(reference)))
  where status in ('submitted'::public.payment_status, 'confirmed'::public.payment_status);

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

  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if new.amount_cents > v_remaining then
    raise exception 'Payment amount (%) exceeds remaining invoice balance (%).', new.amount_cents, v_remaining;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_invariants on public.payments;
create trigger payments_enforce_invariants
  before insert on public.payments
  for each row execute function public.enforce_payment_invariants();

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
  if new.client_id is distinct from v_inv.client_id then
    raise exception 'Credit note client_id must match invoice client_id.';
  end if;
  if new.currency is distinct from v_inv.currency then
    raise exception 'Credit note currency must match invoice currency.';
  end if;
  v_remaining := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents - v_inv.credited_cents);
  if new.amount_cents > v_remaining then
    raise exception 'Credit note amount exceeds remaining uncredited balance.';
  end if;
  return new;
end;
$$;

drop trigger if exists credit_notes_enforce_invariants on public.credit_notes;
create trigger credit_notes_enforce_invariants
  before insert on public.credit_notes
  for each row execute function public.enforce_credit_note_invariants();

-- 4. Helper to issue an invoice atomically (draft -> items -> issued with snapshot)
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

  update public.invoices
    set status = 'issued'::public.invoice_status,
        issued_at = now()
    where id = v_inv_id;

  return jsonb_build_object('invoice_id', v_inv_id, 'code', v_inv_code, 'total_cents', v_total_cents);
end;
$$;

-- 5. Updated Proposal Acceptance RPC (draft -> invoice_items -> issued snapshot)
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

-- 6. Deliverable Review + Split-Deposit Final Balance Invoice & Completion Settlement
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

-- 7. Payment Review RPC (LTV cap + final balance order completion settlement)
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

  v_effective_fx := coalesce(nullif(p_fx_rate, 0), v_pay.fx_rate_to_usd, 1.000000);
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

-- 8. Auto-accept deliverables job updated with split-deposit balance invoice settlement
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

-- 9. Atomic Order Placement RPCs (Admin & Portal Package/Custom Deal)
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
    v_initial_status, coalesce(p_requires_roe, false),
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
  v_deposit_cents int;
  v_initial_status public.order_status;
  v_order_id uuid;
  v_order_code text;
  v_inv_id uuid := null;
  v_titles text[];
  v_len int;
  v_idx int;
  v_running_cents int := 0;
  v_running_weight int := 0;
  v_item_cents int;
  v_item_weight int;
begin
  if v_caller_role = 'service_role' then
    v_client := p_client_id;
  else
    if v_caller_uid is null or not public.is_active_client() then
      raise exception 'Client authentication required.';
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
    raise exception 'Active client account required.';
  end if;

  if p_total_cents <= 0 or p_deposit_percent < 0 or p_deposit_percent > 100 then
    raise exception 'Invalid package order total or deposit percent.';
  end if;

  v_deposit_cents := round((p_total_cents::numeric * p_deposit_percent::numeric) / 100.0)::int;
  v_initial_status := case
    when v_deposit_cents > 0 then 'awaiting_payment'::public.order_status
    else 'pending_requirements'::public.order_status
  end;

  insert into public.orders (
    client_id, service_id, title, description, pillar,
    pricing_model, status, requires_roe, revisions_included,
    currency, subtotal_cents, discount_cents, tax_cents, total_cents,
    deposit_percent, due_at, is_custom_deal, proposed_budget_cents, proposed_delivery_days
  )
  values (
    v_client,
    p_service_id,
    btrim(p_title),
    p_description,
    p_pillar,
    case when coalesce(p_is_custom_deal, false) then 'custom_milestone'::public.pricing_model else 'fixed_package'::public.pricing_model end,
    v_initial_status,
    coalesce(p_requires_roe, false),
    greatest(0, coalesce(p_revisions_included, 2)),
    'USD',
    p_total_cents, 0, 0, p_total_cents,
    p_deposit_percent,
    now() + make_interval(days => greatest(1, coalesce(p_delivery_days, 7))),
    coalesce(p_is_custom_deal, false),
    case when coalesce(p_is_custom_deal, false) then p_total_cents else null end,
    case when coalesce(p_is_custom_deal, false) then greatest(1, coalesce(p_delivery_days, 7)) else null end
  )
  returning id, code into v_order_id, v_order_code;

  if nullif(btrim(coalesce(p_target_scope_notes, '')), '') is not null then
    insert into public.order_requirements (order_id, client_id, target_scope_notes, responses)
    values (v_order_id, v_client, btrim(p_target_scope_notes), coalesce(p_requirements_responses, '{}'::jsonb))
    on conflict (order_id) do update
      set target_scope_notes = excluded.target_scope_notes,
          responses = excluded.responses,
          updated_at = now();
  end if;

  v_titles := coalesce(p_milestone_titles, array[]::text[]);
  if coalesce(array_length(v_titles, 1), 0) = 0 then
    v_titles := array[
      'Scope & Architecture Alignment',
      'Core Execution & Implementation',
      'Verification & Final Delivery Sign-Off'
    ];
  end if;

  v_len := array_length(v_titles, 1);
  for v_idx in 1..v_len loop
    if v_idx = v_len then
      v_item_cents := greatest(0, p_total_cents - v_running_cents);
      v_item_weight := greatest(0, 100 - v_running_weight);
    else
      v_item_cents := round(p_total_cents::numeric / v_len::numeric)::int;
      v_item_weight := round(100.0 / v_len::numeric)::int;
      v_running_cents := v_running_cents + v_item_cents;
      v_running_weight := v_running_weight + v_item_weight;
    end if;

    insert into public.order_milestones (order_id, position, title, weight_percent, amount_cents, currency, status)
    values (
      v_order_id,
      v_idx - 1,
      v_titles[v_idx],
      v_item_weight,
      v_item_cents,
      'USD',
      case when v_idx = 1 then 'in_progress' else 'pending' end
    );
  end loop;

  if nullif(btrim(coalesce(p_initial_message, '')), '') is not null then
    insert into public.order_messages (order_id, author_id, body, is_internal_note)
    values (
      v_order_id,
      v_client,
      replace(p_initial_message, '{{ORDER_CODE}}', v_order_code),
      false
    );
  end if;

  if v_deposit_cents > 0 then
    insert into public.invoices (
      client_id, order_id, status, is_deposit_invoice, currency, fx_rate_to_usd,
      subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
      due_at, notes
    )
    values (
      v_client, v_order_id, 'draft'::public.invoice_status, true, 'USD', 1.000000,
      v_deposit_cents, 0, 0, 0, v_deposit_cents,
      current_date + 5,
      'Kickoff Deposit (' || p_deposit_percent || '%) for ' || v_order_code || ': ' || btrim(p_title)
    )
    returning id into v_inv_id;

    insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
    values (
      v_inv_id,
      0,
      coalesce(nullif(btrim(p_deposit_item_label), ''), 'Package Kickoff Deposit') || ' — ' || v_order_code,
      1,
      v_deposit_cents
    );

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

-- 10. Explicit Function ACLs for all new/updated functions
revoke all on function public.guard_invoice_immutable_fields() from public, anon, authenticated;
revoke all on function public.guard_invoice_items_immutability() from public, anon, authenticated;
revoke all on function public.enforce_payment_invariants() from public, anon, authenticated;
revoke all on function public.enforce_credit_note_invariants() from public, anon, authenticated;

revoke all on function public.issue_invoice_atomic(uuid, uuid, boolean, text, numeric, int, int, int, int, text, text) from public, anon, authenticated;
grant execute on function public.issue_invoice_atomic(uuid, uuid, boolean, text, numeric, int, int, int, int, text, text) to authenticated, service_role;

revoke all on function public.accept_proposal_and_create_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_proposal_and_create_order(uuid, uuid) to authenticated, service_role;

revoke all on function public.review_order_deliverable(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_order_deliverable(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.review_invoice_payment(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.review_invoice_payment(uuid, uuid, text, numeric, text) to authenticated, service_role;

revoke all on function public.run_auto_accept_deliverables() from public, anon, authenticated;
grant execute on function public.run_auto_accept_deliverables() to service_role;

revoke all on function public.create_admin_order_atomic(uuid, uuid, text, text, public.service_pillar, int, int, boolean, int) from public, anon, authenticated;
grant execute on function public.create_admin_order_atomic(uuid, uuid, text, text, public.service_pillar, int, int, boolean, int) to authenticated, service_role;

revoke all on function public.create_package_order_atomic(uuid, uuid, text, text, public.service_pillar, boolean, boolean, int, int, int, int, text, jsonb, text[], text, text) from public, anon, authenticated;
grant execute on function public.create_package_order_atomic(uuid, uuid, text, text, public.service_pillar, boolean, boolean, int, int, int, int, text, jsonb, text[], text, text) to authenticated, service_role;
