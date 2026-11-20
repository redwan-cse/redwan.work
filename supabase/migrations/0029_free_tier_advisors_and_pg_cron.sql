-- =============================================================================
-- Migration 0029: Supabase Free-Tier Advisors Cleanup & pg_cron Activation
-- =============================================================================
-- 1. Enables pg_cron (available on Supabase Free Tier) and schedules
--    daily_crm_maintenance ('5 1 * * *') when pg_cron is available.
-- 2. Switches public.contact_consent_control(text) to SECURITY INVOKER
--    (clearing WARN: anon_security_definer_function_executable).
-- 3. Adds explicit deny policy on public.vault_upload_reservations
--    (clearing INFO: rls_enabled_no_policy).
-- 4. Drops duplicate index public.vault_files_r2_key_uidx
--    (clearing WARN: duplicate_index).
-- 5. Consolidates overlapping *_admin_all permissive policies across 22 tables
--    so every (table, command) has a single permissive policy
--    (clearing WARN: multiple_permissive_policies, 180 -> 0).
-- 6. Wraps bare auth.uid() calls in (select auth.uid()) across all public RLS
--    policies for PostgreSQL initPlan caching
--    (clearing WARN: auth_rls_initplan, 34 -> 0).
-- =============================================================================

-- 1. Enable pg_cron on Supabase Free Tier & Schedule daily_crm_maintenance
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      if not exists (
        select 1 from cron.job where jobname = 'daily_crm_maintenance'
      ) then
        perform cron.schedule(
          'daily_crm_maintenance',
          '5 1 * * *',
          'select public.run_daily_crm_maintenance();'
        );
      end if;
    end if;
  end if;
exception
  when others then
    null;
end;
$$;

-- 2. Switch contact_consent_control to SECURITY INVOKER (reads public consent_policies)
grant select on public.consent_policies to anon, authenticated, service_role;
alter function public.contact_consent_control(text) security invoker;

-- 3. Explicit deny policy on service_role-only vault_upload_reservations table
drop policy if exists "vault_upload_reservations_no_direct_access" on public.vault_upload_reservations;
create policy "vault_upload_reservations_no_direct_access"
  on public.vault_upload_reservations for all
  using (false)
  with check (false);

-- 4. Drop duplicate index on vault_files.r2_key (vault_files_r2_key_key already enforces UNIQUE)
drop index if exists public.vault_files_r2_key_uidx;

-- 5. Drop redundant policies on engagement_authorizations & payments
drop policy if exists "roe_admin_all" on public.engagement_authorizations;
drop policy if exists "payments_admin_select" on public.payments;

-- 6. Split *_admin_all (FOR ALL) into INSERT / UPDATE / DELETE on the 16 tables
--    whose SELECT policy already grants access when public.is_admin() is true
do $$
declare
  v_tbl text;
  v_tables text[] := array[
    'client_profiles',
    'credit_notes',
    'deliverables',
    'invoice_items',
    'invoices',
    'order_milestones',
    'order_tasks',
    'orders',
    'portfolio_items',
    'proposal_milestones',
    'proposals',
    'resume_items',
    'retainer_plans',
    'service_packages',
    'services',
    'vault_files'
  ];
begin
  foreach v_tbl in array v_tables loop
    execute format('drop policy if exists %I on public.%I', v_tbl || '_admin_all', v_tbl);
    execute format('drop policy if exists %I on public.%I', v_tbl || '_admin_insert', v_tbl);
    execute format('drop policy if exists %I on public.%I', v_tbl || '_admin_update', v_tbl);
    execute format('drop policy if exists %I on public.%I', v_tbl || '_admin_delete', v_tbl);

    execute format(
      'create policy %I on public.%I for insert with check (public.is_admin())',
      v_tbl || '_admin_insert',
      v_tbl
    );
    execute format(
      'create policy %I on public.%I for update using (public.is_admin()) with check (public.is_admin())',
      v_tbl || '_admin_update',
      v_tbl
    );
    execute format(
      'create policy %I on public.%I for delete using (public.is_admin())',
      v_tbl || '_admin_delete',
      v_tbl
    );
  end loop;
