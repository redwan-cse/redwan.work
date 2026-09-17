-- Service-only compatibility APIs. Explicit limits fail rather than truncate.
create function public.legacy_project_rows(p_client uuid default null,p_archived boolean default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total bigint;v_rows jsonb;
begin
 select count(*) into v_total from public.projects p where (p_client is null or p.client_id=p_client) and (p_archived is null or (p.archived_at is not null)=p_archived);
 if v_total>1000 then raise exception 'Use paginated project reader';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),'[]'::jsonb) into v_rows from(
 select p.*,pr.full_name client_name,coalesce(u.email,'') client_email,
 (select count(*) from public.milestones m where m.project_id=p.id) milestone_total,
 (select count(*) from public.milestones m where m.project_id=p.id and m.status='done') milestone_done,
 (select count(*) from public.files f where f.project_id=p.id and f.kind='deliverable') file_count
 from public.projects p join public.profiles pr on pr.id=p.client_id join auth.users u on u.id=p.client_id
 where (p_client is null or p.client_id=p_client) and (p_archived is null or (p.archived_at is not null)=p_archived)) r;
 return v_rows;
end;$$;
create function public.legacy_invoice_rows(p_actor uuid,p_role text,p_status text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total bigint;v_rows jsonb;
begin
 if p_role is null or p_role not in ('admin','client') or p_actor is null then raise exception 'Unauthorized';end if;
 perform 1 from public.profiles pr join auth.users u on u.id=pr.id where pr.id=p_actor and pr.role::text=p_role and pr.is_active is true and u.raw_app_meta_data->>'role'=p_role and (u.banned_until is null or u.banned_until<=now());
 if not found then raise exception 'Unauthorized';end if;
 if p_status is not null and p_status not in ('draft','sent','paid','void') then raise exception 'Invalid status';end if;
 select count(*) into v_total from public.invoices i join public.projects p on p.id=i.project_id where (p_role='admin' or (p.client_id=p_actor and i.status<>'draft')) and (p_status is null or i.status::text=p_status);
 if v_total>1000 then raise exception 'Use paginated invoice reader';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),'[]'::jsonb) into v_rows from(
 select i.id,i.project_id,p.name project_name,p.client_id,pr.full_name client_name,coalesce(u.email,'') client_email,i.number,i.currency,i.status,i.issued_at,i.due_at,i.payment_note,i.created_at,
 amount.total_cents,paid.submitted_cents,paid.confirmed_cents,greatest(amount.total_cents-paid.confirmed_cents,0) outstanding_cents
 from public.invoices i join public.projects p on p.id=i.project_id join public.profiles pr on pr.id=p.client_id join auth.users u on u.id=p.client_id
 cross join lateral(select public.invoice_total_cents(i.id) total_cents) amount
 cross join lateral(select coalesce(sum(amount_cents) filter(where status in('submitted','confirmed')),0)::bigint submitted_cents,coalesce(sum(amount_cents) filter(where status='confirmed'),0)::bigint confirmed_cents from public.payments where invoice_id=i.id) paid
 where (p_role='admin' or (p.client_id=p_actor and i.status<>'draft')) and (p_status is null or i.status::text=p_status)) r;
 return v_rows;
end;$$;
create function public.outstanding_invoice_count(p_client uuid default null)
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.invoices i join public.projects p on p.id=i.project_id
 where i.status='sent' and (p_client is null or p.client_id=p_client)
 and public.invoice_total_cents(i.id)>(select coalesce(sum(amount_cents),0) from public.payments where invoice_id=i.id and status='confirmed');
$$;
revoke all on function public.legacy_project_rows(uuid,boolean),public.legacy_invoice_rows(uuid,text,text),public.outstanding_invoice_count(uuid) from public,anon,authenticated;
grant execute on function public.legacy_project_rows(uuid,boolean),public.legacy_invoice_rows(uuid,text,text),public.outstanding_invoice_count(uuid) to service_role;
