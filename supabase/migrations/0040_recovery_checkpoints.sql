-- Approved resumable restore work. No staging or backup purge is activated.
-- Exact planned keys remain queryable for repair/cleanup review after failures.
alter table public.recovery_imports add column object_plan jsonb,add column completed_files jsonb not null default '[]'::jsonb;
create function public.plan_recovery_objects(p_actor uuid,p_id uuid,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.recovery_imports%rowtype;f jsonb;
begin
 perform public.require_recovery_admin(p_actor);
 select * into v from public.recovery_imports where id=p_id and actor=p_actor for update;
 if not found or v.sha256 is null or v.created_at<now()-interval '24 hours' then raise exception 'Import unavailable';end if;
 if p_plan is null or jsonb_typeof(p_plan->'files') is distinct from 'array' or jsonb_array_length(p_plan->'files')>2000 then raise exception 'Invalid plan';end if;
 for f in select value from jsonb_array_elements(p_plan->'files') loop
  if f->>'key' is null or f->>'key' !~ '^private/[0-9a-f-]{36}/(ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|docx|doc|xlsx|png|jpg|zip)$' then raise exception 'Invalid planned key';end if;
 end loop;
 if v.object_plan is not null and v.object_plan is distinct from p_plan then raise exception 'Restore target changed';end if;
 update public.recovery_imports set object_plan=p_plan where id=p_id returning * into v;return to_jsonb(v);
end;$$;
create function public.checkpoint_recovery_object(p_actor uuid,p_id uuid,p_source_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v public.recovery_imports%rowtype;k text;
begin
 perform public.require_recovery_admin(p_actor);
 select * into v from public.recovery_imports where id=p_id and actor=p_actor for update;
 if not found or v.object_plan is null or v.created_at<now()-interval '24 hours' then raise exception 'Import unavailable';end if;
 select value->>'key' into k from jsonb_array_elements(v.object_plan->'files') where value->>'source_id'=p_source_id::text;
 if k is null or not exists(select 1 from public.immutable_uploads where r2_key=k) then raise exception 'Verified restore object required';end if;
 if not v.completed_files @> jsonb_build_array(p_source_id::text) then update public.recovery_imports set completed_files=completed_files||jsonb_build_array(p_source_id::text) where id=p_id;end if;
 return true;
end;$$;
revoke all on function public.plan_recovery_objects(uuid,uuid,jsonb),public.checkpoint_recovery_object(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_recovery_objects(uuid,uuid,jsonb),public.checkpoint_recovery_object(uuid,uuid,uuid) to service_role;