end;
$$;

-- 7. Consolidate the remaining 8 tables with client INSERT and/or UPDATE policies
-- 7a. order_messages & ticket_messages (SELECT and INSERT already exist; add admin UPDATE & DELETE)
drop policy if exists "order_messages_admin_all" on public.order_messages;
drop policy if exists "order_messages_admin_update" on public.order_messages;
drop policy if exists "order_messages_admin_delete" on public.order_messages;
create policy "order_messages_admin_update"
  on public.order_messages for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "order_messages_admin_delete"
  on public.order_messages for delete
  using (public.is_admin());

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
      )
      and not exists (
        select 1
        from unnest(order_messages.attachment_file_ids) as fid(fid)
        left join public.vault_files vf on vf.id = fid.fid
        where vf.id is null or vf.owner_client_id is distinct from (select auth.uid())
      )
    )
  );

drop policy if exists "ticket_messages_admin_all" on public.ticket_messages;
drop policy if exists "ticket_messages_admin_update" on public.ticket_messages;
drop policy if exists "ticket_messages_admin_delete" on public.ticket_messages;
create policy "ticket_messages_admin_update"
  on public.ticket_messages for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "ticket_messages_admin_delete"
  on public.ticket_messages for delete
  using (public.is_admin());

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
      )
      and not exists (
        select 1
        from unnest(ticket_messages.attachment_file_ids) as fid(fid)
        left join public.vault_files vf on vf.id = fid.fid
        where vf.id is null or vf.owner_client_id is distinct from (select auth.uid())
      )
    )
  );

-- 7b. cancellation_requests, client_reviews, tickets (merge admin into INSERT; add admin UPDATE & DELETE)
drop policy if exists "cancellation_requests_admin_all" on public.cancellation_requests;
drop policy if exists "cancellation_requests_admin_update" on public.cancellation_requests;
drop policy if exists "cancellation_requests_admin_delete" on public.cancellation_requests;
create policy "cancellation_requests_admin_update"
  on public.cancellation_requests for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "cancellation_requests_admin_delete"
  on public.cancellation_requests for delete
  using (public.is_admin());

drop policy if exists "cancellation_requests_insert_own" on public.cancellation_requests;
create policy "cancellation_requests_insert_own"
  on public.cancellation_requests for insert
  with check (
    public.is_admin()
    or (
      public.is_active_client()
      and requested_by = (select auth.uid())
      and exists (
        select 1 from public.orders o
        where o.id = cancellation_requests.order_id
          and o.client_id = (select auth.uid())
      )
    )
  );

drop policy if exists "client_reviews_admin_all" on public.client_reviews;
drop policy if exists "client_reviews_admin_update" on public.client_reviews;
drop policy if exists "client_reviews_admin_delete" on public.client_reviews;
create policy "client_reviews_admin_update"
  on public.client_reviews for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "client_reviews_admin_delete"
  on public.client_reviews for delete
  using (public.is_admin());

drop policy if exists "client_reviews_insert_own_completed_order" on public.client_reviews;
create policy "client_reviews_insert_own_completed_order"
  on public.client_reviews for insert
  with check (
    public.is_admin()
    or (
      public.is_active_client()
      and client_id = (select auth.uid())
      and is_public_approved is false
      and exists (
        select 1 from public.orders o
        where o.id = client_reviews.order_id
          and o.client_id = (select auth.uid())
          and o.status = 'completed'::public.order_status
      )
    )
  );

drop policy if exists "tickets_admin_all" on public.tickets;
drop policy if exists "tickets_admin_update" on public.tickets;
drop policy if exists "tickets_admin_delete" on public.tickets;
create policy "tickets_admin_update"
  on public.tickets for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "tickets_admin_delete"
  on public.tickets for delete
  using (public.is_admin());

drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own"
  on public.tickets for insert
  with check (
    public.is_admin()
    or (
      public.is_active_client()
      and client_id = (select auth.uid())
      and status = 'open'::public.ticket_status
      and first_responded_at is null
      and resolved_at is null
      and (
        order_id is null
        or exists (
          select 1 from public.orders o
          where o.id = tickets.order_id
            and o.client_id = (select auth.uid())
        )
      )
    )
  );

