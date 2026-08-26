-- 0006_projects_files.sql
create type project_status as enum ('active', 'paused', 'done');
create type milestone_status as enum ('pending', 'in_progress', 'done');
create type file_kind as enum ('attachment', 'deliverable', 'asset');
create type file_bucket as enum ('public', 'private');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  status project_status not null default 'active',
  started_at timestamptz not null default now(),
  due_at date,
  archived_at timestamptz,
  archive_key text,
  created_at timestamptz not null default now()
);

create index projects_client_idx on public.projects (client_id);
create index projects_archived_idx on public.projects (archived_at);

alter table public.projects enable row level security;

create policy "projects_select_own_or_admin"
  on public.projects for select
  using (client_id = auth.uid() or public.is_admin());

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency char(3) not null default 'USD',
  position int not null default 0,
  status milestone_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id, position);

alter table public.milestones enable row level security;

create policy "milestones_select_via_project"
  on public.milestones for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or public.is_admin())
    )
  );

create table public.files (
  id uuid primary key default gen_random_uuid(),
  bucket file_bucket not null,
  r2_key text not null unique,
  kind file_kind not null,
  ticket_id uuid references public.tickets (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  filename text not null check (char_length(filename) between 1 and 255),
  mime text not null check (char_length(mime) between 1 and 128),
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (kind <> 'attachment' or ticket_id is not null),
  check (kind <> 'deliverable' or project_id is not null)
);

create index files_ticket_idx on public.files (ticket_id);
create index files_project_idx on public.files (project_id);
create index files_kind_idx on public.files (kind);

alter table public.files enable row level security;

create policy "files_select_own_scope"
  on public.files for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.client_id = auth.uid()
    )
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.client_id = auth.uid()
    )
  );
