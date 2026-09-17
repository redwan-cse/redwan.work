create function public.admin_overview(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active is true) then raise exception 'Unauthorized';end if;
 return jsonb_build_object(
 'openTickets',(select count(*) from public.tickets where status='open'),
 'clients',(select count(*) from public.profiles where role='client'),
 'activeClients',(select count(*) from public.profiles where role='client' and is_active is true),
 'archived',(select count(*) from public.projects where archived_at is not null),
 'unpaidInvoices',(select count(*) from public.invoices i where i.status='sent' and public.invoice_total_cents(i.id)>(select coalesce(sum(amount_cents),0) from public.payments where invoice_id=i.id and status='confirmed')),
 'leads',coalesce((select jsonb_agg(to_jsonb(row)) from(select id,ticket_number number,name,email,company,status,converted_client_id from public.leads order by created_at desc,id limit 5)row),'[]'::jsonb));
end;$$;
create function public.admin_projects_page(p_actor uuid,p_page int default 1,p_archived boolean default false,p_client_page int default 1,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_projects jsonb;v_clients jsonb;v_total bigint;v_client_total bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active is true) then raise exception 'Unauthorized';end if;
 if p_page is null or p_page<1 or p_page>100000 or p_client_page is null or p_client_page<1 or p_client_page>100000 or char_length(coalesce(p_search,''))>200 then raise exception 'Invalid page';end if;
 select count(*) into v_total from public.projects where (archived_at is not null)=p_archived;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into v_projects from(
  select p.id,p.name,p.status,p.due_at,p.archived_at,c.full_name client_name,u.email client_email,
   (select count(*) from public.milestones where project_id=p.id) milestone_total,
   (select count(*) from public.milestones where project_id=p.id and status='done') milestone_done,
   (select count(*) from public.files where project_id=p.id and kind='deliverable') file_count
  from(select * from public.projects where (archived_at is not null)=p_archived order by created_at desc,id limit 25 offset (p_page-1)*25)p
  join public.profiles c on c.id=p.client_id left join auth.users u on u.id=c.id
  order by p.created_at desc,p.id
 )row;
 select count(*) into v_client_total from public.profiles p left join auth.users u on u.id=p.id
 where p.role='client' and p.is_active is true and (coalesce(p_search,'')='' or position(lower(p_search) in lower(coalesce(p.full_name,'')||' '||coalesce(u.email,'')))>0);
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into v_clients from(
  select p.id,p.full_name,p.company,p.is_active,p.created_at,coalesce(u.email,'') email from public.profiles p left join auth.users u on u.id=p.id
  where p.role='client' and p.is_active is true and (coalesce(p_search,'')='' or position(lower(p_search) in lower(coalesce(p.full_name,'')||' '||coalesce(u.email,'')))>0)
  order by p.created_at desc,p.id limit 25 offset (p_client_page-1)*25
 )row;
 return jsonb_build_object('projects',v_projects,'total',v_total,'clients',v_clients,'clientTotal',v_client_total);
end;$$;
revoke all on function public.admin_overview(uuid),public.admin_projects_page(uuid,int,boolean,int,text) from public,anon,authenticated;
grant execute on function public.admin_overview(uuid),public.admin_projects_page(uuid,int,boolean,int,text) to service_role;
