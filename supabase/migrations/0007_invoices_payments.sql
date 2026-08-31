-- 0007_invoices_payments.sql
create sequence public.invoice_number_seq start 1000;
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.payment_method as enum ('bank', 'bkash', 'paypal', 'other');
create type public.payment_status as enum ('submitted', 'confirmed', 'rejected');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  number int not null default nextval('public.invoice_number_seq'),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status public.invoice_status not null default 'draft',
  issued_at timestamptz,
  due_at date,
  payment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  qty numeric(12, 3) not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  method public.payment_method not null,
  reference text not null check (char_length(btrim(reference)) between 1 and 200),
  amount_cents int not null check (amount_cents > 0),
  status public.payment_status not null default 'submitted',
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index invoices_project_idx on public.invoices (project_id, created_at desc);
create index invoices_status_idx on public.invoices (status, due_at);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);
create index payments_invoice_idx on public.payments (invoice_id, created_at desc);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy "invoices_select_own_or_admin" on public.invoices for select using (
  public.is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid()
  )
);
create policy "invoice_items_select_own_or_admin" on public.invoice_items for select using (
  public.is_admin() or exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and p.client_id = auth.uid()
  )
);
create policy "payments_select_own_or_admin" on public.payments for select using (
  public.is_admin() or exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and p.client_id = auth.uid()
  )
);
create policy "payments_insert_own_sent" on public.payments for insert with check (
  status = 'submitted' and exists (
    select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.id = invoice_id and i.status = 'sent' and p.client_id = auth.uid()
  )
);

-- Admin reads and writes are intentionally explicit even though the application
-- uses the service-role client for mutations. These policies preserve the RLS
-- contract if an authenticated admin query path is added later.
create policy "invoices_admin_all" on public.invoices for all
  using (public.is_admin()) with check (public.is_admin());
create policy "invoice_items_admin_all" on public.invoice_items for all
  using (public.is_admin()) with check (public.is_admin());
create policy "payments_admin_all" on public.payments for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.invoice_total_cents(p_invoice_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(round(ii.qty * ii.unit_price_cents)), 0)::bigint
  from public.invoice_items ii
  where ii.invoice_id = p_invoice_id
$$;

create or replace function public.recompute_invoice_status(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
  v_confirmed bigint;
begin
  select public.invoice_total_cents(p_invoice_id) into v_total;
  select coalesce(sum(amount_cents), 0)::bigint into v_confirmed
    from public.payments where invoice_id = p_invoice_id and status = 'confirmed';
  update public.invoices
    set status = 'paid'::public.invoice_status, updated_at = now()
    where id = p_invoice_id and status = 'sent'::public.invoice_status
      and v_total > 0 and v_confirmed >= v_total;
end;
$$;

create or replace function public.handle_payment_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed'::public.payment_status then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.status = 'rejected'::public.payment_status then
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

create trigger payment_status_normalize
  before insert or update of status on public.payments
  for each row execute function public.handle_payment_status_change();

-- Recompute after the payment row is visible to invoice_total_cents().
create or replace function public.recompute_after_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_invoice_status(new.invoice_id);
  return new;
end;
$$;

create trigger payment_status_recompute
  after insert or update of status on public.payments
  for each row execute function public.recompute_after_payment_change();

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
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoice_lock before update on public.invoices
  for each row execute function public.guard_invoice_lock();

create or replace function public.guard_invoice_item_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.invoice_status;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.invoices where id = old.invoice_id;
  if v_status <> 'draft'::public.invoice_status then
    raise exception 'Only draft invoices can change items';
  end if;
  return new;
end;
$$;

create trigger invoice_item_lock before update or delete on public.invoice_items
  for each row execute function public.guard_invoice_item_lock();
