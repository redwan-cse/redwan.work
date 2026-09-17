create function public.invoice_page(p_actor uuid,p_page integer default 1,p_status text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text;v_total bigint;v_items jsonb;
begin
 select role into v_role from public.profiles where id=p_actor and is_active is true;
 if v_role is null or v_role not in('admin','client') then raise exception 'Unauthorized';end if;
 if p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid page';end if;
 if p_status is not null and p_status not in('draft','sent','paid','void') then raise exception 'Invalid status';end if;
 select count(*) into v_total from public.invoices i join public.projects p on p.id=i.project_id
 where (v_role='admin' or (p.client_id=p_actor and i.status<>'draft')) and (p_status is null or i.status::text=p_status);
 select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc,row.id),'[]'::jsonb) into v_items from (
  select i.id,i.project_id,p.name project_name,p.client_id,profile.full_name client_name,u.email client_email,i.number,i.currency,i.status,i.issued_at,i.due_at,i.payment_note,i.created_at,
   amount.total_cents,paid.submitted_cents,paid.confirmed_cents,greatest(amount.total_cents-paid.confirmed_cents,0) outstanding_cents
  from (select candidate.* from public.invoices candidate join public.projects owner on owner.id=candidate.project_id
    where (v_role='admin' or (owner.client_id=p_actor and candidate.status<>'draft')) and (p_status is null or candidate.status::text=p_status)
    order by candidate.created_at desc,candidate.id limit 25 offset (p_page-1)*25) i
  join public.projects p on p.id=i.project_id join public.profiles profile on profile.id=p.client_id left join auth.users u on u.id=p.client_id
  cross join lateral(select public.invoice_total_cents(i.id) total_cents) amount
  cross join lateral(select coalesce(sum(amount_cents) filter(where status in('submitted','confirmed')),0)::bigint submitted_cents,coalesce(sum(amount_cents) filter(where status='confirmed'),0)::bigint confirmed_cents from public.payments where invoice_id=i.id) paid
 ) row;
 return jsonb_build_object('items',v_items,'total',v_total,'page',p_page);
end;$$;
revoke all on function public.invoice_page(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.invoice_page(uuid,integer,text) to service_role;
create index invoices_created_page_idx on public.invoices(created_at desc,id);
