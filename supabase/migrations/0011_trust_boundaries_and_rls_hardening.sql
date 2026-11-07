-- =============================================================================
-- 0011_trust_boundaries_and_rls_hardening.sql
-- Remediates Phase B Trust Boundaries:
--   B-1 (RPC-ACTOR-BINDING): Bind SECURITY DEFINER RPCs to auth.uid() & role
--   B-2 (FUNCTION-ACLS): Explicit REVOKE ALL FROM PUBLIC, anon, authenticated
--   B-3 (ADMIN-AAL2): Enforce JWT aal2 on public.is_admin() when mfa_enforced
--   B-4/B-5/B-6 (TENANT-ISOLATION): Active-account checks, parent-child tenant
--       ownership, client-only RoE/proposal/deliverable sign-off, vault_files
--       prefix/tenant trigger, and immutable append-only audit_logs.
-- =============================================================================

-- 1. Authoritative account & assurance predicates
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active is true
    );
$$;

create or replace function public.is_active_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'client'::public.user_role
        and p.is_active is true
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
        and p.is_active is true
        and (
          p.mfa_enforced is false
          or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
        )
    );
$$;

-- 2. Immutable append-only audit_logs (block DELETE as well as UPDATE; restrict INSERT)
drop trigger if exists audit_logs_immutable_delete on public.audit_logs;
create trigger audit_logs_immutable_delete
  before delete on public.audit_logs
  for each row execute function public.refuse_audit_log_mutation();

drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin"
  on public.audit_logs for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and (client_id = auth.uid() or actor_id = auth.uid())
    )
  );

drop policy if exists "audit_logs_admin_insert" on public.audit_logs;
create policy "audit_logs_admin_insert"
  on public.audit_logs for insert
  with check (public.is_admin());

-- 3. Active-account & parent-child ownership hardening across all RLS policies

-- profiles & client_profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using ((id = auth.uid() and is_active is true) or public.is_admin());

drop policy if exists "client_profiles_select_own_or_admin" on public.client_profiles;
create policy "client_profiles_select_own_or_admin"
  on public.client_profiles for select
  using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

-- proposals & proposal_milestones (hide unsent drafts from clients; require active user)
drop policy if exists "proposals_select_own_or_admin" on public.proposals;
create policy "proposals_select_own_or_admin"
  on public.proposals for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and client_id = auth.uid()
      and status <> 'draft'::public.proposal_status
    )
  );

drop policy if exists "proposal_milestones_select_via_proposal" on public.proposal_milestones;
create policy "proposal_milestones_select_via_proposal"
  on public.proposal_milestones for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.proposals pr
        where pr.id = proposal_id
          and pr.client_id = auth.uid()
          and pr.status <> 'draft'::public.proposal_status
      )
    )
  );

-- orders
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin"
  on public.orders for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

-- engagement_authorizations (RoE): genuine client-only legal attestation; admins may only SELECT
drop policy if exists "roe_select_own_or_admin" on public.engagement_authorizations;
create policy "roe_select_own_or_admin"
  on public.engagement_authorizations for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

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
    )
  );

drop policy if exists "roe_admin_all" on public.engagement_authorizations;

-- order_requirements: enforce parent order ownership
drop policy if exists "order_requirements_select_own_or_admin" on public.order_requirements;
create policy "order_requirements_select_own_or_admin"
  on public.order_requirements for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "order_requirements_insert_own" on public.order_requirements;
create policy "order_requirements_insert_own"
  on public.order_requirements for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
    )
  );

drop policy if exists "order_requirements_update_own" on public.order_requirements;
create policy "order_requirements_update_own"
  on public.order_requirements for update
  using (
    public.is_active_client()
    and client_id = auth.uid()
    and verified_by_admin_at is null
  )
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and verified_by_admin_at is null
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
    )
  );

-- order_milestones, order_tasks, deliverables
drop policy if exists "order_milestones_select_via_order" on public.order_milestones;
create policy "order_milestones_select_via_order"
  on public.order_milestones for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

