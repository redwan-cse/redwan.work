-- 0001_leads_and_rate_limits.sql
create extension if not exists pgcrypto;

create sequence entity_number_seq start 1000;

create type lead_status as enum ('new', 'contacted', 'won', 'lost');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  ticket_number int not null default nextval('entity_number_seq'),
  name text not null,
  email text not null,
  country text,
  whatsapp_e164 text,
  preferred_contact_method text,
  timezone text,
  preferred_contact_date date,
  best_time_to_contact text,
  services jsonb not null default '[]'::jsonb,
  company text,
  project_url text,
  project_summary text not null,
  nda_required boolean not null default false,
  urgency text,
  budget_min int,
  budget_max int,
  how_found text,
  source_page text,
  device_type text,
  user_agent text,
  ip_hash text,
  consent_at timestamptz not null,
  status lead_status not null default 'new',
  email_verified_at timestamptz,
  marketing_opt_in boolean,
  converted_client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_email_idx on public.leads (email);
create index leads_status_idx on public.leads (status);
create index leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
-- Intentionally no policies: service role bypasses RLS; anon/authenticated denied.

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'turnstile')),
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  count int not null default 0,
  unique (kind, key_hash)
);

alter table public.rate_limits enable row level security;
-- Same policy stance as leads.

create or replace function public.consume_rate_limit(
  p_kind text,
  p_key_hash text,
  p_window_seconds int,
  p_max_count int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  delete from public.rate_limits where window_started_at < v_now - interval '7 days';

  insert into public.rate_limits (kind, key_hash, window_started_at, count)
  values (p_kind, p_key_hash, v_now, 1)
  on conflict (kind, key_hash) do update
    set window_started_at = v_now, count = 1
    where public.rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
  returning * into v_row;

  if v_row is not null then
    return true;
  end if;

  update public.rate_limits
    set count = count + 1
    where kind = p_kind
      and key_hash = p_key_hash
      and window_started_at > v_now - make_interval(secs => p_window_seconds)
      and count < p_max_count
    returning * into v_row;

  return v_row is not null;
end;
$$;
