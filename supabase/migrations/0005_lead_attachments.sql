-- 0005_lead_attachments.sql
alter table public.leads
  add column attachments jsonb not null default '[]'::jsonb;

-- Presign requests get their own IP budget so uploads never consume the
-- submission budget (both kinds are consumed server-side only).
alter table public.rate_limits drop constraint rate_limits_kind_check;
alter table public.rate_limits add constraint rate_limits_kind_check
  check (kind in ('ip', 'turnstile', 'presign-ip'));
