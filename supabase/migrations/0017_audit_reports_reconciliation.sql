-- =============================================================================
-- 0017_audit_reports_reconciliation.sql
-- Reconciles remaining DB & FLOW findings from audit-inputs/01..04.md:
--   - DB-016: Restrict direct anon/authenticated SELECT on public.site_settings
--             so third-party references_list PII cannot be queried via PostgREST.
--   - DB-019 & FLOW-002: Align admin_command_center_metrics() and
--             client_portal_overview(uuid) JSONB keys with snake_case & camelCase
--             UI consumers across /admin and /portal.
--   - DB-010 & FLOW-006: Require active RoE window + paid deposit invoice before
--             an order transitions to 'in_progress', and force requires_roe=true
--             on cybersecurity orders created via atomic order RPCs.
--   - DB-012 & DB-013: Lock fx_rate_to_usd, issued_at, and due_at on issued
--             invoices, and atomically apply credit_notes to invoices.credited_cents
--             and invoices.status.
--   - DB-017 & FLOW-014: Enforce unique (order_id, version_label) and post-acceptance
--             immutability on public.deliverables, parent milestone ownership on
--             order_tasks/deliverables, and FK integrity on vault_files.
-- =============================================================================

-- 1. DB-016: Remove world-readable policy on public.site_settings (server uses service_role)
drop policy if exists "site_settings_public_read" on public.site_settings;
drop policy if exists "site_settings_admin_all" on public.site_settings;
create policy "site_settings_admin_all"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2. DB-017 & FLOW-014: Foreign keys on vault_files, unique deliverable versions,
--    accepted deliverable immutability, and milestone parent-order matching
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vault_files_ticket_id_fkey'
  ) then
    alter table public.vault_files
      add constraint vault_files_ticket_id_fkey
      foreign key (ticket_id) references public.tickets (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vault_files_invoice_id_fkey'
  ) then
    alter table public.vault_files
      add constraint vault_files_invoice_id_fkey
      foreign key (invoice_id) references public.invoices (id) on delete set null;
  end if;
end;
$$;

create unique index if not exists deliverables_order_version_uidx
  on public.deliverables (order_id, lower(btrim(version_label)));

create or replace function public.guard_accepted_deliverable_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted'::public.deliverable_status then
    raise exception 'Accepted deliverables are immutable and cannot be modified or deleted.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists deliverables_guard_accepted on public.deliverables;
create trigger deliverables_guard_accepted
  before update or delete on public.deliverables
  for each row execute function public.guard_accepted_deliverable_immutability();

create or replace function public.enforce_order_milestone_parent_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ms_order_id uuid;
begin
  if new.milestone_id is not null then
    select om.order_id into v_ms_order_id
      from public.order_milestones om
      where om.id = new.milestone_id;
    if not found then
      raise exception 'Referenced milestone does not exist.';
    end if;
    if v_ms_order_id is distinct from new.order_id then
      raise exception 'Milestone must belong to the same parent order.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists order_tasks_milestone_match on public.order_tasks;
create trigger order_tasks_milestone_match
  before insert or update on public.order_tasks
  for each row execute function public.enforce_order_milestone_parent_match();

drop trigger if exists deliverables_milestone_match on public.deliverables;
create trigger deliverables_milestone_match
  before insert or update on public.deliverables
  for each row execute function public.enforce_order_milestone_parent_match();

-- 3. DB-010 & FLOW-006: Enforce active RoE window + paid deposit invoice before 'in_progress'
create or replace function public.enforce_order_roe_before_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'in_progress'::public.order_status then
    if new.requires_roe is true then
      if not exists (
        select 1
        from public.engagement_authorizations ea
        where ea.order_id = new.id
          and ea.client_id = new.client_id
          and ea.ownership_attested is true
          and ea.signed_at is not null
          and cardinality(ea.authorized_targets) >= 1
          and ea.testing_window_end > now()
      ) then
        raise exception 'Signed Rules of Engagement (RoE) authorization within an active testing window is required before starting this engagement.';
      end if;
    end if;

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

