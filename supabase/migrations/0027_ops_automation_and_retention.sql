-- =============================================================================
-- Migration 0027: Daily CRM Automation, Overdue Retainer Renewal & Cron Hooks
-- =============================================================================

create or replace function public.run_daily_crm_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_overdue int := 0;
  v_expired_proposals int := 0;
  v_auto_accepted int := 0;
  v_renewed_retainers int := 0;
  v_ret record;
begin
  v_overdue := public.mark_overdue_invoices_atomic();

  update public.proposals
     set status = 'expired'
   where status in ('sent', 'viewed')
     and valid_until is not null
     and valid_until < current_date;
  get diagnostics v_expired_proposals = row_count;

  v_auto_accepted := public.run_auto_accept_deliverables();

  for v_ret in
    select id
      from public.retainer_plans
     where status = 'active'
       and next_invoice_date <= current_date
  loop
    perform public.renew_retainer_cycle_atomic(v_ret.id, null);
    v_renewed_retainers := v_renewed_retainers + 1;
  end loop;

  return jsonb_build_object(
    'overdue_invoices', v_overdue,
    'expired_proposals', v_expired_proposals,
    'auto_accepted_deliverables', v_auto_accepted,
    'renewed_retainers', v_renewed_retainers
  );
end;
$$;

revoke all on function public.run_daily_crm_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_crm_maintenance() to service_role;

-- Schedule daily maintenance in PostgreSQL when pg_cron extension is installed.
-- Wrapped in EXCEPTION block so isolated test engines (e.g., PGlite) initialize cleanly.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'daily_crm_maintenance'
    ) then
      perform cron.schedule(
        'daily_crm_maintenance',
        '5 1 * * *',
        'select public.run_daily_crm_maintenance();'
      );
    end if;
  end if;
exception
  when others then
    null;
end;
$$;
