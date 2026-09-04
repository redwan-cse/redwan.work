-- 0017_otp_rate_kind.sql
-- Add 'otp-ip' to rate_limits.kind enum check (OTP magic-link throttling).

-- Drop existing constraint if it exists (safe)
alter table public.rate_limits drop constraint if exists rate_limits_kind_check;

-- Recreate with new allowed values
alter table public.rate_limits
  add constraint rate_limits_kind_check
  check (kind in ('ip', 'turnstile', 'presign-ip', 'presign-portal', 'otp-ip'));
