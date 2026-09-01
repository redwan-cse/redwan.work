-- 0011_invoice_payment_integrity.sql

-- Clients may read only invoices that have left the draft workflow. The
-- service-role client remains unaffected by these policies.
drop policy if exists "invoices_select_own_or_admin" on public.invoices;
drop policy if exists "invoice_items_select_own_or_admin" on public.invoice_items;
drop policy if exists "payments_select_own_or_admin" on public.payments;
drop policy if exists "payments_insert_own_sent" on public.payments;

create policy "invoices_select_own_or_admin" on public.invoices for select using (
  public.is_admin() or (status in ('sent', 'paid', 'void') and exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid()
  ))
);
create policy "invoice_items_select_own_or_admin" on public.invoice_items for select using (
  public.is_admin() or exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and i.status in ('sent', 'paid', 'void') and p.client_id = auth.uid()
  )
);
create policy "payments_select_own_or_admin" on public.payments for select using (
  public.is_admin() or exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and i.status in ('sent', 'paid', 'void') and p.client_id = auth.uid()
  )
);

-- Payment identity and accounting fields are immutable. Status changes are
-- accepted only while one of the controlled service-role RPCs is running.
create or replace function public.guard_payment_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.invoice_id is distinct from old.invoice_id or
    new.method is distinct from old.method or
    new.reference is distinct from old.reference or
    new.amount_cents is distinct from old.amount_cents
  ) then
    raise exception 'Payment accounting fields are immutable';
  end if;
  if tg_op = 'UPDATE' and (
    new.confirmed_by is distinct from old.confirmed_by or
    new.confirmed_at is distinct from old.confirmed_at
  ) and coalesce(current_setting('app.invoice_payment_transition', true), '') <> 'admin' then
    raise exception 'Payment metadata must be changed through the payment action';
  end if;
  if tg_op = 'INSERT' and coalesce(current_setting('app.invoice_payment_transition', true), '') <> 'submit' then
    raise exception 'Payments must be submitted through the payment action';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and coalesce(current_setting('app.invoice_payment_transition', true), '') <> 'admin' then
    raise exception 'Payment status must be changed through the payment action';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_integrity_guard on public.payments;
create trigger payment_integrity_guard
  before insert or update on public.payments
  for each row execute function public.guard_payment_integrity();

alter table public.invoice_items
  add constraint invoice_items_qty_bound check (qty <= 1000000),
  add constraint invoice_items_unit_price_bound check (unit_price_cents <= 1000000000),
  add constraint invoice_items_qty_precision check (qty = round(qty, 3)),
  add constraint invoice_items_line_total_bound check (round(qty * unit_price_cents) <= 9007199254740991);

create or replace function public.reject_invoice_payment_atomic(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_invoice_id uuid;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment is no longer pending'; end if;
  perform 1 from public.invoices where id = v_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not exists (select 1 from public.payments where id = p_payment_id and status = 'submitted') then
    raise exception 'Payment is no longer pending';
  end if;
  perform set_config('app.invoice_payment_transition', 'admin', true);
  update public.payments set status = 'rejected' where id = p_payment_id;
end;
$$;

-- Replace the existing confirmation function so its status update passes the
-- payment integrity trigger only inside this locked transaction.
create or replace function public.confirm_invoice_payment_atomic(p_payment_id uuid, p_confirmed_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments%rowtype; v_invoice public.invoices%rowtype; v_invoice_id uuid; v_total bigint; v_confirmed bigint;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment is no longer pending'; end if;
  select * into v_invoice from public.invoices where id = v_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'submitted' then raise exception 'Payment is no longer pending'; end if;
  v_total := public.invoice_total_cents(v_invoice.id);
  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed from public.payments where invoice_id = v_invoice.id and status = 'confirmed';
  if v_confirmed + v_payment.amount_cents > v_total then raise exception 'Payment exceeds invoice total'; end if;
  perform set_config('app.invoice_payment_transition', 'admin', true);
  update public.payments set status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now() where id = v_payment.id;
  perform public.recompute_invoice_status(v_invoice.id);
end;
$$;

create or replace function public.submit_invoice_payment_atomic(p_invoice_id uuid, p_client_id uuid, p_method public.payment_method, p_reference text, p_amount_cents integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_total bigint; v_reserved bigint; v_payment_id uuid;
begin
  select i.* into v_invoice from public.invoices i join public.projects p on p.id = i.project_id where i.id = p_invoice_id and p.client_id = p_client_id and i.status = 'sent' for update of i;
  if not found then raise exception 'Invoice not found'; end if;
  if p_method is null or p_amount_cents is null or p_amount_cents <= 0 or p_reference is null or char_length(btrim(p_reference)) not between 1 and 200 then raise exception 'Invalid payment'; end if;
  v_total := public.invoice_total_cents(v_invoice.id);
  select coalesce(sum(amount_cents), 0)::bigint into v_reserved from public.payments where invoice_id = v_invoice.id and status in ('submitted', 'confirmed');
  if v_reserved + p_amount_cents > v_total then raise exception 'Payment exceeds invoice balance'; end if;
  perform set_config('app.invoice_payment_transition', 'submit', true);
  insert into public.payments (invoice_id, method, reference, amount_cents, status) values (v_invoice.id, p_method, btrim(p_reference), p_amount_cents, 'submitted') returning id into v_payment_id;
  return v_payment_id;
end;
$$;

revoke all on function public.reject_invoice_payment_atomic(uuid) from public, anon, authenticated;
grant execute on function public.reject_invoice_payment_atomic(uuid) to service_role;
revoke all on function public.confirm_invoice_payment_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_invoice_payment_atomic(uuid, uuid) to service_role;
revoke all on function public.submit_invoice_payment_atomic(uuid, uuid, public.payment_method, text, integer) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment_atomic(uuid, uuid, public.payment_method, text, integer) to service_role;
