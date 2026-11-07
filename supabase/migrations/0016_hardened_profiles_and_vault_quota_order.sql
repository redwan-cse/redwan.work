-- =============================================================================
-- 0016_hardened_profiles_and_vault_quota_order.sql
-- Post-review security hardening:
--   1. Prevent AAL1 admin or row owner from self-updating privileged profile
--      columns (mfa_enforced, role, is_active, email) via RLS + BEFORE UPDATE trigger.
--   2. Order vault_files quota trigger (vault_files_z_enforce_quota) alphabetically
--      after vault_files_tenant_integrity and serialize per-client quota checks.
-- =============================================================================

-- 1. Lock privileged columns on public.profiles
drop policy if exists "profiles_update_own_non_privileged" on public.profiles;
create policy "profiles_update_own_non_privileged"
  on public.profiles for update
  using (id = auth.uid() and is_active is true)
  with check (
    id = auth.uid()
    and is_active is true
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and mfa_enforced = (select p.mfa_enforced from public.profiles p where p.id = auth.uid())
  );

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
    if old.role = 'admin'::public.user_role
       and old.mfa_enforced is true
       and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception 'Multi-factor authentication (AAL2) is required to modify an administrator profile.';
    end if;

    if old.mfa_enforced is true and new.mfa_enforced is distinct from true then
      raise exception 'Privileged security policy: mfa_enforced cannot be disabled from an authenticated session.';
    end if;

    if not public.is_admin() then
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active
         or new.mfa_enforced is distinct from old.mfa_enforced
         or new.email is distinct from old.email then
        raise exception 'Privileged profile attributes (role, is_active, mfa_enforced, email) cannot be modified.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_privileged_columns on public.profiles;
create trigger profiles_enforce_privileged_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_privileged_columns();

revoke all on function public.enforce_profile_privileged_columns() from public, anon, authenticated;

-- 2. Serialize per-client vault quota & guarantee execution after vault_files_tenant_integrity
create or replace function public.enforce_vault_file_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_bytes bigint := 0;
  v_quota_bytes constant bigint := 524288000; -- 500 MiB active per client
begin
  if new.owner_client_id is not null and new.archived_at is null then
    -- Serialize concurrent uploads for the same client under READ COMMITTED
    perform 1
      from public.profiles p
      where p.id = new.owner_client_id
      for update;

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

drop trigger if exists vault_files_enforce_quota on public.vault_files;
drop trigger if exists vault_files_z_enforce_quota on public.vault_files;
create trigger vault_files_z_enforce_quota
  before insert on public.vault_files
  for each row execute function public.enforce_vault_file_quota();

revoke all on function public.enforce_vault_file_quota() from public, anon, authenticated;
