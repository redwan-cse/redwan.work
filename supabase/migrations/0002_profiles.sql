-- 0002_profiles.sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client' check (role in ('admin', 'client')),
  full_name text,
  company text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Role check against the JWT claim (dual storage: claim gates routes, column gates SQL)
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_admin_select_all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles_admin_update_all"
  on public.profiles for update
  using (public.is_admin());

-- Every new auth user gets a profile row automatically (default role 'client').
-- Bootstrap/promotion still sets app_metadata + role explicitly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
