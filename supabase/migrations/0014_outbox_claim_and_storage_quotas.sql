-- =============================================================================
-- 0014_outbox_claim_and_storage_quotas.sql
-- Remediates Phase E Storage Quotas & Atomic Email Outbox Claiming:
--   - Adds locked_at to public.email_outbox
--   - Creates public.claim_pending_email_outbox(p_limit, p_stale_seconds)
--     with FOR UPDATE SKIP LOCKED (service_role only)
--   - Enforces replay-resistant r2_key uniqueness & 500 MB active per-client
--     vault storage quota on public.vault_files
-- =============================================================================

-- 1. Email Outbox Locking & Atomic Claim RPC
alter table public.email_outbox
  add column if not exists locked_at timestamptz;

drop index if exists public.email_outbox_pending_idx;
create index email_outbox_pending_idx
  on public.email_outbox (status, next_attempt_at, created_at)
  where status in ('pending', 'processing');

create or replace function public.claim_pending_email_outbox(
  p_limit int default 20,
  p_stale_seconds int default 300
)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := greatest(1, least(100, coalesce(p_limit, 20)));
  v_stale int := greatest(30, coalesce(p_stale_seconds, 300));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required to claim email outbox items.';
  end if;

  return query
  with candidate as (
    select eo.id
    from public.email_outbox eo
    where (
      eo.status = 'pending'
      and eo.next_attempt_at <= now()
    ) or (
      eo.status = 'processing'
      and (
        eo.locked_at is null
        or eo.locked_at <= now() - make_interval(secs => v_stale)
      )
    )
    order by eo.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.email_outbox target
     set status = 'processing',
         locked_at = now()
    from candidate c
   where target.id = c.id
  returning target.*;
end;
$$;

revoke all on function public.claim_pending_email_outbox(int, int) from public, anon, authenticated;
grant execute on function public.claim_pending_email_outbox(int, int) to service_role;

-- 2. Vault Storage Replay Uniqueness & Per-Client 500 MB Active Quota
create unique index if not exists vault_files_r2_key_uidx
  on public.vault_files (r2_key);

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
create trigger vault_files_enforce_quota
  before insert on public.vault_files
  for each row execute function public.enforce_vault_file_quota();

revoke all on function public.enforce_vault_file_quota() from public, anon, authenticated;
