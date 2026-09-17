create function public.portal_dashboard(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='client' and is_active is true) then raise exception 'Unauthorized';end if;
 return jsonb_build_object(
 'openTickets',(select count(*) from public.tickets where client_id=p_actor and status='open'),
 'activeProjects',(select count(*) from public.projects where client_id=p_actor and status='active' and archived_at is null),
 'outstandingInvoices',(select count(*) from public.invoices i join public.projects p on p.id=i.project_id where p.client_id=p_actor and i.status='sent' and public.invoice_total_cents(i.id)>(select coalesce(sum(amount_cents),0) from public.payments where invoice_id=i.id and status='confirmed')),
 'projects',coalesce((select jsonb_agg(to_jsonb(row)) from(select id,name,status from public.projects where client_id=p_actor and archived_at is null order by created_at desc,id limit 4)row),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(to_jsonb(row)) from(select id,number,subject,status from public.tickets where client_id=p_actor order by last_message_at desc,id limit 4)row),'[]'::jsonb));
end;$$;
create function public.portal_files_page(p_actor uuid,p_project uuid default null,p_page int default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;v_total bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='client' and is_active is true) then raise exception 'Unauthorized';end if;
 if p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid page';end if;
 if p_project is null then
  select count(*) into v_total from public.projects where client_id=p_actor and archived_at is null;
  select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into v_items from(
   select p.id,p.name,p.status,p.due_at,
    (select count(*) from public.files where project_id=p.id and kind='deliverable') file_total,
    coalesce((select jsonb_agg(to_jsonb(f)) from(select id,filename,size_bytes,created_at from public.files where project_id=p.id and kind='deliverable' order by created_at,id limit 10)f),'[]'::jsonb) files
   from public.projects p where client_id=p_actor and archived_at is null order by created_at desc,id limit 10 offset (p_page-1)*10
  )row;
 else
  select count(*) into v_total from public.files f join public.projects p on p.id=f.project_id where p.id=p_project and p.client_id=p_actor and p.archived_at is null and f.kind='deliverable';
  select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into v_items from(
   select p.id,p.name,p.status,p.due_at,v_total file_total,
    coalesce((select jsonb_agg(to_jsonb(f)) from(select id,filename,size_bytes,created_at from public.files where project_id=p.id and kind='deliverable' order by created_at,id limit 25 offset (p_page-1)*25)f),'[]'::jsonb) files
   from public.projects p where p.id=p_project and p.client_id=p_actor and p.archived_at is null
  )row;
 end if;
 return jsonb_build_object('items',v_items,'total',v_total,'page',p_page);
end;$$;
revoke all on function public.portal_dashboard(uuid),public.portal_files_page(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.portal_dashboard(uuid),public.portal_files_page(uuid,uuid,int) to service_role;
