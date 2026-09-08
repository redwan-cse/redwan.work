-- Forward-only. No data rewrite. Server-only callers retain current-admin checks.
create function public.mutate_project_milestone(p_operation text,p_project uuid,p_milestone uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_project uuid; v_id uuid; v_ids uuid[]; v_index integer; v_other integer;
 v_title text; v_amount integer; v_currency text; v_position integer;
begin
 if p_operation is null or p_operation not in ('add','update','delete','move') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid milestone operation'; end if;
 if p_operation='add' then
  v_project:=p_project;
 else
  select project_id into v_project from public.milestones where id=p_milestone;
  if not found then raise exception 'Milestone unavailable'; end if;
  if p_project is not null and p_project<>v_project then raise exception 'Project mismatch'; end if;
 end if;
 -- Same project-first order as archive, purge and milestone invoicing.
 perform 1 from public.projects where id=v_project and archived_at is null for update;
 if not found then raise exception 'Project unavailable'; end if;
 if p_operation<>'add' then
  perform 1 from public.milestones where id=p_milestone and project_id=v_project for update;
  if not found then raise exception 'Milestone unavailable'; end if;
 end if;
 if p_operation in ('add','update') then
  if (p_operation='add' and p_payload - array['title','amount_cents','currency'] <> '{}'::jsonb)
   or (p_operation='update' and (p_payload='{}'::jsonb or p_payload - array['title','amount_cents','status'] <> '{}'::jsonb)) then raise exception 'Invalid milestone fields'; end if;
  if p_operation='add' or p_payload ? 'title' then
   v_title:=btrim(p_payload->>'title');
   if jsonb_typeof(p_payload->'title') is distinct from 'string' or char_length(v_title) not between 1 and 200 then raise exception 'Invalid milestone title'; end if;
  end if;
  if p_payload ? 'amount_cents' then
   if jsonb_typeof(p_payload->'amount_cents') is distinct from 'number' or (p_payload->>'amount_cents') !~ '^[0-9]+$' then raise exception 'Invalid milestone amount'; end if;
   v_amount:=(p_payload->>'amount_cents')::integer;
  else v_amount:=0; end if;
  if p_operation='add' then
   v_currency:=coalesce(p_payload->>'currency','USD');
   if (p_payload ? 'currency' and jsonb_typeof(p_payload->'currency') is distinct from 'string') or v_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid milestone currency'; end if;
   select coalesce(max(position),-1)+1 into v_position from public.milestones where project_id=v_project;
   insert into public.milestones(project_id,title,amount_cents,currency,position) values(v_project,v_title,v_amount,v_currency,v_position) returning id into v_id;
   return v_id;
  end if;
  if p_payload ? 'status' and (jsonb_typeof(p_payload->'status') is distinct from 'string' or p_payload->>'status' not in ('pending','in_progress','done')) then raise exception 'Invalid milestone status'; end if;
  update public.milestones set title=case when p_payload ? 'title' then v_title else title end,
   amount_cents=case when p_payload ? 'amount_cents' then v_amount else amount_cents end,
   status=case when p_payload ? 'status' then (p_payload->>'status')::public.milestone_status else status end where id=p_milestone;
 elsif p_operation='delete' then
  if p_payload<>'{}'::jsonb then raise exception 'Invalid delete fields'; end if;
  -- Existing financial provenance RESTRICT constraint remains authoritative.
  delete from public.milestones where id=p_milestone;
 else
  if p_payload - 'direction'<>'{}'::jsonb or jsonb_typeof(p_payload->'direction') is distinct from 'string' or p_payload->>'direction' not in ('up','down') then raise exception 'Invalid direction'; end if;
  select array_agg(id order by position,id) into v_ids from public.milestones where project_id=v_project;
  v_index:=array_position(v_ids,p_milestone);
  v_other:=v_index+case when p_payload->>'direction'='up' then -1 else 1 end;
  if v_other<1 or v_other>cardinality(v_ids) then raise exception 'Cannot move further'; end if;
  v_id:=v_ids[v_other]; v_ids[v_other]:=p_milestone; v_ids[v_index]:=v_id;
  -- One atomic update; no sentinel position or compensating partial writes.
  -- Deterministically repairs legacy ties/gaps only in this explicitly reordered project.
  update public.milestones m set position=(s.ordinality-1)::integer
   from unnest(v_ids) with ordinality s(id,ordinality) where m.id=s.id and m.project_id=v_project;
 end if;
 return p_milestone;
end;$$;
revoke all on function public.mutate_project_milestone(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_project_milestone(text,uuid,uuid,jsonb) to service_role;

-- Scalar JSON is not truncated by the PostgREST table-row ceiling. Children are
-- explicitly paginated in SQL; aggregates and both pages share one statement snapshot.
create function public.project_detail_page(p_project uuid,p_milestones integer default 1,p_files integer default 1)
returns jsonb language sql stable security definer set search_path='' as $$
 with counts as (
  select (select count(*) from public.milestones where project_id=p_project) mt,
   (select count(*) from public.milestones where project_id=p_project and status='done') md,
   (select count(*) from public.files where project_id=p_project and kind='deliverable') ft
 ), pages as (
  select *,greatest(1,least(coalesce(p_milestones,1),ceil(mt/25.0)::integer)) mp,
   greatest(1,least(coalesce(p_files,1),ceil(ft/25.0)::integer)) fp from counts
 )
 select jsonb_build_object('project',(to_jsonb(p)-'created_at')||jsonb_build_object(
  'client_name',pr.full_name,'client_email',coalesce(u.email,''),'milestone_total',c.mt,'milestone_done',c.md,'file_count',c.ft),
  'milestonePage',c.mp,'filePage',c.fp,'pageSize',25,
  'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.position,m.id) from
   (select id,project_id,title,amount_cents,currency,position,status from public.milestones where project_id=p_project order by position,id limit 25 offset (c.mp-1)*25) m),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at,f.id) from
   (select id,bucket,r2_key,kind,ticket_id,project_id,filename,mime,size_bytes,created_at,uploaded_by from public.files where project_id=p_project and kind='deliverable' order by created_at,id limit 25 offset (c.fp-1)*25) f),'[]'::jsonb))
 from public.projects p join public.profiles pr on pr.id=p.client_id join auth.users u on u.id=p.client_id cross join pages c where p.id=p_project;
$$;
revoke all on function public.project_detail_page(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.project_detail_page(uuid,integer,integer) to service_role;
create index if not exists files_project_detail_page_idx on public.files(project_id,created_at,id) where kind='deliverable';
create index if not exists milestones_project_detail_page_idx on public.milestones(project_id,position,id);
