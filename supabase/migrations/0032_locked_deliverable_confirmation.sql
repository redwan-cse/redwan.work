-- Additive trusted-server API. Restore tooling may still insert exact verified
-- snapshots as a privileged operator; normal confirmation cannot mutate archives.
create function public.confirm_project_deliverable(p_actor uuid,p_project uuid,p_file jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;v_existing public.files%rowtype;v_id uuid;v_key text;v_size bigint;
begin
 if p_file is null or jsonb_typeof(p_file)<>'object' or p_file - array['r2_key','filename','mime','size_bytes']<>'{}'::jsonb then raise exception 'Invalid file';end if;
 perform 1 from public.profiles pr join auth.users u on u.id=pr.id where pr.id=p_actor and pr.role='admin' and pr.is_active is true and u.raw_app_meta_data->>'role'='admin' and (u.banned_until is null or u.banned_until<=now()) for share of pr,u;
 if not found then raise exception 'Unauthorized';end if;
 select client_id into v_owner from public.projects where id=p_project and archived_at is null for update;
 if not found then raise exception 'Project unavailable';end if;
 v_key:=p_file->>'r2_key';
 if jsonb_typeof(p_file->'r2_key') is distinct from 'string' or v_key !~ ('^private/'||v_owner::text||'/project_'||p_project::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|doc|xlsx|png|jpg|zip)$') then raise exception 'Invalid file scope';end if;
 if jsonb_typeof(p_file->'filename') is distinct from 'string' or char_length(p_file->>'filename') not between 1 and 255 or jsonb_typeof(p_file->'mime') is distinct from 'string' or char_length(p_file->>'mime') not between 1 and 128 then raise exception 'Invalid metadata';end if;
 if jsonb_typeof(p_file->'size_bytes') is distinct from 'number' or (p_file->>'size_bytes') !~ '^[0-9]+$' then raise exception 'Invalid size';end if;
 v_size:=(p_file->>'size_bytes')::bigint;
 if v_size not between 1 and 10485760 then raise exception 'Invalid size';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,817));
 if exists(select 1 from public.storage_deletions where r2_key=v_key) then raise exception 'File no longer available';end if;
 select * into v_existing from public.files where r2_key=v_key for update;
 if found then
  if v_existing.project_id=p_project and v_existing.uploaded_by=p_actor and v_existing.bucket='private' and v_existing.kind='deliverable' and v_existing.ticket_id is null and v_existing.filename=p_file->>'filename' and v_existing.mime=p_file->>'mime' and v_existing.size_bytes=v_size then return v_existing.id;end if;
  raise exception 'File binding conflict';
 end if;
 insert into public.files(bucket,r2_key,kind,project_id,uploaded_by,filename,mime,size_bytes) values('private',v_key,'deliverable',p_project,p_actor,p_file->>'filename',p_file->>'mime',v_size) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.confirm_project_deliverable(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_project_deliverable(uuid,uuid,jsonb) to service_role;
