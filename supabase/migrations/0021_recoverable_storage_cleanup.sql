-- Branch-only forward migration. No production operation is performed by this file.
create table public.project_recovery (
  project_id uuid primary key,
  snapshot jsonb not null,
  recovery_key text not null,
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create table public.storage_deletions (
  r2_key text primary key,
  source text not null check(source in ('contact','pending','project')),
  project_id uuid references public.project_recovery(project_id),
  file_snapshot jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.project_recovery enable row level security;
alter table public.storage_deletions enable row level security;
revoke all on public.project_recovery,public.storage_deletions from anon,authenticated;
grant all on public.project_recovery,public.storage_deletions to service_role;
create index storage_deletions_pending_idx on public.storage_deletions(created_at,r2_key) where completed_at is null;

-- Both new references and cleanup claims lock the same key. Tombstones remain
-- after object removal so a late confirmation can never resurrect a deleted key.
create function public.guard_cleanup_file_reference()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.r2_key,817));
  if exists(select 1 from public.storage_deletions where r2_key=new.r2_key) then raise exception 'File no longer available'; end if;
  return new;
end;$$;
create trigger guard_cleanup_file_reference before insert or update of r2_key on public.files
for each row execute function public.guard_cleanup_file_reference();
create function public.guard_cleanup_lead_references()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text;
begin
  if tg_op='UPDATE' and new.attachments is not distinct from old.attachments then return new; end if;
  for v_key in select distinct value->>'key' from jsonb_array_elements(coalesce(new.attachments,'[]'::jsonb)) order by 1 loop
    if v_key is null then raise exception 'Invalid attachment'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_key,817));
    if exists(select 1 from public.storage_deletions where r2_key=v_key) then raise exception 'Attachment no longer available'; end if;
  end loop;
  return new;
end;$$;
create trigger guard_cleanup_lead_references before insert or update of attachments on public.leads
for each row execute function public.guard_cleanup_lead_references();

create function public.claim_expired_storage(p_key text,p_modified timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_file public.files%rowtype;v_source text;
begin
  if p_modified is null then return false; end if;
  if p_key ~ '^contact/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$' and p_modified<now()-interval '90 days' then v_source:='contact';
  elsif p_key ~ '^private/[0-9a-f-]{36}/pending/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$' and p_modified<now()-interval '24 hours' then v_source:='pending';
  else return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,817));
  if exists(select 1 from public.storage_deletions where r2_key=p_key) then return false; end if;
  if exists(select 1 from public.leads l cross join lateral jsonb_array_elements(coalesce(l.attachments,'[]'::jsonb)) a where a->>'key'=p_key and (v_source<>'contact' or a->'retained'='true'::jsonb)) then return false; end if;
  select * into v_file from public.files where r2_key=p_key for update;
  if found then
    if v_source<>'pending' or v_file.kind<>'attachment' or v_file.ticket_id is not null or v_file.project_id is not null or v_file.created_at>=now()-interval '24 hours' then return false; end if;
    insert into public.storage_deletions(r2_key,source,file_snapshot) values(p_key,v_source,to_jsonb(v_file));
    delete from public.files where id=v_file.id;
  else
    insert into public.storage_deletions(r2_key,source) values(p_key,v_source);
  end if;
  return true;
end;$$;

create function public.project_cleanup_snapshot(p_project uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('project',to_jsonb(p),
  'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.milestones m where m.project_id=p.id),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.files f where f.project_id=p.id),'[]'::jsonb))
 from public.projects p where p.id=p_project
$$;
create function public.prepare_project_cleanup(p_project uuid,p_expected jsonb,p_recovery_key text,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;v_file jsonb;
begin
  if exists(select 1 from public.project_recovery where project_id=p_project) then return; end if;
  perform 1 from public.projects where id=p_project and archived_at is not null for update;
  if not found then raise exception 'Archived project not found'; end if;
  -- Lock children too: snapshot comparison cannot race edits to existing rows.
  perform 1 from public.milestones where project_id=p_project order by id for update;
  perform 1 from public.files where project_id=p_project order by id for update;
  if exists(select 1 from public.invoices where project_id=p_project) then raise exception 'Project has retained invoices'; end if;
  v_snapshot:=public.project_cleanup_snapshot(p_project);
  if v_snapshot is distinct from p_expected then raise exception 'Project changed during backup'; end if;
  if p_recovery_key !~ ('^archive/project_'||p_project::text||'/recovery_[0-9a-f-]{36}\.zip$') or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid recovery proof'; end if;
  insert into public.project_recovery(project_id,snapshot,recovery_key,sha256) values(p_project,v_snapshot,p_recovery_key,p_sha256);
  for v_file in select value from jsonb_array_elements(v_snapshot->'files') order by value->>'r2_key' loop
    perform pg_advisory_xact_lock(hashtextextended(v_file->>'r2_key',817));
    insert into public.storage_deletions(r2_key,source,project_id,file_snapshot) values(v_file->>'r2_key','project',p_project,v_file);
  end loop;
  -- FK refusal or any trigger failure rolls back the snapshot and queue too.
  -- Storage has not been touched when this transaction fails.
  delete from public.projects where id=p_project;
end;$$;
revoke all on function public.guard_cleanup_file_reference(),public.guard_cleanup_lead_references() from public,anon,authenticated;
revoke all on function public.claim_expired_storage(text,timestamptz),public.project_cleanup_snapshot(uuid),public.prepare_project_cleanup(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.claim_expired_storage(text,timestamptz),public.project_cleanup_snapshot(uuid),public.prepare_project_cleanup(uuid,jsonb,text,text) to service_role;
