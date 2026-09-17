-- OPERATOR-ONLY, OPT-IN. Not an automatic migration. No production activation.
-- Requires approved backup/restore and schema/app readiness before hosted use.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
create schema if not exists app_scheduler;
revoke all on schema app_scheduler from public,anon,authenticated,service_role;

create or replace function app_scheduler.invoke_email_outbox()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_secret text;v_count integer;v_request bigint;
begin
 select count(*),min(decrypted_secret) into v_count,v_secret
 from vault.decrypted_secrets where name='redwan_email_outbox_cron_secret';
 if v_count<>1 or v_secret is null or length(v_secret)<32 or length(v_secret)>512 or v_secret ~ '[[:space:][:cntrl:]]' then
  raise exception 'Outbox scheduler credential unavailable';
 end if;
 -- Fixed destination prevents a configurable URL from exfiltrating the credential.
 select net.http_get(
  url:='https://redwan.work/api/cron/email-outbox',
  headers:=jsonb_build_object('Authorization','Bearer '||v_secret,'Accept','application/json'),
  timeout_milliseconds:=60000
 ) into v_request;
 return v_request;
end;$$;
revoke all on function app_scheduler.invoke_email_outbox() from public,anon,authenticated,service_role;

-- Serialize installer runs. Refuse to overwrite an unrelated job with this name.
do $$
declare v_id bigint;v_count integer;v_command text;
begin
 perform pg_advisory_xact_lock(71635001);
 select count(*),min(jobid),min(command) into v_count,v_id,v_command from cron.job where jobname='redwan-email-outbox';
 if v_count>1 or (v_count=1 and v_command is distinct from 'select app_scheduler.invoke_email_outbox();') then raise exception 'Outbox scheduler job conflict';end if;
 if v_count=0 then
  select cron.schedule('redwan-email-outbox','*/5 * * * *','select app_scheduler.invoke_email_outbox();') into v_id;
 end if;
 -- Installation/reinstallation always leaves the job disabled at commit.
 perform cron.alter_job(v_id,schedule:='*/5 * * * *',active:=false);
end;$$;
commit;
