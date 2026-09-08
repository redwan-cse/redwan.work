-- No data rewrite. Only the leased worker may resolve a current recipient.
-- Recheck role, resource ownership, Auth role and address at delivery time,
-- including retries with an already-rendered envelope.
create function public.email_dispatch_recipient(p_event uuid,p_lease uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_event public.email_outbox%rowtype;v_role text;v_email text;v_admin boolean;
begin
 select * into v_event from public.email_outbox where id=p_event and lease_token=p_lease and state='processing' and lease_until>now();
 if not found or v_event.recipient_id is null then return null;end if;
 select p.role,lower(btrim(u.email)) into v_role,v_email from public.profiles p join auth.users u on u.id=p.id
 where p.id=v_event.recipient_id and p.is_active is true
 and coalesce(u.raw_app_meta_data->>'role','')=p.role and (u.banned_until is null or u.banned_until<=now());
 if not found or v_email is null or v_email='' then return null;end if;
 v_admin:=v_event.template='new-ticket' or (v_event.template='reply-posted' and v_event.payload->'adminAudience'='true'::jsonb);
 if v_admin then
  if v_role<>'admin' or not exists(select 1 from public.tickets where id=v_event.entity_id) then return null;end if;
 elsif v_role<>'client' then return null;
 elsif v_event.template in('reply-posted','status-changed') then
  if not exists(select 1 from public.tickets where id=v_event.entity_id and client_id=v_event.recipient_id) then return null;end if;
 elsif v_event.template in('invoice-issued','payment-confirmed') then
  if not exists(select 1 from public.invoices i join public.projects p on p.id=i.project_id where i.id=v_event.entity_id and p.client_id=v_event.recipient_id and i.status<>'draft') then return null;end if;
 elsif v_event.template='deliverable-uploaded' then
  if not exists(select 1 from public.files f join public.projects p on p.id=f.project_id where f.id=v_event.entity_id and f.kind='deliverable' and p.client_id=v_event.recipient_id and p.archived_at is null) then return null;end if;
 else return null;end if;
 -- Never send a frozen retry to a superseded address or change the payload
 -- under an already-used idempotency key.
 if v_event.envelope is not null and lower(btrim(v_event.envelope->>'to')) is distinct from v_email then return null;end if;
 return v_email;
end;$$;
revoke all on function public.email_dispatch_recipient(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_dispatch_recipient(uuid,uuid) to service_role;
