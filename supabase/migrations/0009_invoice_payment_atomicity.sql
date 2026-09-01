-- 0009_invoice_payment_atomicity.sql

create or replace function public.confirm_invoice_payment_atomic(
  p_payment_id uuid,
  p_confirmed_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_payment_amount bigint;
  v_total bigint;
  v_confirmed bigint;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment is no longer pending'; end if;

  -- All payment transitions for an invoice serialize on this row.
  perform 1 from public.invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  select amount_cents into v_payment_amount
    from public.payments
    where id = p_payment_id and status = 'submitted'::public.payment_status
    for update;
  if not found then
    raise exception 'Payment is no longer pending';
  end if;

  select public.invoice_total_cents(v_invoice_id) into v_total;
  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed
    from public.payments
    where invoice_id = v_invoice_id and status = 'confirmed'::public.payment_status;
  if v_confirmed + v_payment_amount > v_total then
    raise exception 'Payment exceeds invoice total';
  end if;

  update public.payments
    set status = 'confirmed'::public.payment_status,
        confirmed_by = p_confirmed_by,
        confirmed_at = now()
    where id = p_payment_id;
  perform public.recompute_invoice_status(v_invoice_id);
end;
$$;

create or replace function public.submit_invoice_payment_atomic(
  p_invoice_id uuid,
  p_client_id uuid,
  p_method public.payment_method,
  p_reference text,
  p_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_client_id uuid;
  v_status public.invoice_status;
  v_total bigint;
  v_reserved bigint;
  v_payment_id uuid;
begin
  select i.status, p.client_id into v_status, v_project_client_id
    from public.invoices i
    join public.projects p on p.id = i.project_id
    where i.id = p_invoice_id
    for update of i;
  if not found or v_project_client_id <> p_client_id or v_status <> 'sent'::public.invoice_status then
    raise exception 'Invoice payment submission is not allowed';
  end if;
  if p_method is null
     or p_amount_cents is null
     or p_amount_cents <= 0
     or p_reference is null
     or char_length(btrim(p_reference)) not between 1 and 200 then
    raise exception 'Invalid payment';
  end if;

  select public.invoice_total_cents(p_invoice_id) into v_total;
  select coalesce(sum(amount_cents), 0)::bigint into v_reserved
    from public.payments
    where invoice_id = p_invoice_id
      and status in ('submitted'::public.payment_status, 'confirmed'::public.payment_status);
  if v_reserved + p_amount_cents > v_total then
    raise exception 'Payment exceeds invoice balance';
  end if;

  insert into public.payments (invoice_id, method, reference, amount_cents, status)
    values (p_invoice_id, p_method, btrim(p_reference), p_amount_cents, 'submitted'::public.payment_status)
    returning id into v_payment_id;
  return v_payment_id;
end;
$$;

revoke execute on function public.confirm_invoice_payment_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_invoice_payment_atomic(uuid, uuid) to service_role;
revoke execute on function public.submit_invoice_payment_atomic(uuid, uuid, public.payment_method, text, integer) from public, anon, authenticated;
grant execute on function public.submit_invoice_payment_atomic(uuid, uuid, public.payment_method, text, integer) to service_role;
