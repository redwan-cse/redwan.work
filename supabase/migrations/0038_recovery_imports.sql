-- Approved admin local-upload recovery. No automatic backup/staging purge.
-- Only known retained backup hashes are imported; arbitrary ZIP metadata cannot
-- create identities, roles or financial records. Server verifies bytes first.
create table public.recovery_imports (
 id uuid primary key,
 actor uuid not null,
 upload_key text not null unique,
 sealed_key text not null unique,
 sha256 text,
 kind text check(kind in('individual','project')),
 snapshot jsonb,
 result jsonb,
 created_at timestamptz not null default now()
);
alter table public.recovery_imports enable row level security;
revoke all on public.recovery_imports from public,anon,authenticated,service_role;
grant select on public.recovery_imports to service_role;

create function public.require_recovery_admin(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles pr join auth.users u on u.id=pr.id where pr.id=p_actor and pr.role='admin' and pr.is_active and u.raw_app_meta_data->>'role'='admin' and (u.banned_until is null or u.banned_until<=now()) for share of pr,u;
 if not found then raise exception 'Recovery access denied';end if;
end;$$;

create function public.open_recovery_import(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.recovery_imports%rowtype;
begin
 perform public.require_recovery_admin(p_actor);
 if p_id is null then raise exception 'Invalid import';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,822));
 select * into v from public.recovery_imports where id=p_id;
 if found then if v.actor<>p_actor then raise exception 'Import unavailable';end if;return to_jsonb(v);end if;
 if (select count(*) from public.recovery_imports where actor=p_actor and created_at>now()-interval '1 hour')>=5 then raise exception 'Import limit reached';end if;
 insert into public.recovery_imports(id,actor,upload_key,sealed_key) values(p_id,p_actor,'archive/project_'||p_actor::text||'/upload_'||p_id::text||'.zip','archive/project_'||p_actor::text||'/import_'||p_id::text||'.zip') returning * into v;
 return to_jsonb(v);
end;$$;

