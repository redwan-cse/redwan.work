-- 0015_presign_portal_rate_kind.sql
-- Add 'presign-portal' to rate_limits.kind enum check.

-- Drop existing constraint if it exists (safe)
alter table public.rate_limits drop constraint if exists rate_limits_kind_check;

-- Recreate with new allowed values
alter table public.rate_limits
  add constraint rate_limits_kind_check
  check (kind in ('ip', 'turnstile', 'presign-ip', 'presign-portal'));