drop policy if exists "order_tasks_select_visible_or_admin" on public.order_tasks;
create policy "order_tasks_select_visible_or_admin"
  on public.order_tasks for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and is_client_visible is true
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

drop policy if exists "deliverables_select_via_order" on public.deliverables;
create policy "deliverables_select_via_order"
  on public.deliverables for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

-- vault_files: active-user guard + tenant/key-prefix integrity trigger
drop policy if exists "vault_files_select_own_or_admin" on public.vault_files;
create policy "vault_files_select_own_or_admin"
  on public.vault_files for select
  using (
    public.is_admin()
    or bucket = 'public'
    or (
      public.is_active_user()
      and archived_at is null
      and (
        owner_client_id = auth.uid()
        or exists (
          select 1 from public.orders o
          where o.id = order_id and o.client_id = auth.uid()
        )
      )
    )
  );

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

  -- Prevent a client upload from claiming an R2 object key outside their tenant prefix
  if new.bucket = 'private'
     and new.category in ('order_attachment', 'ticket_attachment', 'payment_proof')
     and new.owner_client_id is not null
     and exists (select 1 from public.profiles p where p.id = new.uploaded_by and p.role = 'client'::public.user_role)
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

drop trigger if exists vault_files_tenant_integrity on public.vault_files;
create trigger vault_files_tenant_integrity
  before insert or update on public.vault_files
  for each row execute function public.enforce_vault_file_tenant_integrity();

-- order_messages & tickets & ticket_messages
drop policy if exists "order_messages_select_client_or_admin" on public.order_messages;
create policy "order_messages_select_client_or_admin"
  on public.order_messages for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and is_internal_note is false
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

drop policy if exists "order_messages_insert_client_or_admin" on public.order_messages;
create policy "order_messages_insert_client_or_admin"
  on public.order_messages for insert
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or (
        public.is_active_client()
        and is_internal_note is false
        and exists (
          select 1 from public.orders o
          where o.id = order_id and o.client_id = auth.uid()
        )
        and not exists (
          select 1
          from unnest(attachment_file_ids) as fid
          left join public.vault_files vf on vf.id = fid
          where vf.id is null or vf.owner_client_id is distinct from auth.uid()
        )
      )
    )
  );

drop policy if exists "tickets_select_own_or_admin" on public.tickets;
create policy "tickets_select_own_or_admin"
  on public.tickets for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own"
  on public.tickets for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and (
      order_id is null
      or exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

drop policy if exists "ticket_messages_select_client_or_admin" on public.ticket_messages;
create policy "ticket_messages_select_client_or_admin"
  on public.ticket_messages for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and is_internal_note is false
      and exists (
        select 1 from public.tickets t
        where t.id = ticket_id and t.client_id = auth.uid()
      )
    )
  );

drop policy if exists "ticket_messages_insert_client_or_admin" on public.ticket_messages;
create policy "ticket_messages_insert_client_or_admin"
  on public.ticket_messages for insert
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or (
        public.is_active_client()
        and is_internal_note is false
        and exists (
          select 1 from public.tickets t
          where t.id = ticket_id and t.client_id = auth.uid()
        )
        and not exists (
          select 1
          from unnest(attachment_file_ids) as fid
          left join public.vault_files vf on vf.id = fid
          where vf.id is null or vf.owner_client_id is distinct from auth.uid()
        )
      )
    )
  );

-- invoices, invoice_items, payments, credit_notes, cancellation_requests, retainer_plans, client_reviews, notifications
drop policy if exists "invoices_select_own_or_admin" on public.invoices;
create policy "invoices_select_own_or_admin"
  on public.invoices for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and client_id = auth.uid()
      and status <> 'draft'::public.invoice_status
    )
  );

drop policy if exists "invoice_items_select_via_invoice" on public.invoice_items;
create policy "invoice_items_select_via_invoice"
  on public.invoice_items for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.invoices i
        where i.id = invoice_id
          and i.client_id = auth.uid()
          and i.status <> 'draft'::public.invoice_status
      )
    )
  );

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin"
  on public.payments for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "payments_insert_own_issued_invoice" on public.payments;
