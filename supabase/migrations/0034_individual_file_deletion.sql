-- Additive queue metadata and expanded source enum; existing records preserved.
alter table public.storage_deletions add column file_id uuid, add column requested_by uuid;
create unique index storage_deletions_file_id_idx on public.storage_deletions(file_id) where file_id is not null;
alter table public.storage_deletions drop constraint storage_deletions_source_check;
alter table public.storage_deletions add constraint storage_deletions_source_check check(source in ('contact','pending','project','individual'));

create function public.prepare_file_deletion(p_file uuid,p_actor uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_file public.files%rowtype;v_now public.files%rowtype;v_job public.storage_deletions%rowtype;v_owner uuid;
begin
 if p_file is null or p_actor is null or p_role is null or p_role not in ('admin','client') then raise exception 'File unavailable';end if;
 -- Current profile and Auth role must agree; caller also verifies the session.
 perform 1 from public.profiles pr join auth.users u on u.id=pr.id where pr.id=p_actor and pr.role::text=p_role and pr.is_active is true and u.raw_app_meta_data->>'role'=p_role and (u.banned_until is null or u.banned_until<=now()) for share of pr,u;
 if not found then raise exception 'File unavailable';end if;
 -- Serialize concurrent retries for the same file even after its row is removed.
 perform pg_advisory_xact_lock(hashtextextended(p_file::text,818));
 select * into v_job from public.storage_deletions where file_id=p_file;
 if found then
  if v_job.requested_by is distinct from p_actor then raise exception 'File unavailable';end if;
  return jsonb_build_object('key',v_job.r2_key,'completed',v_job.completed_at is not null);
 end if;
 select * into v_file from public.files where id=p_file;
 if not found or v_file.bucket<>'private' or v_file.kind not in ('attachment','deliverable') then raise exception 'File unavailable';end if;
 -- Match archive/confirmation lock order: parent, key, file. No storage call in SQL.
 if v_file.project_id is not null then
  select client_id into v_owner from public.projects where id=v_file.project_id and archived_at is null for update;
  if not found or p_role<>'admin' then raise exception 'File unavailable';end if;
 elsif v_file.ticket_id is not null then
  select client_id into v_owner from public.tickets where id=v_file.ticket_id for update;
  if not found or (p_role='client' and v_owner<>p_actor) then raise exception 'File unavailable';end if;
 else v_owner:=v_file.uploaded_by;end if;
 if p_role='client' and (v_file.kind<>'attachment' or v_file.uploaded_by<>p_actor or v_file.created_at>clock_timestamp() or v_file.created_at<clock_timestamp()-interval '24 hours') then raise exception 'File unavailable';end if;
 if v_file.r2_key !~ ('^private/'||v_owner::text||'/(pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$') then raise exception 'File unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_file.r2_key,817));
 select * into v_now from public.files where id=p_file for update;
 if not found or to_jsonb(v_now) is distinct from to_jsonb(v_file) then raise exception 'File changed';end if;
 if exists(select 1 from public.leads l cross join lateral jsonb_array_elements(coalesce(l.attachments,'[]'::jsonb)) a where a->>'key'=v_file.r2_key) then raise exception 'File has retained reference';end if;
 insert into public.storage_deletions(r2_key,source,file_id,requested_by,file_snapshot) values(v_file.r2_key,'individual',p_file,p_actor,to_jsonb(v_file));
 delete from public.files where id=p_file;
 return jsonb_build_object('key',v_file.r2_key,'completed',false);
end;$$;
revoke all on function public.prepare_file_deletion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_file_deletion(uuid,uuid,text) to service_role;
