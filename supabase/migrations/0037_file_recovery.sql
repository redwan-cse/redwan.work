-- Approved 2026-09-17 backup-before-delete contract. Forward-only development.
-- No backup expiration or production execution. Existing tombstones are kept;
-- incomplete legacy individual jobs require storage verification before drain.
create table public.file_recovery (
 file_id uuid primary key,
 requested_by uuid not null,
 file_snapshot jsonb not null,
 recovery_key text not null unique,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 archive_bytes bigint not null check(archive_bytes between 1 and 104857600),
 created_at timestamptz not null default now()
);
alter table public.file_recovery enable row level security;
revoke all on public.file_recovery from public,anon,authenticated,service_role;
grant select on public.file_recovery to service_role;

create function public.file_backup_snapshot(p_file uuid,p_actor uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_file public.files%rowtype;v_owner uuid;
begin
 if p_file is null or p_actor is null or p_role is null or p_role not in('admin','client') then raise exception 'File unavailable';end if;
 perform 1 from public.profiles pr join auth.users u on u.id=pr.id where pr.id=p_actor and pr.role::text=p_role and pr.is_active is true and u.raw_app_meta_data->>'role'=p_role and (u.banned_until is null or u.banned_until<=now());
 if not found then raise exception 'File unavailable';end if;
 select * into v_file from public.files where id=p_file;
 if not found or v_file.bucket<>'private' or v_file.kind not in('attachment','deliverable') then raise exception 'File unavailable';end if;
 if v_file.project_id is not null then
  select client_id into v_owner from public.projects where id=v_file.project_id and archived_at is null;
  if not found or p_role<>'admin' then raise exception 'File unavailable';end if;
 elsif v_file.ticket_id is not null then
  select client_id into v_owner from public.tickets where id=v_file.ticket_id;
  if not found or (p_role='client' and v_owner<>p_actor) then raise exception 'File unavailable';end if;
 else v_owner:=v_file.uploaded_by;end if;
 if p_role='client' and (v_file.kind<>'attachment' or v_file.uploaded_by<>p_actor or v_file.created_at>clock_timestamp() or v_file.created_at<clock_timestamp()-interval '24 hours') then raise exception 'File unavailable';end if;
 if v_file.r2_key !~ ('^private/'||v_owner::text||'/(pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$') then raise exception 'File unavailable';end if;
 return to_jsonb(v_file);
end;$$;

create function public.prepare_backed_up_file_deletion(p_file uuid,p_actor uuid,p_role text,p_expected jsonb,p_key text,p_sha256 text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.storage_deletions%rowtype;v_record public.file_recovery%rowtype;v_now jsonb;v_result jsonb;
begin
 -- Original preparation rechecks current profile/Auth authority and lock order.
 -- An outer file advisory lock serializes backup registration and retries.
 perform pg_advisory_xact_lock(hashtextextended(p_file::text,818));
 select * into v_record from public.file_recovery where file_id=p_file;
 if found then
  if v_record.requested_by is distinct from p_actor then raise exception 'File unavailable';end if;
  return public.prepare_file_deletion(p_file,p_actor,p_role);
 end if;
 v_now:=public.file_backup_snapshot(p_file,p_actor,p_role);
 if v_now is distinct from p_expected then raise exception 'File changed during backup';end if;
 if p_key is null or p_key !~ ('^archive/project_'||p_file::text||'/individual_[0-9a-f-]{36}\.zip$') or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 1 and 104857600 then raise exception 'Invalid backup proof';end if;
 insert into public.file_recovery(file_id,requested_by,file_snapshot,recovery_key,sha256,archive_bytes) values(p_file,p_actor,p_expected,p_key,p_sha256,p_bytes);
 v_result:=public.prepare_file_deletion(p_file,p_actor,p_role);
 select * into v_job from public.storage_deletions where file_id=p_file;
 if not found or v_job.file_snapshot is distinct from p_expected or v_job.r2_key is distinct from p_expected->>'r2_key' then raise exception 'File changed during backup';end if;
 return v_result;
end;$$;
-- Unbacked old application calls fail closed after rollout. Deploy the new
-- deletion integration with this migration; do not assume old app can delete.
revoke all on function public.prepare_file_deletion(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.file_backup_snapshot(uuid,uuid,text),public.prepare_backed_up_file_deletion(uuid,uuid,text,jsonb,text,text,bigint) from public,anon,authenticated;
grant execute on function public.file_backup_snapshot(uuid,uuid,text),public.prepare_backed_up_file_deletion(uuid,uuid,text,jsonb,text,text,bigint) to service_role;

create function public.guard_individual_backup_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source='individual' and not exists(select 1 from public.file_recovery r where r.file_id=new.file_id and r.requested_by=new.requested_by and r.file_snapshot=new.file_snapshot and r.file_snapshot->>'r2_key'=new.r2_key) then raise exception 'Verified file backup required';end if;
 return new;
end;$$;
revoke all on function public.guard_individual_backup_job() from public,anon,authenticated,service_role;
create trigger guard_individual_backup_job before insert on public.storage_deletions for each row execute function public.guard_individual_backup_job();
