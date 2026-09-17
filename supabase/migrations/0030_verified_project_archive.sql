-- Additive archive transition; no production execution or existing data rewrite.
create function public.mark_project_archived(p_project uuid,p_expected jsonb,p_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_expected is null or p_key is null or p_key !~ ('^archive/project_'||p_project::text||'/verified_[0-9a-f-]{36}\.zip$') then raise exception 'Invalid archive proof';end if;
 perform 1 from public.projects where id=p_project and archived_at is null for update;
 if not found then raise exception 'Project unavailable';end if;
 perform 1 from public.milestones where project_id=p_project order by id for update;
 perform 1 from public.files where project_id=p_project order by id for update;
 if public.project_cleanup_snapshot(p_project) is distinct from p_expected then raise exception 'Project changed during archive';end if;
 update public.projects set archived_at=clock_timestamp(),archive_key=p_key where id=p_project;
end;$$;
revoke all on function public.mark_project_archived(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.mark_project_archived(uuid,jsonb,text) to service_role;