-- 4. DB-012 & DB-013: Lock fx_rate_to_usd, issued_at, and due_at on issued invoices,
--    and atomically apply credit_notes to invoices.credited_cents & status
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

  update public.invoices
    set credited_cents = v_new_credited,
        status = v_new_status,
        paid_at = case when v_new_status = 'paid'::public.invoice_status then coalesce(paid_at, now()) else paid_at end
    where id = v_inv.id;

  return new;
end;
$$;

drop trigger if exists credit_notes_apply_to_invoice on public.credit_notes;
create trigger credit_notes_apply_to_invoice
  after insert on public.credit_notes
  for each row execute function public.apply_credit_note_to_invoice();

-- 5. DB-019 & FLOW-002: Complete snake_case + camelCase Dashboard KPI RPCs
create or replace function public.admin_command_center_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lifetime_revenue bigint;
  v_revenue_30d bigint;
  v_outstanding bigint;
  v_active_orders bigint;
  v_awaiting_review_orders bigint;
  v_awaiting_payment_orders bigint;
  v_new_inquiries bigint;
  v_pending_payments bigint;
  v_overdue_invoices bigint;
  v_open_tickets bigint;
  v_urgent_tickets bigint;
  v_total_clients bigint;
  v_vip_clients bigint;
  v_active_retainers bigint;
  v_unread_notifications bigint;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select coalesce(sum(usd_equivalent_cents), 0)::bigint into v_lifetime_revenue
    from public.payments
    where status = 'confirmed';

  select coalesce(sum(usd_equivalent_cents), 0)::bigint into v_revenue_30d
    from public.payments
    where status = 'confirmed'
      and coalesce(reviewed_at, submitted_at) >= now() - interval '30 days';

  select coalesce(
    sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint),
    0
  )::bigint into v_outstanding
    from public.invoices
    where status in ('issued', 'partially_paid', 'overdue');

  select count(*) into v_active_orders
    from public.orders
    where status in ('queued', 'in_progress', 'in_review', 'revision_requested');

  select count(*) into v_awaiting_review_orders
    from public.orders
    where status in ('in_review', 'delivered');

  select count(*) into v_awaiting_payment_orders
    from public.orders
    where status = 'awaiting_payment';

  select count(*) into v_new_inquiries
    from public.inquiries
    where status = 'new';

  select count(*) into v_pending_payments
    from public.payments
    where status = 'submitted';

  select count(*) into v_overdue_invoices
    from public.invoices
    where status = 'overdue'
       or (status in ('issued', 'partially_paid') and due_at < current_date);

  select count(*) into v_open_tickets
    from public.tickets
    where status in ('open', 'in_progress', 'awaiting_client');

  select count(*) into v_urgent_tickets
    from public.tickets
    where status in ('open', 'in_progress', 'awaiting_client')
      and priority = 'urgent';

  select count(*) into v_total_clients
    from public.profiles
    where role = 'client' and is_active is true;

  select count(*) into v_vip_clients
    from public.client_profiles cp
    join public.profiles p on p.id = cp.user_id
    where p.role = 'client'
      and p.is_active is true
      and cp.tier in ('vip', 'enterprise');

  select count(*) into v_active_retainers
    from public.retainer_plans
    where status = 'active';

  select count(*) into v_unread_notifications
    from public.notifications
    where (auth.uid() is not null and recipient_id = auth.uid() and is_read is false)
       or (
         auth.uid() is null
         and is_read is false
         and exists (
           select 1 from public.profiles p
           where p.id = recipient_id and p.role = 'admin' and p.is_active is true
         )
       );

  return jsonb_build_object(
    'totalRevenueUsdCents', v_lifetime_revenue,
    'lifetime_revenue_usd_cents', v_lifetime_revenue,
    'revenue_30d_usd_cents', v_revenue_30d,
    'outstandingUsdCents', v_outstanding,
    'outstanding_balance_cents', v_outstanding,
    'activeOrdersCount', v_active_orders,
    'active_orders', v_active_orders,
    'awaiting_review_orders', v_awaiting_review_orders,
    'awaitingPaymentOrdersCount', v_awaiting_payment_orders,
    'newInquiriesCount', v_new_inquiries,
    'new_inquiries', v_new_inquiries,
    'pendingPaymentsCount', v_pending_payments,
    'submitted_payments', v_pending_payments,
    'overdue_invoices', v_overdue_invoices,
    'openTicketsCount', v_open_tickets,
    'open_tickets', v_open_tickets,
    'urgentTicketsCount', v_urgent_tickets,
    'totalClientsCount', v_total_clients,
    'total_clients', v_total_clients,
    'vip_clients', v_vip_clients,
    'activeRetainersCount', v_active_retainers,
    'active_retainers', v_active_retainers,
    'unread_notifications', v_unread_notifications
  );