create policy "payments_insert_own_issued_invoice"
  on public.payments for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and status = 'submitted'::public.payment_status
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.client_id = auth.uid()
        and i.currency = currency
        and (order_id is null or order_id is not distinct from i.order_id)
        and i.status in (
          'issued'::public.invoice_status,
          'partially_paid'::public.invoice_status,
          'overdue'::public.invoice_status
        )
    )
    and (
      proof_file_id is null
      or exists (
        select 1 from public.vault_files vf
        where vf.id = proof_file_id
          and vf.owner_client_id = auth.uid()
      )
    )
  );

drop policy if exists "credit_notes_select_own_or_admin" on public.credit_notes;
create policy "credit_notes_select_own_or_admin"
  on public.credit_notes for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "cancellation_requests_select_own_or_admin" on public.cancellation_requests;
create policy "cancellation_requests_select_own_or_admin"
  on public.cancellation_requests for select
  using (
    public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

drop policy if exists "cancellation_requests_insert_own" on public.cancellation_requests;
create policy "cancellation_requests_insert_own"
  on public.cancellation_requests for insert
  with check (
    public.is_active_client()
    and requested_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

drop policy if exists "retainer_plans_select_own_or_admin" on public.retainer_plans;
create policy "retainer_plans_select_own_or_admin"
  on public.retainer_plans for select
  using ((client_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "client_reviews_select_public_own_or_admin" on public.client_reviews;
create policy "client_reviews_select_public_own_or_admin"
  on public.client_reviews for select
  using (
    is_public_approved is true
    or public.is_admin()
    or (client_id = auth.uid() and public.is_active_user())
  );

drop policy if exists "client_reviews_insert_own_completed_order" on public.client_reviews;
create policy "client_reviews_insert_own_completed_order"
  on public.client_reviews for insert
  with check (
    public.is_active_client()
    and client_id = auth.uid()
    and is_public_approved is false
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
        and o.status = 'completed'::public.order_status
    )
  );

drop policy if exists "notifications_select_own_or_admin" on public.notifications;
create policy "notifications_select_own_or_admin"
  on public.notifications for select
  using ((recipient_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read"
  on public.notifications for update
  using (recipient_id = auth.uid() and public.is_active_user())
  with check (recipient_id = auth.uid() and public.is_active_user());

-- 4. Caller-Bound SECURITY DEFINER RPCs
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
  else
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
      v_actor, 'client', v_order.client_id, v_order.id, 'deliverable', v_deliv.id,
      'deliverable.accepted', 'Accepted deliverable ' || v_deliv.code
    );
  end if;

  return jsonb_build_object('status', p_decision, 'order_id', v_order.id);
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
  v_confirmed_total bigint;
  v_usd_delta bigint;
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

  update public.payments
    set status = 'confirmed'::public.payment_status,
        fx_rate_to_usd = coalesce(p_fx_rate, v_pay.fx_rate_to_usd, 1.000000),
        reviewed_by = v_admin,
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
    v_admin, 'admin', v_pay.client_id, v_pay.order_id, 'payment', v_pay.id,
    'payment.confirmed', 'Confirmed payment ' || v_pay.code || ' for invoice ' || v_inv.code,
    jsonb_build_object('amount_cents', v_pay.amount_cents, 'currency', v_pay.currency, 'usd_equivalent_cents', v_usd_delta)
  );

  return jsonb_build_object('payment_status', 'confirmed', 'invoice_status', v_new_inv_status);
end;
$$;

create or replace function public.admin_command_center_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_orders bigint;
  v_new_inquiries bigint;
  v_pending_payments bigint;
  v_open_tickets bigint;
  v_active_retainers bigint;
  v_unread_notifications bigint;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select count(*) into v_active_orders
    from public.orders
    where status in ('queued', 'in_progress', 'in_review', 'revision_requested');
  select count(*) into v_new_inquiries
    from public.inquiries
    where status = 'new';
  select count(*) into v_pending_payments
    from public.payments
    where status = 'submitted';
  select count(*) into v_open_tickets
    from public.tickets
    where status in ('open', 'in_progress');
  select count(*) into v_active_retainers
    from public.retainer_plans
    where status = 'active';
  select count(*) into v_unread_notifications
    from public.notifications
    where recipient_id = auth.uid() and is_read is false;

  return jsonb_build_object(
    'totalRevenueUsdCents', coalesce((select sum(usd_equivalent_cents) from public.payments where status = 'confirmed'), 0),
    'outstandingUsdCents', coalesce((
      select sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint)
      from public.invoices
      where status in ('issued', 'partially_paid', 'overdue')
    ), 0),
    'activeOrdersCount', v_active_orders,
    'active_orders', v_active_orders,
    'awaitingPaymentOrdersCount', (select count(*) from public.orders where status = 'awaiting_payment'),
    'newInquiriesCount', v_new_inquiries,
    'new_inquiries', v_new_inquiries,
    'pendingPaymentsCount', v_pending_payments,
    'submitted_payments', v_pending_payments,
    'openTicketsCount', v_open_tickets,
    'open_tickets', v_open_tickets,
    'urgentTicketsCount', (select count(*) from public.tickets where status in ('open', 'in_progress') and priority = 'urgent'),
    'totalClientsCount', (select count(*) from public.profiles where role = 'client'),
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
  v_pending_proposals bigint;
  v_awaiting_deliverables bigint;
  v_open_invoices bigint;
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
    'completedOrdersCount', (
      select count(*) from public.orders
      where client_id = p_client_id and status = 'completed'
    ),
    'pendingProposalsCount', v_pending_proposals,
    'pending_proposals', v_pending_proposals,
    'deliverablesAwaitingReviewCount', v_awaiting_deliverables,
    'awaiting_review_deliverables', v_awaiting_deliverables,
    'openInvoicesCount', v_open_invoices,
    'unpaid_invoices', v_open_invoices,
    'balanceDueUsdCents', coalesce((
      select sum(round((total_cents - amount_paid_cents - credited_cents) * fx_rate_to_usd)::bigint)
      from public.invoices
      where client_id = p_client_id and status in ('issued', 'partially_paid', 'overdue')
    ), 0),
    'openTicketsCount', v_open_tickets,
    'open_tickets', v_open_tickets,
    'active_retainers', v_active_retainers,
    'unread_notifications', v_unread_notifications
  );
end;
$$;

-- 5. Explicit Function ACLs (Least Privilege; Zero PUBLIC/anon exposure on privileged RPCs)
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_active_user() from public, anon, authenticated;
revoke all on function public.is_active_client() from public, anon, authenticated;
revoke all on function public.caller_account_state() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.contact_consent_control(text) from public, anon, authenticated;
revoke all on function public.enforce_order_roe_before_progress() from public, anon, authenticated;
revoke all on function public.apply_ticket_message_side_effects() from public, anon, authenticated;
revoke all on function public.guard_invoice_immutable_fields() from public, anon, authenticated;
revoke all on function public.refuse_audit_log_mutation() from public, anon, authenticated;
revoke all on function public.enforce_vault_file_tenant_integrity() from public, anon, authenticated;
revoke all on function public.accept_proposal_and_create_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_order_deliverable(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_invoice_payment(uuid, uuid, text, numeric, text) from public, anon, authenticated;
revoke all on function public.run_auto_accept_deliverables() from public, anon, authenticated;
revoke all on function public.admin_command_center_metrics() from public, anon, authenticated;
revoke all on function public.client_portal_overview(uuid) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_active_client() to authenticated, service_role;
grant execute on function public.caller_account_state() to authenticated, service_role;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.contact_consent_control(text) to anon, authenticated, service_role;
grant execute on function public.accept_proposal_and_create_order(uuid, uuid) to authenticated, service_role;
grant execute on function public.review_order_deliverable(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.review_invoice_payment(uuid, uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.run_auto_accept_deliverables() to service_role;
grant execute on function public.admin_command_center_metrics() to authenticated, service_role;
grant execute on function public.client_portal_overview(uuid) to authenticated, service_role;
