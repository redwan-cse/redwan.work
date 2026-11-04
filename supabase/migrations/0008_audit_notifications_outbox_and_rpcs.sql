-- 0008_audit_notifications_outbox_and_rpcs.sql
-- Immutable Audit Trail, In-App Notifications, Durable Email Outbox & Atomic Workflow RPCs

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text not null default 'system',
  client_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_client_idx on public.audit_logs (client_id, created_at desc) where client_id is not null;
create index audit_logs_order_idx on public.audit_logs (order_id, created_at desc) where order_id is not null;
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_own_or_admin"
  on public.audit_logs for select
  using (client_id = auth.uid() or actor_id = auth.uid() or public.is_admin());

create policy "audit_logs_admin_insert"
  on public.audit_logs for insert
  with check (public.is_admin() or actor_id = auth.uid());

create or replace function public.refuse_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Audit log entries are immutable.';
end;
$$;

create trigger audit_logs_immutable_update
  before update on public.audit_logs
  for each row execute function public.refuse_audit_log_mutation();

-- In-App Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  href text,
  category text not null default 'general',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_idx on public.notifications (recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own_or_admin"
  on public.notifications for select
  using (recipient_id = auth.uid() or public.is_admin());

create policy "notifications_update_own_read"
  on public.notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy "notifications_admin_all"
  on public.notifications for all
  using (public.is_admin())
  with check (public.is_admin());

-- Durable Email Outbox & Delivery Audit Log (Resend)
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  entity_type text,
  entity_id uuid,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  resend_id text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_outbox_pending_idx on public.email_outbox (status, next_attempt_at) where status in ('pending', 'failed');

alter table public.email_outbox enable row level security;

create policy "email_outbox_admin_all"
  on public.email_outbox for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  subject text,
  entity_type text,
  entity_id uuid,
  resend_id text,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index email_log_created_idx on public.email_log (created_at desc);

alter table public.email_log enable row level security;

create policy "email_log_admin_select"
  on public.email_log for select
  using (public.is_admin());

-- Atomic RPC 1: Accept Proposal -> Create Order + Milestones + Deposit Invoice (Amendment A1)
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
  v_prop public.proposals;
  v_order_id uuid;
  v_invoice_id uuid := null;
  v_deposit_cents int;
  v_initial_status public.order_status;
begin
  select * into v_prop
    from public.proposals
    where id = p_proposal_id
    for update;

  if not found then
    raise exception 'Proposal not found.';
  end if;

  if v_prop.client_id is distinct from p_actor_id and not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin' and p.is_active is true
  ) then
    raise exception 'Unauthorized to accept this proposal.';
  end if;

  if v_prop.status = 'accepted'::public.proposal_status then
    select o.id into v_order_id from public.orders o where o.proposal_id = v_prop.id limit 1;
    return jsonb_build_object('order_id', v_order_id, 'already_accepted', true);
  end if;

  if v_prop.status not in ('sent'::public.proposal_status, 'viewed'::public.proposal_status, 'draft'::public.proposal_status) then
    raise exception 'Proposal is no longer open for acceptance.';
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
      issued_at, due_at, notes
    )
    values (
      v_prop.client_id, v_order_id, true, 'issued'::public.invoice_status, v_prop.currency,
      v_deposit_cents, 0, 0, 0, v_deposit_cents,
      now(), current_date + 7,
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
    p_actor_id, 'client', v_prop.client_id, v_order_id, 'proposal', v_prop.id,
    'proposal.accepted', 'Accepted proposal ' || v_prop.code || ' and created order'
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'deposit_invoice_id', v_invoice_id,
    'status', v_initial_status
  );
end;
$$;

grant execute on function public.accept_proposal_and_create_order(uuid, uuid) to authenticated, service_role;

-- Atomic RPC 2: Review Deliverable (Accept or Request Revision with Revision Cap Enforcement — Amendment A2 & A3)
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
  v_deliv public.deliverables;
  v_order public.orders;
