create table public.maintenance_cursors (
 name text primary key check(name in('contact','private','projects')),
 last_key text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.maintenance_cursors enable row level security;
revoke all on public.maintenance_cursors from anon,authenticated;
grant all on public.maintenance_cursors to service_role;
insert into public.maintenance_cursors(name) values('contact'),('private'),('projects');