create function public.seal_recovery_import(p_actor uuid,p_id uuid,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.recovery_imports%rowtype;s jsonb;k text;
begin
 perform public.require_recovery_admin(p_actor);
 select * into v from public.recovery_imports where id=p_id and actor=p_actor for update;
 if not found or v.created_at<now()-interval '24 hours' then raise exception 'Import unavailable';end if;
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid backup';end if;
 if v.sha256 is not null then if v.sha256<>p_sha256 then raise exception 'Import changed';end if;return to_jsonb(v);end if;
 select file_snapshot,'individual' into s,k from public.file_recovery where sha256=p_sha256 limit 1;
 if not found then select snapshot,'project' into s,k from public.project_recovery where sha256=p_sha256 limit 1;end if;
 if s is null then raise exception 'Backup is not registered';end if;
 update public.recovery_imports set sha256=p_sha256,kind=k,snapshot=s where id=p_id returning * into v;
 return to_jsonb(v);
end;$$;

create function public.restore_recovery_import(p_actor uuid,p_id uuid,p_mapping jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.recovery_imports%rowtype;s jsonb;files jsonb;f jsonb;m jsonb;owner_id uuid;project_id_new uuid;ticket_id_target uuid;file_id_new uuid;ext text;expected_key text;result_ids jsonb:='[]';milestone jsonb;
begin
 perform public.require_recovery_admin(p_actor);
 select * into v from public.recovery_imports where id=p_id and actor=p_actor for update;
 if not found or v.sha256 is null then raise exception 'Import unavailable';end if;
 if v.result is not null then return v.result;end if;
 if v.created_at<now()-interval '24 hours' then raise exception 'Import expired';end if;
 s:=v.snapshot;
 if v.kind='project' then
  owner_id:=(s->'project'->>'client_id')::uuid;
  project_id_new:=(p_mapping->>'project_id')::uuid;
  if project_id_new is null or project_id_new=(s->'project'->>'id')::uuid then raise exception 'New project identity required';end if;
  perform 1 from public.profiles where id=owner_id and role='client' and is_active for share;
  if not found then raise exception 'Original client unavailable';end if;
  insert into public.projects(id,client_id,name,description,status,due_at) values(project_id_new,owner_id,s->'project'->>'name',s->'project'->>'description',(s->'project'->>'status')::public.project_status,(s->'project'->>'due_at')::date);
  if jsonb_typeof(s->'milestones')<>'array' or jsonb_array_length(s->'milestones')>10000 then raise exception 'Invalid milestones';end if;
  for milestone in select value from jsonb_array_elements(s->'milestones') loop
   insert into public.milestones(project_id,title,amount_cents,currency,position,status) values(project_id_new,milestone->>'title',(milestone->>'amount_cents')::int,milestone->>'currency',(milestone->>'position')::int,(milestone->>'status')::public.milestone_status);
  end loop;
  files:=s->'files';
 else
  files:=jsonb_build_array(s);
  project_id_new:=(s->>'project_id')::uuid;ticket_id_target:=(s->>'ticket_id')::uuid;
  if project_id_new is not null then
   select client_id into owner_id from public.projects where id=project_id_new and archived_at is null for update;
  elsif ticket_id_target is not null then
   select client_id into owner_id from public.tickets where id=ticket_id_target for update;
  else raise exception 'Original parent unavailable';end if;
  if owner_id is null then raise exception 'Original parent unavailable';end if;
 end if;
 if files is null or jsonb_typeof(files)<>'array' or jsonb_array_length(files)>2000 or p_mapping is null or jsonb_typeof(p_mapping->'files') is distinct from 'array' or jsonb_array_length(files)<>jsonb_array_length(p_mapping->'files') then raise exception 'Invalid restore mapping';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_mapping->'files'))<>jsonb_array_length(files) or (select count(distinct value->>'source_id') from jsonb_array_elements(p_mapping->'files'))<>jsonb_array_length(files) then raise exception 'Duplicate mapping';end if;
 for f in select value from jsonb_array_elements(files) loop
  select value into m from jsonb_array_elements(p_mapping->'files') where value->>'source_id'=f->>'id';
  if m is null then raise exception 'Missing mapping';end if;
  file_id_new:=(m->>'id')::uuid;
  if file_id_new is null or file_id_new=(f->>'id')::uuid then raise exception 'New file identity required';end if;
  ext:=substring(f->>'r2_key' from '\.(pdf|docx|doc|xlsx|png|jpg|zip)$');
  if ext is null or f->>'bucket'<>'private' or f->>'kind' not in('attachment','deliverable') then raise exception 'Unsupported backup file';end if;
  expected_key:='private/'||owner_id::text||'/'||case when project_id_new is not null then 'project_'||project_id_new::text else 'ticket_'||ticket_id_target::text end||'/'||file_id_new::text||'.'||ext;
  if m->>'key' is distinct from expected_key then raise exception 'Invalid restored object key';end if;
  insert into public.files(id,bucket,kind,project_id,ticket_id,uploaded_by,r2_key,filename,mime,size_bytes) values(file_id_new,'private',(f->>'kind')::public.file_kind,project_id_new,ticket_id_target,p_actor,expected_key,f->>'filename',f->>'mime',(f->>'size_bytes')::bigint);
  -- Suppress only events generated for this newly inserted file, before commit.
  -- Existing outbox records and original delivery audit are never modified.
  update public.email_outbox set state='suppressed',error_code='recovery_restore',updated_at=now() where entity_id=file_id_new and template='deliverable-uploaded' and state in('pending','failed');
  result_ids:=result_ids||jsonb_build_array(file_id_new);
 end loop;
 update public.recovery_imports set result=jsonb_build_object('projectId',project_id_new,'fileIds',result_ids) where id=p_id returning result into s;
 return s;
end;$$;
revoke all on function public.require_recovery_admin(uuid),public.open_recovery_import(uuid,uuid),public.seal_recovery_import(uuid,uuid,text),public.restore_recovery_import(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.open_recovery_import(uuid,uuid),public.seal_recovery_import(uuid,uuid,text),public.restore_recovery_import(uuid,uuid,jsonb) to service_role;
