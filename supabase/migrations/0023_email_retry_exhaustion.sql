-- A worker that crashes on its final lease must become visibly failed, not stuck.
create or replace function public.claim_email_event()
returns setof public.email_outbox language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 update public.email_outbox set state='failed',error_code=case when attempts>=5 then 'attempts_exhausted' else 'retry_horizon_exceeded' end,updated_at=now()
 where state in('pending','processing') and (lease_until is null or lease_until<now()) and (attempts>=5 or first_attempt_at<now()-interval '23 hours');
 select id into v_id from public.email_outbox
 where state in('pending','processing') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and attempts<5
 order by created_at,id for update skip locked limit 1;
 if not found then return;end if;
 return query update public.email_outbox set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() where id=v_id returning *;
end;$$;
revoke all on function public.claim_email_event() from public,anon,authenticated;
grant execute on function public.claim_email_event() to service_role;
