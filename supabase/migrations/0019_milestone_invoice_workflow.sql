-- Additive provenance and idempotency for milestone-generated draft invoices.
create table public.milestone_invoices (
  milestone_id uuid primary key references public.milestones(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.milestone_invoices enable row level security;
revoke all on public.milestone_invoices from anon,authenticated;
grant all on public.milestone_invoices to service_role;
create function public.invoice_milestone_atomic(p_actor uuid,p_milestone uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_milestone public.milestones%rowtype;
  v_invoice uuid;
begin
  perform 1 from public.profiles where id=p_actor and role='admin' and is_active is true for share;
  if not found then raise exception 'Unauthorized'; end if;
  select project_id into v_project from public.milestones where id=p_milestone;
  if not found then raise exception 'Milestone not found'; end if;
  perform 1 from public.projects where id=v_project and status='active' and archived_at is null for update;
  if not found then raise exception 'Active project not found'; end if;
  select * into v_milestone from public.milestones where id=p_milestone and project_id=v_project for update;
  if not found then raise exception 'Milestone not found'; end if;
  select invoice_id into v_invoice from public.milestone_invoices where milestone_id=p_milestone;
  if found then return v_invoice; end if;
  if v_milestone.amount_cents<=0 then raise exception 'Milestone amount must be positive'; end if;
  v_invoice:=public.create_draft_invoice_with_items(v_project,v_milestone.currency::text,null,null,
    jsonb_build_array(jsonb_build_object('description',v_milestone.title,'qty',1,'unit_price_cents',v_milestone.amount_cents,'position',0)));
  insert into public.milestone_invoices(milestone_id,invoice_id,created_by) values(p_milestone,v_invoice,p_actor);
  return v_invoice;
end;
$$;
revoke all on function public.invoice_milestone_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.invoice_milestone_atomic(uuid,uuid) to service_role;
