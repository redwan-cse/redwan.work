-- 0004_inquiries_consent_and_proposals.sql
-- Rate limits, GDPR Consent Policy Registry (seeded with v1), Public/Portal Inquiries & Custom Proposals

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'turnstile', 'presign', 'otp', 'auth')),
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  count int not null default 0,
  unique (kind, key_hash)
);

create index rate_limits_window_idx on public.rate_limits (window_started_at);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_kind text,
  p_key_hash text,
  p_window_seconds int,
  p_max_count int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  if p_window_seconds < 1 or p_max_count < 1 then
    return false;
  end if;

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

grant execute on function public.consume_rate_limit(text, text, int, int) to service_role;

-- Consent Policy Registry (pre-seeded with v1 so /contact operates out-of-the-box)
create table public.consent_policies (
  version text primary key check (version ~ '^[a-z][a-z0-9-]{0,63}$'),
  canonical text not null,
  hash text not null check (hash ~ '^[a-f0-9]{64}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint consent_policy_hash_check check (hash = encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')),
  unique (version, hash)
);

alter table public.consent_policies enable row level security;

create policy "consent_policies_public_read"
  on public.consent_policies for select
  using (true);

insert into public.consent_policies (version, canonical, hash, is_active)
values (
  'v1',
  '{"schema":"1","version":"v1","noticeUrl":"/privacy","termsUrl":"/tos","statement":"I have read the Data & Privacy Policy and Terms of Service and consent to the processing of my inquiry details and attachments."}',
  encode(extensions.digest(convert_to('{"schema":"1","version":"v1","noticeUrl":"/privacy","termsUrl":"/tos","statement":"I have read the Data & Privacy Policy and Terms of Service and consent to the processing of my inquiry details and attachments."}', 'UTF8'), 'sha256'), 'hex'),
  true
);

create or replace function public.contact_consent_control(p_displayed_version text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema', 1,
    'activeVersion', (select cp.version from public.consent_policies cp where cp.is_active is true limit 1),
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', p.version,
        'canonical', p.canonical,
        'hash', p.hash
      ) order by p.version)
      from public.consent_policies p
      where p.is_active is true or p.version = p_displayed_version
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.contact_consent_control(text) to anon, authenticated, service_role;

-- Public & Portal Service Inquiries
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  ticket_number int not null default nextval('public.inquiry_num_seq') unique,
  code text generated always as ('INQ-' || ticket_number::text) stored,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  email text not null check (char_length(btrim(email)) between 3 and 320),
  country text,
  whatsapp_e164 text,
  preferred_contact_method text,
  timezone text,
  preferred_contact_date date,
  best_time_to_contact text,
  service_pillar public.service_pillar not null default 'cybersecurity',
  services jsonb not null default '[]'::jsonb,
  company text,
  project_url text,
  project_summary text not null check (char_length(btrim(project_summary)) between 1 and 10000),
  nda_required boolean not null default false,
  urgency text,
  budget_min int,
  budget_max int,
  how_found text,
  source_page text,
  device_type text,
  user_agent text,
  ip_hash text,
  consent_at timestamptz not null default now(),
  consent_policy_version text,
  consent_policy_hash text,
  consent_capture_method text default 'explicit-checkbox-v1',
  status public.inquiry_status not null default 'new',
  converted_client_id uuid references public.profiles (id),
  converted_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inquiries_email_idx on public.inquiries (lower(email));
create index inquiries_status_created_idx on public.inquiries (status, created_at desc);

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.inquiries enable row level security;

create policy "inquiries_admin_all"
  on public.inquiries for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  r2_key text not null unique,
  filename text not null check (char_length(filename) between 1 and 255),
  mime text not null check (char_length(mime) between 1 and 128),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  retained boolean not null default false,
  created_at timestamptz not null default now()
);

create index inquiry_attachments_inquiry_idx on public.inquiry_attachments (inquiry_id);

alter table public.inquiry_attachments enable row level security;

create policy "inquiry_attachments_admin_all"
  on public.inquiry_attachments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Custom Proposals & Quotes (PRP-1001)
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.proposal_num_seq') unique,
  code text generated always as ('PRP-' || number::text) stored,
  client_id uuid references public.profiles (id) on delete set null,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  recipient_email text not null,
  recipient_name text not null,
  pillar public.service_pillar not null default 'cybersecurity',
  title text not null check (char_length(btrim(title)) between 1 and 250),
  scope_summary text not null,
  deliverables_summary text not null,
  requires_roe boolean not null default false,
  pricing_model public.pricing_model not null default 'custom_milestone',
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents int not null check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  tax_rate_bps int not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  deposit_percent int not null default 50 check (deposit_percent between 0 and 100),
  estimated_days int not null default 7 check (estimated_days >= 1),
  revisions_included int not null default 2 check (revisions_included >= 0),
  auto_accept_days int not null default 3 check (auto_accept_days between 1 and 30),
  valid_until date,
  status public.proposal_status not null default 'draft',
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposals_client_idx on public.proposals (client_id, created_at desc);
create index proposals_status_idx on public.proposals (status, created_at desc);

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

alter table public.proposals enable row level security;

create policy "proposals_select_own_or_admin"
  on public.proposals for select
  using (client_id = auth.uid() or public.is_admin());

create policy "proposals_admin_all"
  on public.proposals for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.proposal_milestones (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  amount_cents int not null check (amount_cents >= 0),
  weight_percent int not null default 25 check (weight_percent between 1 and 100),
  due_days_offset int not null default 7 check (due_days_offset >= 1),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index proposal_milestones_proposal_idx on public.proposal_milestones (proposal_id, position);

alter table public.proposal_milestones enable row level security;

create policy "proposal_milestones_select_via_proposal"
  on public.proposal_milestones for select
  using (
    public.is_admin() or exists (
      select 1 from public.proposals pr
      where pr.id = proposal_id and pr.client_id = auth.uid()
    )
  );

create policy "proposal_milestones_admin_all"
  on public.proposal_milestones for all
  using (public.is_admin())
  with check (public.is_admin());
