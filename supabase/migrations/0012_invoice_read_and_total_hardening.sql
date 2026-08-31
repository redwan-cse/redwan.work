-- 0012_invoice_read_and_total_hardening.sql

-- Keep the database calculation bounded before converting its aggregate to bigint.
create or replace function public.invoice_total_cents(p_invoice_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_total numeric;
begin
  select coalesce(sum(round(ii.qty * ii.unit_price_cents)), 0) into v_total
    from public.invoice_items ii where ii.invoice_id = p_invoice_id;
  if v_total > 9007199254740991 then raise exception 'Invoice total exceeds supported limit'; end if;
  return v_total::bigint;
end;
$$;
revoke all on function public.invoice_total_cents(uuid) from public, anon, authenticated;
grant execute on function public.invoice_total_cents(uuid) to service_role;

create or replace function public.guard_invoice_total_bound()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.invoice_total_cents(case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end);
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    perform public.invoice_total_cents(old.invoice_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists invoice_total_bound on public.invoice_items;
create constraint trigger invoice_total_bound
  after insert or update or delete on public.invoice_items
  deferrable initially immediate
  for each row execute function public.guard_invoice_total_bound();
