-- 0036_auth_retry_claims.sql
-- Durable single-use claims with fixed expiry for authentication retry authority.
-- Enforces atomic single-use consumption across serverless instances and worker processes without resetting windows.

create table public.auth_retry_claims (
  nonce_hash text primary key,
  user_id uuid not null,
  purpose text not null check (purpose in ('recovery', 'invite')),
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

create index auth_retry_claims_expires_at_idx on public.auth_retry_claims (expires_at);

alter table public.auth_retry_claims enable row level security;
revoke all on public.auth_retry_claims from anon, authenticated;
grant all on public.auth_retry_claims to service_role;

create or replace function public.claim_auth_retry_nonce(
  p_nonce_hash text,
  p_user_id uuid,
  p_purpose text,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  -- Periodic purge of expired claims whose retention window has passed (7 days past expiration)
  delete from public.auth_retry_claims where expires_at < v_now - interval '7 days';

  -- Reject if claim is already expired at submission time
  if p_expires_at <= v_now then
    return false;
  end if;

  -- Atomic durable claim: primary key conflict guarantees strictly single-use semantics.
  -- Unlike a resetting rate-limit window, once a nonce_hash is claimed, it is permanent.
  insert into public.auth_retry_claims (nonce_hash, user_id, purpose, expires_at, consumed_at)
  values (p_nonce_hash, p_user_id, p_purpose, p_expires_at, v_now)
  on conflict (nonce_hash) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) from anon, authenticated;
grant execute on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) to service_role;
