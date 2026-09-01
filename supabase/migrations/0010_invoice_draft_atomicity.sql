-- 0010_invoice_draft_atomicity.sql
-- Atomic creation path for the admin draft builder. The application calls this
-- through the service-role client after its admin-session check.
create or replace function public.create_draft_invoice_with_items(
  p_project_id uuid,
  p_currency text,
  p_due_at date,
  p_payment_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_description text;
  v_qty numeric;
  v_unit_price_cents integer;
  v_position integer;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and status = 'active' and archived_at is null
  ) then
    raise exception 'Active project not found';
  end if;

  if p_currency is null or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Invalid invoice currency';
  end if;
  if p_payment_note is not null and char_length(btrim(p_payment_note)) > 5000 then
    raise exception 'Invalid payment note';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'Invoice must have at least one item';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'description')
      or not (v_item ? 'qty')
      or not (v_item ? 'unit_price_cents')
      or not (v_item ? 'position') then
      raise exception 'Invalid invoice item';
    end if;

    v_description := btrim(v_item->>'description');
    if char_length(v_description) not between 1 and 500 then
      raise exception 'Invalid invoice item description';
    end if;
    begin
      v_qty := (v_item->>'qty')::numeric;
      v_unit_price_cents := (v_item->>'unit_price_cents')::integer;
      v_position := (v_item->>'position')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid invoice item amount';
    end;
    if v_qty = 'NaN'::numeric or v_qty <= 0 or v_qty <> v_qty or v_unit_price_cents < 0 or v_position < 0
      or (v_item->>'unit_price_cents')::numeric <> trunc((v_item->>'unit_price_cents')::numeric)
      or (v_item->>'position')::numeric <> trunc((v_item->>'position')::numeric) then
      raise exception 'Invalid invoice item amount';
    end if;
  end loop;

  insert into public.invoices (project_id, currency, due_at, payment_note)
  values (p_project_id, upper(btrim(p_currency)), p_due_at, nullif(btrim(p_payment_note), ''))
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, description, qty, unit_price_cents, position)
  select v_invoice_id, btrim(item->>'description'), (item->>'qty')::numeric,
    (item->>'unit_price_cents')::integer, (item->>'position')::integer
  from jsonb_array_elements(p_items) as entries(item);

  return v_invoice_id;
end;
$$;

revoke all on function public.create_draft_invoice_with_items(uuid, text, date, text, jsonb) from public;
revoke all on function public.create_draft_invoice_with_items(uuid, text, date, text, jsonb) from anon;
revoke all on function public.create_draft_invoice_with_items(uuid, text, date, text, jsonb) from authenticated;
grant execute on function public.create_draft_invoice_with_items(uuid, text, date, text, jsonb) to service_role;