begin
  if p_decision not in ('accepted', 'revision_requested') then
    raise exception 'Invalid deliverable decision.';
  end if;

  select * into v_deliv from public.deliverables where id = p_deliverable_id for update;
  if not found then
    raise exception 'Deliverable not found.';
  end if;

  select * into v_order from public.orders where id = v_deliv.order_id for update;
  if v_order.client_id is distinct from p_actor_id and not exists (
    select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin' and p.is_active is true
  ) then
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
          reviewed_by = p_actor_id,
          reviewed_at = now()
      where id = v_deliv.id;

    update public.orders
      set status = 'revision_requested'::public.order_status,
          revisions_used = revisions_used + 1
      where id = v_order.id;

    insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
    values (
      p_actor_id, 'client', v_order.client_id, v_order.id, 'deliverable', v_deliv.id,
      'deliverable.revision_requested', 'Requested revision on deliverable ' || v_deliv.code,
      jsonb_build_object('feedback', p_feedback, 'revisions_used', v_order.revisions_used + 1)
    );
  else
    update public.deliverables
      set status = 'accepted'::public.deliverable_status,
          client_feedback = p_feedback,
          reviewed_by = p_actor_id,
          reviewed_at = now()
      where id = v_deliv.id;

    if v_deliv.milestone_id is not null then
      update public.order_milestones
        set status = 'approved', completed_at = now()
        where id = v_deliv.milestone_id;
    end if;

    if v_deliv.is_final_delivery is true then
      update public.orders
        set status = 'completed'::public.order_status,
            progress_percent = 100,
            completed_at = now()
        where id = v_order.id;

      update public.client_profiles
        set completed_orders_count = completed_orders_count + 1
        where user_id = v_order.client_id;
    end if;

    insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary)
    values (
      p_actor_id, 'client', v_order.client_id, v_order.id, 'deliverable', v_deliv.id,
      'deliverable.accepted', 'Accepted deliverable ' || v_deliv.code
    );
  end if;

  return jsonb_build_object('status', p_decision, 'order_id', v_order.id);
end;
$$;

grant execute on function public.review_order_deliverable(uuid, uuid, text, text) to authenticated, service_role;

-- Atomic RPC 3: Confirm or Reject Payment & Recompute Invoice + Order + USD LTV (Amendment A1 & C1)
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
  v_pay public.payments;
  v_inv public.invoices;
  v_confirmed_total bigint;
  v_usd_delta bigint;
  v_new_inv_status public.invoice_status;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin' and p.is_active is true
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
          reviewed_by = p_admin_id,
          reviewed_at = now()
      where id = v_pay.id;

    insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
    values (
      p_admin_id, 'admin', v_pay.client_id, v_pay.order_id, 'payment', v_pay.id,
      'payment.rejected', 'Rejected payment ' || v_pay.code,
      jsonb_build_object('reason', p_reason)
    );

    return jsonb_build_object('payment_status', 'rejected', 'invoice_status', v_inv.status);
  end if;

  update public.payments
    set status = 'confirmed'::public.payment_status,
        fx_rate_to_usd = coalesce(p_fx_rate, v_pay.fx_rate_to_usd, 1.000000),
        reviewed_by = p_admin_id,
        reviewed_at = now()
    where id = v_pay.id
    returning usd_equivalent_cents into v_usd_delta;

  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed_total
    from public.payments
    where invoice_id = v_inv.id and status = 'confirmed'::public.payment_status;

  v_new_inv_status := case
    when (v_confirmed_total + v_inv.credited_cents) >= v_inv.total_cents then 'paid'::public.invoice_status
    when v_confirmed_total > 0 then 'partially_paid'::public.invoice_status
    else v_inv.status
  end;

  update public.invoices
    set amount_paid_cents = least(v_confirmed_total::int, v_inv.total_cents),
        status = v_new_inv_status,
        paid_at = case when v_new_inv_status = 'paid'::public.invoice_status then coalesce(paid_at, now()) else paid_at end
    where id = v_inv.id;

  -- Unlock order from 'awaiting_payment' to 'pending_requirements' once deposit invoice is paid
  if v_inv.order_id is not null and v_inv.is_deposit_invoice is true and v_new_inv_status = 'paid'::public.invoice_status then
    update public.orders
      set status = 'pending_requirements'::public.order_status
      where id = v_inv.order_id and status = 'awaiting_payment'::public.order_status;
  end if;

  update public.client_profiles
    set lifetime_value_usd_cents = lifetime_value_usd_cents + coalesce(v_usd_delta, 0)
    where user_id = v_pay.client_id;

  insert into public.audit_logs (actor_id, actor_role, client_id, order_id, entity_type, entity_id, action, summary, metadata)
  values (
    p_admin_id, 'admin', v_pay.client_id, v_pay.order_id, 'payment', v_pay.id,
    'payment.confirmed', 'Confirmed payment ' || v_pay.code || ' for invoice ' || v_inv.code,
    jsonb_build_object('amount_cents', v_pay.amount_cents, 'currency', v_pay.currency, 'usd_equivalent_cents', v_usd_delta)
  );

  return jsonb_build_object('payment_status', 'confirmed', 'invoice_status', v_new_inv_status);