-- 7c. notifications & profiles (merge admin into UPDATE; add admin INSERT & DELETE)
drop policy if exists "notifications_admin_all" on public.notifications;
drop policy if exists "notifications_admin_insert" on public.notifications;
drop policy if exists "notifications_admin_delete" on public.notifications;
create policy "notifications_admin_insert"
  on public.notifications for insert
  with check (public.is_admin());
create policy "notifications_admin_delete"
  on public.notifications for delete
  using (public.is_admin());

drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read"
  on public.notifications for update
  using (
    public.is_admin()
    or (recipient_id = (select auth.uid()) and public.is_active_user())
  )
  with check (
    public.is_admin()
    or (recipient_id = (select auth.uid()) and public.is_active_user())
  );

drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;
drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_insert"
  on public.profiles for insert
  with check (public.is_admin());
create policy "profiles_admin_delete"
  on public.profiles for delete
  using (public.is_admin());

drop policy if exists "profiles_update_own_non_privileged" on public.profiles;
create policy "profiles_update_own_non_privileged"
  on public.profiles for update
  using (
    public.is_admin()
    or (id = (select auth.uid()) and is_active is true)
  )
  with check (
    public.is_admin()
    or (
      id = (select auth.uid())
      and is_active is true
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
      and mfa_enforced = (select p.mfa_enforced from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- 7d. order_requirements (merge admin into INSERT and UPDATE; add admin DELETE)
drop policy if exists "order_requirements_admin_all" on public.order_requirements;
drop policy if exists "order_requirements_admin_delete" on public.order_requirements;
create policy "order_requirements_admin_delete"
  on public.order_requirements for delete
  using (public.is_admin());

drop policy if exists "order_requirements_insert_own" on public.order_requirements;
create policy "order_requirements_insert_own"
  on public.order_requirements for insert
  with check (
    public.is_admin()
    or (
      public.is_active_client()
      and client_id = (select auth.uid())
      and exists (
        select 1 from public.orders o
        where o.id = order_requirements.order_id
          and o.client_id = (select auth.uid())
      )
    )
  );

drop policy if exists "order_requirements_update_own" on public.order_requirements;
create policy "order_requirements_update_own"
  on public.order_requirements for update
  using (
    public.is_admin()
    or (
      client_id = (select auth.uid())
      and public.is_active_client()
      and verified_by_admin_at is null
      and exists (
        select 1 from public.orders o
        where o.id = order_requirements.order_id
          and o.client_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      client_id = (select auth.uid())
      and public.is_active_client()
      and verified_by_admin_at is null
      and exists (
        select 1 from public.orders o
        where o.id = order_requirements.order_id
          and o.client_id = (select auth.uid())
      )
    )
  );

-- 8. Wrap all remaining bare auth.uid() calls in (select auth.uid()) across all public RLS policies
do $$
declare
  rec record;
  v_qual text;
  v_check text;
  v_roles text;
  v_cmd text;
  v_sql text;
begin
  for rec in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (
         (qual is not null and qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%' and qual not like '%select auth.uid()%')
         or (with_check is not null and with_check like '%auth.uid()%' and with_check not like '%SELECT auth.uid()%' and with_check not like '%select auth.uid()%')
       )
  loop
    v_qual := case
      when rec.qual is not null then replace(rec.qual, 'auth.uid()', '(select auth.uid())')
      else null
    end;
    v_check := case
      when rec.with_check is not null then replace(rec.with_check, 'auth.uid()', '(select auth.uid())')
      else null
    end;

    select string_agg(quote_ident(r), ', ')
      into v_roles
      from unnest(rec.roles) as r;

    v_cmd := rec.cmd;

    execute format('drop policy if exists %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      rec.policyname,
      rec.schemaname,
      rec.tablename,
      case when rec.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      v_cmd,
      coalesce(v_roles, 'public')
    );

    if v_qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;

    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end;
$$;
