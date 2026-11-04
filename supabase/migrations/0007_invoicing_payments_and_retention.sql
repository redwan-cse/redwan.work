-- 0007_invoicing_payments_and_retention.sql
-- Multi-Currency Invoicing (USD-normalized), Payment Proofs, Credit Notes, Cancellation Requests, Retainers & Reviews

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.invoice_num_seq') unique,
  code text generated always as ('INV-' || number::text) stored,
  client_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  milestone_id uuid references public.order_milestones (id) on delete set null,
  is_deposit_invoice boolean not null default false,
  status public.invoice_status not null default 'draft',
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_usd numeric(14, 6) not null default 1.000000 check (fx_rate_to_usd > 0),
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  tax_rate_bps int not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  amount_paid_cents int not null default 0 check (amount_paid_cents >= 0),
  credited_cents int not null default 0 check (credited_cents >= 0),
  issued_at timestamptz,
  due_at date,
  paid_at timestamptz,
  payment_instructions text,
  notes text,
  immutable_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_client_status_idx on public.invoices (client_id, status, created_at desc);
create index invoices_order_idx on public.invoices (order_id, created_at desc);
create index invoices_status_due_idx on public.invoices (status, due_at);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

create policy "invoices_select_own_or_admin"
  on public.invoices for select
  using (
    public.is_admin() or (
      client_id = auth.uid() and status <> 'draft'::public.invoice_status
    )
  );

create policy "invoices_admin_all"
  on public.invoices for all
  using (public.is_admin())
  with check (public.is_admin());

-- Guard financial fields once an invoice leaves 'draft'
create or replace function public.guard_invoice_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'::public.invoice_status and (
    new.client_id is distinct from old.client_id or
    new.order_id is distinct from old.order_id or
    new.number is distinct from old.number or
    new.currency is distinct from old.currency or
    new.subtotal_cents is distinct from old.subtotal_cents or
    new.discount_cents is distinct from old.discount_cents or
    new.tax_rate_bps is distinct from old.tax_rate_bps or
    new.tax_cents is distinct from old.tax_cents or
    new.total_cents is distinct from old.total_cents
  ) then
    raise exception 'Issued invoices cannot modify financial totals or currency.';
  end if;
  return new;
end;
$$;

create trigger invoices_guard_immutable
  before update on public.invoices
  for each row execute function public.guard_invoice_immutable_fields();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  qty numeric(12, 3) not null default 1 check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  line_total_cents int generated always as (round(qty * unit_price_cents)::int) stored,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

alter table public.invoice_items enable row level security;

create policy "invoice_items_select_via_invoice"
  on public.invoice_items for select
  using (
    public.is_admin() or exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.client_id = auth.uid() and i.status <> 'draft'::public.invoice_status
    )
  );

create policy "invoice_items_admin_all"
  on public.invoice_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Payments (PAY-1001) with USD FX normalization (Amendment C1 & C2)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.payment_num_seq') unique,
  code text generated always as ('PAY-' || number::text) stored,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  client_id uuid not null references public.profiles (id) on delete restrict,
  method public.payment_method not null,
  reference text not null check (char_length(btrim(reference)) between 1 and 200),
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_usd numeric(14, 6) not null default 1.000000 check (fx_rate_to_usd > 0),
  usd_equivalent_cents bigint generated always as (round(amount_cents * fx_rate_to_usd)::bigint) stored,
  proof_file_id uuid references public.vault_files (id) on delete set null,
  status public.payment_status not null default 'submitted',
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz
);

create index payments_invoice_idx on public.payments (invoice_id, submitted_at desc);
create index payments_client_status_idx on public.payments (client_id, status, submitted_at desc);

alter table public.payments enable row level security;

create policy "payments_select_own_or_admin"
  on public.payments for select
  using (client_id = auth.uid() or public.is_admin());

create policy "payments_insert_own_issued_invoice"
  on public.payments for insert
  with check (
    client_id = auth.uid()
    and status = 'submitted'::public.payment_status
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.client_id = auth.uid()
        and i.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'overdue'::public.invoice_status)
    )
  );

create policy "payments_admin_all"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Credit Notes (CRN-1001) for audited refunds & partial credits (Amendment A4)
create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.credit_note_num_seq') unique,
  code text generated always as ('CRN-' || number::text) stored,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  client_id uuid not null references public.profiles (id) on delete restrict,
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_usd numeric(14, 6) not null default 1.000000 check (fx_rate_to_usd > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  issued_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index credit_notes_invoice_idx on public.credit_notes (invoice_id);

alter table public.credit_notes enable row level security;

create policy "credit_notes_select_own_or_admin"
  on public.credit_notes for select
  using (client_id = auth.uid() or public.is_admin());

create policy "credit_notes_admin_all"
  on public.credit_notes for all
  using (public.is_admin())
  with check (public.is_admin());

-- Order Cancellation & Dispute Requests (Amendment A4)
create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  resolution_notes text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index cancellation_requests_order_idx on public.cancellation_requests (order_id, status);

alter table public.cancellation_requests enable row level security;

create policy "cancellation_requests_select_own_or_admin"
  on public.cancellation_requests for select
  using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "cancellation_requests_insert_own"
  on public.cancellation_requests for insert
  with check (
    requested_by = auth.uid() and exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "cancellation_requests_admin_all"
  on public.cancellation_requests for all
  using (public.is_admin())
  with check (public.is_admin());

-- Recurring Retainer Plans (Long-Term Client Retention)
create table public.retainer_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  pillar public.service_pillar not null default 'cybersecurity',
  monthly_fee_cents int not null check (monthly_fee_cents > 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  hours_per_month numeric(6, 2) not null default 10 check (hours_per_month > 0),
  hours_used_current_period numeric(6, 2) not null default 0 check (hours_used_current_period >= 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  current_period_start date not null default current_date,
  current_period_end date not null default (current_date + 30),
  next_invoice_date date not null default (current_date + 30),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index retainer_plans_client_idx on public.retainer_plans (client_id, status);

create trigger retainer_plans_set_updated_at
  before update on public.retainer_plans
  for each row execute function public.set_updated_at();

alter table public.retainer_plans enable row level security;

create policy "retainer_plans_select_own_or_admin"
  on public.retainer_plans for select
  using (client_id = auth.uid() or public.is_admin());

create policy "retainer_plans_admin_all"
  on public.retainer_plans for all
  using (public.is_admin())
  with check (public.is_admin());

-- Verified Post-Order Client Reviews & Public Testimonials
create table public.client_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  rating_overall int not null check (rating_overall between 1 and 5),
  rating_communication int not null default 5 check (rating_communication between 1 and 5),
  rating_quality int not null default 5 check (rating_quality between 1 and 5),
  rating_timeliness int not null default 5 check (rating_timeliness between 1 and 5),
  headline text,
  review_text text not null check (char_length(btrim(review_text)) between 5 and 3000),
  is_public_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index client_reviews_public_idx on public.client_reviews (is_public_approved, created_at desc);

alter table public.client_reviews enable row level security;

create policy "client_reviews_select_public_own_or_admin"
  on public.client_reviews for select
  using (is_public_approved is true or client_id = auth.uid() or public.is_admin());

create policy "client_reviews_insert_own_completed_order"
  on public.client_reviews for insert
  with check (
    client_id = auth.uid() and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.client_id = auth.uid()
        and o.status = 'completed'::public.order_status
    )
  );

create policy "client_reviews_admin_all"
  on public.client_reviews for all
  using (public.is_admin())
  with check (public.is_admin());