end;
$$;

grant execute on function public.review_invoice_payment(uuid, uuid, text, numeric, text) to authenticated, service_role;

-- Atomic RPC 4: Auto-accept overdue deliverables (Amendment A2)
create or replace function public.run_auto_accept_deliverables()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_count int := 0;
begin
  for v_rec in
    select d.id, d.code, d.order_id, d.milestone_id, d.is_final_delivery, o.client_id
    from public.deliverables d
    join public.orders o on o.id = d.order_id
    where d.status = 'submitted'::public.deliverable_status
      and d.auto_accept_at is not null
      and d.auto_accept_at <= now()
    for update of d, o
  loop
    update public.deliverables
      set status = 'accepted'::public.deliverable_status,
          client_feedback = 'Auto-accepted after review window elapsed.',
          reviewed_at = now()
      where id = v_rec.id;

    if v_rec.milestone_id is not null then
      update public.order_milestones
        set status = 'approved', completed_at = now()
        where id = v_rec.milestone_id;
    end if;

    if v_rec.is_final_delivery is true then
      update public.orders
        set status = 'completed'::public.order_status,
            progress_percent = 100,
            completed_at = now()
        where id = v_rec.order_id;

      update public.client_profiles
        set completed_orders_count = completed_orders_count + 1
        where user_id = v_rec.client_id;
    end if;

    insert into public.audit_logs (actor_role, client_id, order_id, entity_type, entity_id, action, summary)
    values (
      'system', v_rec.client_id, v_rec.order_id, 'deliverable', v_rec.id,
      'deliverable.auto_accepted', 'Auto-accepted deliverable ' || v_rec.code || ' after review window elapsed'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.run_auto_accept_deliverables() to service_role;

-- Dashboard Summary RPCs for Admin Command Center & Client Portal
create or replace function public.admin_command_center_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and current_user <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  return jsonb_build_object(
    'totalRevenueUsdCents', coalesce((select sum(usd_equivalent_cents) from public.payments where status = 'confirmed'), 0),
    'outstandingUsdCents', coalesce((
      select sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint)
      from public.invoices
      where status in ('issued', 'partially_paid', 'overdue')
    ), 0),
    'activeOrdersCount', (select count(*) from public.orders where status in ('queued', 'in_progress', 'in_review', 'revision_requested')),
    'awaitingPaymentOrdersCount', (select count(*) from public.orders where status = 'awaiting_payment'),
    'newInquiriesCount', (select count(*) from public.inquiries where status = 'new'),
    'pendingPaymentsCount', (select count(*) from public.payments where status = 'submitted'),
    'openTicketsCount', (select count(*) from public.tickets where status in ('open', 'in_progress')),
    'urgentTicketsCount', (select count(*) from public.tickets where status in ('open', 'in_progress') and priority = 'urgent'),
    'totalClientsCount', (select count(*) from public.profiles where role = 'client'),
    'activeRetainersCount', (select count(*) from public.retainer_plans where status = 'active')
  );
end;
$$;

grant execute on function public.admin_command_center_metrics() to authenticated, service_role;

create or replace function public.client_portal_overview(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_client_id and not public.is_admin() and current_user <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  return jsonb_build_object(
    'activeOrdersCount', (
      select count(*) from public.orders
      where client_id = p_client_id and status not in ('completed', 'cancelled')
    ),
    'completedOrdersCount', (
      select count(*) from public.orders
      where client_id = p_client_id and status = 'completed'
    ),
    'pendingProposalsCount', (
      select count(*) from public.proposals
      where client_id = p_client_id and status in ('sent', 'viewed')
    ),
    'deliverablesAwaitingReviewCount', (
      select count(*) from public.deliverables d
      join public.orders o on o.id = d.order_id
      where o.client_id = p_client_id and d.status = 'submitted'
    ),
    'openInvoicesCount', (
      select count(*) from public.invoices
      where client_id = p_client_id and status in ('issued', 'partially_paid', 'overdue')
    ),
    'balanceDueUsdCents', coalesce((
      select sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint)
      from public.invoices
      where client_id = p_client_id and status in ('issued', 'partially_paid', 'overdue')
    ), 0),
    'openTicketsCount', (
      select count(*) from public.tickets
      where client_id = p_client_id and status <> 'closed'
    )
  );
end;
$$;

grant execute on function public.client_portal_overview(uuid) to authenticated, service_role;
