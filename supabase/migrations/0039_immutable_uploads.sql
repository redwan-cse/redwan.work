-- Approved upload-safety extension; no production execution or legacy backfill.
-- New final object IDs use reserved UUID version5. Existing mutable keys are
-- held, not reclassified. Storage proof registration is a trusted server action.
create table public.immutable_uploads(
 r2_key text primary key,
 source_key text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 created_at timestamptz not null default now()
);
alter table public.immutable_uploads enable row level security;
revoke all on public.immutable_uploads from public,anon,authenticated,service_role;
grant select on public.immutable_uploads to service_role;
create function public.register_immutable_upload(p_source text,p_key text,p_sha256 text,p_size bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare v public.immutable_uploads%rowtype;
begin
 if p_source is null or p_key is null or p_sha256 is null or p_size is null or p_size not between 1 and 10485760 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid upload proof';end if;
 if p_source !~ '^private/[0-9a-f-]{36}/(pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$' or p_key !~ '^private/[0-9a-f-]{36}/(pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|docx|doc|xlsx|png|jpg|zip)$' or regexp_replace(p_source,'/[^/]+$','')<>regexp_replace(p_key,'/[^/]+$','') or substring(p_source from '\.[a-z]+$')<>substring(p_key from '\.[a-z]+$') or p_source=p_key then raise exception 'Invalid upload scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source,824));
 select * into v from public.immutable_uploads where source_key=p_source;
 if found then return v.r2_key=p_key and v.sha256=p_sha256 and v.size_bytes=p_size;end if;
 if exists(select 1 from public.files where r2_key=p_key) or exists(select 1 from public.storage_deletions where r2_key=p_key) then raise exception 'Finalized key unavailable';end if;
 insert into public.immutable_uploads(r2_key,source_key,sha256,size_bytes)values(p_key,p_source,p_sha256,p_size);
 return true;
end;$$;
revoke all on function public.register_immutable_upload(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.register_immutable_upload(text,text,text,bigint) to service_role;
