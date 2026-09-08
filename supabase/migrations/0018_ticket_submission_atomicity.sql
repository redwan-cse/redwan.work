-- Forward-only. Apply to disposable databases first; no production execution implied.
-- Existing records are unchanged. Client submission identities are scoped to a profile.
create table public.ticket_submissions (
  client_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (client_id, request_id)
);
alter table public.ticket_submissions enable row level security;
revoke all on public.ticket_submissions from anon, authenticated;
grant all on public.ticket_submissions to service_role;
create index tickets_client_created_idx on public.tickets(client_id, created_at);

create function public.attach_ticket_files_atomic(p_actor uuid, p_ticket uuid, p_entries jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_owner uuid;
  v_entry jsonb;
  v_prefix text;
  v_existing public.files%rowtype;
  v_count int;
begin
  select role::text into v_role from public.profiles where id = p_actor and is_active is true for share;
  if v_role is null or v_role not in ('admin','client') then raise exception 'Unauthorized'; end if;
  select client_id into v_owner from public.tickets where id = p_ticket for update;
  if not found or (v_role <> 'admin' and v_owner <> p_actor) then raise exception 'Ticket not found'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 10 then raise exception 'Invalid attachment data'; end if;
  if (select count(*) from jsonb_array_elements(p_entries)) <> (select count(distinct value->>'key') from jsonb_array_elements(p_entries)) then raise exception 'Invalid attachment data'; end if;
  v_prefix := 'private/' || v_owner::text || '/';
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if coalesce(jsonb_typeof(v_entry), '') <> 'object'
       or coalesce(v_entry->>'key', '') !~ ('^' || v_prefix || '(pending|ticket_' || p_ticket::text || ')/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$')
       or coalesce(char_length(btrim(v_entry->>'filename')), 0) not between 1 and 255
       or coalesce(char_length(v_entry->>'mime'), 0) not between 1 and 128
       or coalesce(v_entry->>'size_bytes','') !~ '^[0-9]+$'
       or (v_entry->>'size_bytes')::numeric not between 1 and 10485760 then raise exception 'Invalid attachment data'; end if;
    select * into v_existing from public.files where r2_key = v_entry->>'key';
    if found then
      if v_existing.ticket_id is distinct from p_ticket or v_existing.uploaded_by is distinct from p_actor
         or v_existing.filename is distinct from v_entry->>'filename' or v_existing.mime is distinct from v_entry->>'mime'
         or v_existing.size_bytes is distinct from (v_entry->>'size_bytes')::bigint then raise exception 'Attachment conflict'; end if;
    else
      select count(*) into v_count from public.files where ticket_id = p_ticket and kind = 'attachment';
      if v_count >= 10 then raise exception 'Attachment limit reached'; end if;
      insert into public.files(bucket,r2_key,kind,ticket_id,uploaded_by,filename,mime,size_bytes)
      values ('private',v_entry->>'key','attachment',p_ticket,p_actor,v_entry->>'filename',v_entry->>'mime',(v_entry->>'size_bytes')::bigint);
    end if;
  end loop;
end;
$$;

create function public.create_ticket_atomic(p_client uuid, p_request uuid, p_subject text, p_body text, p_entries jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ticket uuid;
  v_payload jsonb;
  v_previous jsonb;
  v_count int;
begin
  if p_request is null or coalesce(char_length(btrim(p_subject)),0) not between 1 and 200
     or coalesce(char_length(btrim(p_body)),0) not between 1 and 10000 then raise exception 'Invalid ticket data'; end if;
  -- Serialize submissions per profile: quota, retry lookup and writes share one lock.
  perform 1 from public.profiles where id = p_client and role = 'client' and is_active is true for update;
  if not found then raise exception 'Unauthorized'; end if;
  v_payload := jsonb_build_object('subject',btrim(p_subject),'body',btrim(p_body),'entries',p_entries);
  select ticket_id,payload into v_ticket,v_previous from public.ticket_submissions where client_id=p_client and request_id=p_request;
  if found then
    if v_previous is distinct from v_payload then raise exception 'Submission conflict'; end if;
    return v_ticket;
  end if;
  select count(*) into v_count from public.tickets where client_id=p_client and created_at >= now()-interval '24 hours';
  if v_count >= 10 then raise exception 'Ticket limit reached'; end if;
  insert into public.tickets(client_id,subject) values(p_client,btrim(p_subject)) returning id into v_ticket;
  insert into public.ticket_messages(ticket_id,author_id,body) values(v_ticket,p_client,btrim(p_body));
  perform public.attach_ticket_files_atomic(p_client,v_ticket,p_entries);
  insert into public.ticket_submissions(client_id,request_id,ticket_id,payload) values(p_client,p_request,v_ticket,v_payload);
  return v_ticket;
end;
$$;
revoke all on function public.attach_ticket_files_atomic(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.attach_ticket_files_atomic(uuid,uuid,jsonb) to service_role;
revoke all on function public.create_ticket_atomic(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_ticket_atomic(uuid,uuid,text,text,jsonb) to service_role;