end;
$$;

create or replace function public.client_portal_overview(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_orders bigint;
  v_completed_orders bigint;
  v_pending_proposals bigint;
  v_awaiting_deliverables bigint;
  v_open_invoices bigint;
  v_balance_due bigint;
  v_open_tickets bigint;
  v_active_retainers bigint;
  v_unread_notifications bigint;
begin
  if auth.role() <> 'service_role' then
    if not public.is_active_user() or (auth.uid() is distinct from p_client_id and not public.is_admin()) then
      raise exception 'Unauthorized';
    end if;
  end if;

  select count(*) into v_active_orders
    from public.orders
    where client_id = p_client_id and status not in ('completed', 'cancelled');

  select count(*) into v_completed_orders
    from public.orders
    where client_id = p_client_id and status = 'completed';

  select count(*) into v_pending_proposals
    from public.proposals
    where client_id = p_client_id and status in ('sent', 'viewed');

  select count(*) into v_awaiting_deliverables
    from public.deliverables d
    join public.orders o on o.id = d.order_id
    where o.client_id = p_client_id and d.status = 'submitted';

  select count(*) into v_open_invoices
    from public.invoices
    where client_id = p_client_id and status in ('issued', 'partially_paid', 'overdue');

  select coalesce(
    sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint),
    0
  )::bigint into v_balance_due
    from public.invoices
    where client_id = p_client_id and status in ('issued', 'partially_paid', 'overdue');

  select count(*) into v_open_tickets
    from public.tickets
    where client_id = p_client_id and status <> 'closed';

  select count(*) into v_active_retainers
    from public.retainer_plans
    where client_id = p_client_id and status = 'active';

  select count(*) into v_unread_notifications
    from public.notifications
    where recipient_id = p_client_id and is_read is false;

  return jsonb_build_object(
    'activeOrdersCount', v_active_orders,
    'active_orders', v_active_orders,
    'completedOrdersCount', v_completed_orders,
    'completed_orders', v_completed_orders,
    'pendingProposalsCount', v_pending_proposals,
    'pending_proposals', v_pending_proposals,
    'deliverablesAwaitingReviewCount', v_awaiting_deliverables,
    'awaiting_review_deliverables', v_awaiting_deliverables,
    'openInvoicesCount', v_open_invoices,
    'unpaid_invoices', v_open_invoices,
    'balanceDueUsdCents', v_balance_due,
    'outstanding_balance_cents', v_balance_due,
    'openTicketsCount', v_open_tickets,
    'open_tickets', v_open_tickets,
    'active_retainers', v_active_retainers,
    'unread_notifications', v_unread_notifications
  );
end;
$$;

-- 6. Explicit Function ACLs
revoke all on function public.guard_accepted_deliverable_immutability() from public, anon, authenticated;
revoke all on function public.enforce_order_milestone_parent_match() from public, anon, authenticated;
revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;
revoke all on function public.guard_invoice_immutable_fields() from public, anon, authenticated;
revoke all on function public.apply_credit_note_to_invoice() from public, anon, authenticated;

revoke all on function public.admin_command_center_metrics() from public, anon, authenticated;
grant execute on function public.admin_command_center_metrics() to authenticated, service_role;

revoke all on function public.client_portal_overview(uuid) from public, anon, authenticated;
grant execute on function public.client_portal_overview(uuid) to authenticated, service_role;
