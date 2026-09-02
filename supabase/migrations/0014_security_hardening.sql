-- 0014_security_hardening.sql
-- Phase 5a hardening. Closes the direct SQL write bypasses for tickets,
-- invoices, and payments so the service-role RPC surface is the only mutation
-- path, and resolves the 0006 pending-attachment CHECK contradiction.

-- 1. Tickets and messages are created only by the service-role client after its
-- own session, cap, and validation checks. Authenticated clients had a direct
-- REST insert path that skipped the 24h cap and attachment accounting.
drop policy if exists "tickets_insert_own" on public.tickets;
drop policy if exists "ticket_messages_insert_own_in_own_ticket" on public.ticket_messages;

-- 2. The admin FOR ALL policies granted an authenticated admin token direct
-- INSERT/UPDATE/DELETE on financial rows, bypassing every invoice invariant.
-- Admin reads stay explicit; admin writes go through the atomic RPCs.
drop policy if exists "invoices_admin_all" on public.invoices;
drop policy if exists "invoice_items_admin_all" on public.invoice_items;
drop policy if exists "payments_admin_all" on public.payments;

create policy "invoices_admin_select" on public.invoices for select
  using (public.is_admin());
create policy "invoice_items_admin_select" on public.invoice_items for select
  using (public.is_admin());
create policy "payments_admin_select" on public.payments for select
  using (public.is_admin());

-- 3. status becomes a guarded column. Any status write must announce itself with
-- the transaction-local marker, which only the controlled RPCs below set. This
-- follows the app.invoice_payment_transition pattern from 0011/0013.
create or replace function public.guard_invoice_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'draft'::public.invoice_status and (
    new.project_id is distinct from old.project_id or
    new.number is distinct from old.number or
    new.currency is distinct from old.currency or
    new.issued_at is distinct from old.issued_at or
    new.due_at is distinct from old.due_at or
    new.payment_note is distinct from old.payment_note
  ) then
    raise exception 'Only draft invoices can change financial fields';
  end if;
  if old.status <> new.status
     and current_setting('app.invoice_status_transition', true) is distinct from 'on' then
    raise exception 'Invoice status changes must use the controlled transition path';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 4. The status-writing RPCs set the marker before their invoice UPDATE. Bodies
-- are otherwise byte-identical to their current definitions (0013 for send and
-- confirm, 0007 for recompute) so locking, validation, and privileges are
-- unchanged.
create or replace function public.recompute_invoice_status(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
  v_confirmed bigint;
begin
  select public.invoice_total_cents(p_invoice_id) into v_total;
  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed
    from public.payments where invoice_id = p_invoice_id and status = 'confirmed';
  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'paid'::public.invoice_status, updated_at = now()
    where id = p_invoice_id and status = 'sent'::public.invoice_status
      and v_total > 0 and v_confirmed >= v_total;
end;
$$;

create or replace function public.send_invoice_atomic(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'sent'::public.invoice_status,
        issued_at = now()
    where id = v_invoice.id;
end;
$$;

create or replace function public.confirm_invoice_payment_atomic(p_payment_id uuid, p_confirmed_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
  perform set_config('app.invoice_status_transition', 'on', true);
  update public.payments
    set status = 'confirmed'::public.payment_status,
        confirmed_by = p_confirmed_by,
        confirmed_at = now()
    where id = v_payment.id;
  perform public.recompute_invoice_status(v_invoice.id);
end;
$$;

-- The admin void action was the remaining direct status writer (a service-role
-- UPDATE in lib/crm/invoices.ts). It becomes a controlled transition so the
-- guard above has no exception carved out for it.
create or replace function public.void_invoice_atomic(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice
    from public.invoices
    where id = p_invoice_id
    for update;
  if not found or v_invoice.status <> 'sent'::public.invoice_status then
    raise exception 'Only sent invoices can be voided';
  end if;

  perform set_config('app.invoice_status_transition', 'on', true);
  update public.invoices
    set status = 'void'::public.invoice_status
    where id = v_invoice.id;
end;
$$;

-- 5. Confirmed payments are an audit record: never removable on their own. The
-- only legitimate removal is the ON DELETE CASCADE from a deleted invoice, which
-- announces itself with a transaction-local marker set before the cascade runs.
create or replace function public.guard_payment_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.invoice_payment_cascade', true), '') <> 'on' then
    raise exception 'Payments cannot be deleted';
  end if;
  return old;
end;
$$;

create or replace function public.mark_invoice_payment_cascade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.invoice_payment_cascade', 'on', true);
  return old;
end;
$$;

drop trigger if exists payment_delete_guard on public.payments;
create trigger payment_delete_guard
  before delete on public.payments
  for each row execute function public.guard_payment_delete();

drop trigger if exists invoice_delete_payment_cascade on public.invoices;
create trigger invoice_delete_payment_cascade
  before delete on public.invoices
  for each row execute function public.mark_invoice_payment_cascade();

-- 6. The 0006 attachment CHECK required ticket_id, which contradicted the
-- pending-upload path that intentionally stores a ticket-less row under a
-- private/<user>/pending/ key until the ticket exists.
alter table public.files drop constraint if exists files_check;
alter table public.files
  add constraint files_attachment_scope_check
  check (kind <> 'attachment' or ticket_id is not null or r2_key like '%/pending/%');

-- Privilege posture: definer functions touched or added here are reachable only
-- by the service-role client (or as owned triggers).
revoke all on function public.guard_invoice_lock() from public, anon, authenticated;
grant execute on function public.guard_invoice_lock() to service_role;
revoke all on function public.guard_payment_delete() from public, anon, authenticated;
grant execute on function public.guard_payment_delete() to service_role;
revoke all on function public.mark_invoice_payment_cascade() from public, anon, authenticated;
grant execute on function public.mark_invoice_payment_cascade() to service_role;
revoke all on function public.recompute_invoice_status(uuid) from public, anon, authenticated;
grant execute on function public.recompute_invoice_status(uuid) to service_role;
revoke all on function public.send_invoice_atomic(uuid) from public, anon, authenticated;
grant execute on function public.send_invoice_atomic(uuid) to service_role;
revoke all on function public.confirm_invoice_payment_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_invoice_payment_atomic(uuid, uuid) to service_role;
revoke all on function public.void_invoice_atomic(uuid) from public, anon, authenticated;
grant execute on function public.void_invoice_atomic(uuid) to service_role;
