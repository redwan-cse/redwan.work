-- Preserve all financial history. An oversized interactive detail refuses rather
-- than silently calculating from a truncated REST page; no stored row is removed.
create function public.invoice_contents_snapshot(p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items bigint;v_payments bigint;
begin
 if not exists(select 1 from public.invoices where id=p_invoice) then raise exception 'Invoice unavailable';end if;
 select count(*) into v_items from public.invoice_items where invoice_id=p_invoice;
 select count(*) into v_payments from public.payments where invoice_id=p_invoice;
 if v_items>10000 or v_payments>10000 then raise exception 'Invoice detail requires paginated export';end if;
 return jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invoice_id',invoice_id,'description',description,'qty',qty,'unit_price_cents',unit_price_cents,'position',position) order by position,id) from public.invoice_items where invoice_id=p_invoice),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invoice_id',invoice_id,'method',method,'reference',reference,'amount_cents',amount_cents,'status',status,'confirmed_by',confirmed_by,'confirmed_at',confirmed_at,'created_at',created_at) order by created_at,id) from public.payments where invoice_id=p_invoice),'[]'::jsonb));
end;$$;
revoke all on function public.invoice_contents_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.invoice_contents_snapshot(uuid) to service_role;
