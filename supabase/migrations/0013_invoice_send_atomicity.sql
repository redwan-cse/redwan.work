-- 0013_invoice_send_atomicity.sql

create or replace function public.send_invoice_atomic(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_total bigint;
begin
  select * into v_invoice
    from public.invoices
    where id = p_invoice_id
    for update;
  if not found or v_invoice.status <> 'draft'::public.invoice_status then
    raise exception 'Only draft invoices can be sent';
  end if;

  -- The invoice lock makes this item check and lifecycle transition one operation.
  if not exists (select 1 from public.invoice_items where invoice_id = v_invoice.id) then
    raise exception 'Invoice must have at least one item';
  end if;
  v_total := public.invoice_total_cents(v_invoice.id);
  if v_total <= 0 then
    raise exception 'Invoice must have a positive total';
  end if;

  update public.invoices
    set status = 'sent'::public.invoice_status,
        issued_at = now()
    where id = v_invoice.id;
end;
$$;

create or replace function public.confirm_invoice_payment_atomic(p_payment_id uuid, p_confirmed_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_invoice_id uuid;
  v_total bigint;
  v_confirmed bigint;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment is no longer pending'; end if;
  select * into v_invoice from public.invoices where id = v_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status <> 'sent'::public.invoice_status then
    raise exception 'Payment transition is not allowed';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'submitted'::public.payment_status then
    raise exception 'Payment is no longer pending';
  end if;
  v_total := public.invoice_total_cents(v_invoice.id);
  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed
    from public.payments where invoice_id = v_invoice.id and status = 'confirmed'::public.payment_status;
  if v_confirmed + v_payment.amount_cents > v_total then
    raise exception 'Payment exceeds invoice total';
  end if;
  perform set_config('app.invoice_payment_transition', 'admin', true);
  update public.payments
    set status = 'confirmed'::public.payment_status,
        confirmed_by = p_confirmed_by,
        confirmed_at = now()
    where id = v_payment.id;
  perform public.recompute_invoice_status(v_invoice.id);
end;
$$;

create or replace function public.reject_invoice_payment_atomic(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_status public.invoice_status;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment is no longer pending'; end if;
  select status into v_status from public.invoices where id = v_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_status <> 'sent'::public.invoice_status then
    raise exception 'Payment transition is not allowed';
  end if;
  if not exists (select 1 from public.payments where id = p_payment_id and status = 'submitted'::public.payment_status) then
    raise exception 'Payment is no longer pending';
  end if;
  perform set_config('app.invoice_payment_transition', 'admin', true);
  update public.payments set status = 'rejected'::public.payment_status where id = p_payment_id;
end;
$$;

revoke all on function public.send_invoice_atomic(uuid) from public, anon, authenticated;
grant execute on function public.send_invoice_atomic(uuid) to service_role;
revoke all on function public.confirm_invoice_payment_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_invoice_payment_atomic(uuid, uuid) to service_role;
revoke all on function public.reject_invoice_payment_atomic(uuid) from public, anon, authenticated;
grant execute on function public.reject_invoice_payment_atomic(uuid) to service_role;
