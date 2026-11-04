-- 0002_identity_and_client_relationship_crm.sql
-- User profiles, client CRM relationship extension, private admin notes, and invitations

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text,
  email text,
  company text,
  phone text,
  whatsapp text,
  country text,
  timezone text,
  avatar_url text,
  is_active boolean not null default true,
  mfa_enforced boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_active_idx on public.profiles (role, is_active);
create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Authoritative admin check: requires both JWT app_metadata claim AND active admin profile row
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active is true
    )
$$;

create or replace function public.caller_account_state()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_active boolean;
begin
  if v_uid is null then
    return 'unauthenticated';
  end if;
  select p.is_active into v_active
    from public.profiles p
    where p.id = v_uid;
  if not found then
    return 'missing';
  end if;
  if v_active is true then
    return 'active';
  end if;
  return 'inactive';
end;
$$;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.caller_account_state() to authenticated, service_role;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_non_privileged"
  on public.profiles for update
  using (id = auth.uid() and is_active is true)
  with check (
    id = auth.uid()
    and is_active is true
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

create policy "profiles_admin_all"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Client Relationship CRM extension (1:1 with client profiles)
create table public.client_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_name text,
  company_role text,
  website_url text,
  industry text,
  tier public.client_tier not null default 'standard',
  acquisition_source text not null default 'direct',
  billing_address jsonb not null default '{}'::jsonb,
  tax_id text,
  preferred_currency char(3) not null default 'USD' check (preferred_currency ~ '^[A-Z]{3}$'),
  lifetime_value_usd_cents bigint not null default 0 check (lifetime_value_usd_cents >= 0),
  total_orders_count int not null default 0 check (total_orders_count >= 0),
  completed_orders_count int not null default 0 check (completed_orders_count >= 0),
  average_rating numeric(3, 2) check (average_rating is null or (average_rating >= 1.00 and average_rating <= 5.00)),
  tags text[] not null default '{}',
  next_followup_at timestamptz,
  relationship_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_profiles_tier_idx on public.client_profiles (tier);
create index client_profiles_followup_idx on public.client_profiles (next_followup_at) where next_followup_at is not null;

create trigger client_profiles_set_updated_at
  before update on public.client_profiles
  for each row execute function public.set_updated_at();

alter table public.client_profiles enable row level security;

create policy "client_profiles_select_own_or_admin"
  on public.client_profiles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "client_profiles_admin_all"
  on public.client_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Private Admin CRM Notes & Call/Follow-up Logs
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note_type text not null default 'general' check (note_type in ('general', 'call_log', 'followup', 'preference')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  is_pinned boolean not null default false,
  followup_date date,
  created_at timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes (client_id, is_pinned desc, created_at desc);

alter table public.client_notes enable row level security;

create policy "client_notes_admin_only"
  on public.client_notes for all
  using (public.is_admin())
  with check (public.is_admin());

-- Client Invitations (Invite/Proposal-only onboarding)
create table public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  company text,
  tier public.client_tier not null default 'standard',
  invited_by uuid references public.profiles (id),
  accepted_user_id uuid references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index client_invitations_email_idx on public.client_invitations (lower(email), status);

alter table public.client_invitations enable row level security;

create policy "client_invitations_admin_only"
  on public.client_invitations for all
  using (public.is_admin())
  with check (public.is_admin());

-- Automatically provision profile + client_profiles on new auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_full_name text;
  v_company text;
begin
  v_role := case
    when coalesce(new.raw_app_meta_data ->> 'role', '') = 'admin' then 'admin'::public.user_role
    else 'client'::public.user_role
  end;
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_company := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  insert into public.profiles (id, role, email, full_name, company, mfa_enforced)
  values (new.id, v_role, new.email, v_full_name, v_company, (v_role = 'admin'))
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        company = coalesce(public.profiles.company, excluded.company);

  if v_role = 'client' then
    insert into public.client_profiles (user_id, company_name)
    values (new.id, v_company)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
