-- 0016_email_log.sql
-- Phase 5b lifecycle emails. Records every transactional send so operators can
-- audit delivery without reading provider dashboards. Rows are written only by
-- the service-role client; admins read them through the panel.

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null check (template in (
    'invite',
    'new-ticket',
    'reply-posted',
    'status-changed',
    'deliverable-uploaded',
    'invoice-issued',
    'payment-confirmed'
  )),
  entity_type text check (entity_type in ('client', 'ticket', 'invoice', 'deliverable')),
  entity_id uuid,
  resend_id text,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index email_log_created_at_idx on public.email_log (created_at desc);
create index email_log_template_idx on public.email_log (template);
create index email_log_status_idx on public.email_log (status);
create index email_log_entity_idx on public.email_log (entity_type, entity_id);

alter table public.email_log enable row level security;

-- Admin reads only. Writes stay on the service-role client, which bypasses RLS,
-- so no INSERT/UPDATE/DELETE policy is granted to any authenticated role.
create policy "email_log_admin_select" on public.email_log for select
  using (public.is_admin());
