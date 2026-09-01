-- 0008_invoice_payment_hardening.sql

-- These helpers are used by owned triggers, but must not be exposed as public
-- RPCs because they read or mutate financial records with definer privileges.
revoke execute on function public.invoice_total_cents(uuid) from public;
revoke execute on function public.invoice_total_cents(uuid) from anon;
revoke execute on function public.invoice_total_cents(uuid) from authenticated;
grant execute on function public.invoice_total_cents(uuid) to service_role;

revoke execute on function public.recompute_invoice_status(uuid) from public;
revoke execute on function public.recompute_invoice_status(uuid) from anon;
revoke execute on function public.recompute_invoice_status(uuid) from authenticated;
grant execute on function public.recompute_invoice_status(uuid) to service_role;

create or replace function public.handle_payment_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed'::public.payment_status then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  else
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

drop trigger invoice_item_lock on public.invoice_items;

create or replace function public.guard_invoice_item_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_invoice_id uuid := case when tg_op = 'INSERT' then new.invoice_id else old.invoice_id end;
  v_status public.invoice_status;
begin
  select status into v_status
    from public.invoices
    where id = v_invoice_id;

  -- ON DELETE CASCADE removes the parent before its child rows. A direct item
  -- delete still sees its parent and remains locked outside draft state.
  if tg_op = 'DELETE' and not found then
    return old;
  end if;

  if v_status <> 'draft'::public.invoice_status then
    raise exception 'Only draft invoices can change items';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger invoice_item_lock
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_item_lock();
