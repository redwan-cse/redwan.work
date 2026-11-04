-- 0005_orders_roe_execution_and_deliverables.sql
-- Orders, C|EH Rules of Engagement Authorizations, Requirements, Milestones, Tasks, Deliverables & R2 Vault

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.order_num_seq') unique,
  code text generated always as ('ORD-' || number::text) stored,
  client_id uuid not null references public.profiles (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,
  package_id uuid references public.service_packages (id) on delete set null,
  proposal_id uuid references public.proposals (id) on delete set null,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 250),
  description text,
  pillar public.service_pillar not null default 'cybersecurity',
  status public.order_status not null default 'awaiting_payment',
  priority public.order_priority not null default 'standard',
  pricing_model public.pricing_model not null default 'fixed_package',
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  deposit_percent int not null default 50 check (deposit_percent between 0 and 100),
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  revisions_included int not null default 2 check (revisions_included >= 0),
  revisions_used int not null default 0 check (revisions_used >= 0),
  auto_accept_days int not null default 3 check (auto_accept_days between 1 and 30),
  requires_roe boolean not null default false,
  roe_signed_at timestamptz,
  nda_required boolean not null default false,
  nda_accepted_at timestamptz,
  started_at timestamptz,
  due_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_client_status_idx on public.orders (client_id, status, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_pillar_idx on public.orders (pillar);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

create policy "orders_select_own_or_admin"
  on public.orders for select
  using (client_id = auth.uid() or public.is_admin());

create policy "orders_admin_all"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- C|EH Offensive Security Rules of Engagement & Target Ownership Attestation (Amendment B1)
create table public.engagement_authorizations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete restrict,
  authorized_targets text[] not null check (cardinality(authorized_targets) >= 1),
  excluded_systems text,
  testing_window_start timestamptz not null,
  testing_window_end timestamptz not null,
  emergency_contact_name text not null check (char_length(btrim(emergency_contact_name)) between 1 and 200),
  emergency_contact_phone text not null check (char_length(btrim(emergency_contact_phone)) between 3 and 60),
  ownership_attested boolean not null check (ownership_attested is true),
  signer_full_name text not null check (char_length(btrim(signer_full_name)) between 1 and 200),
  signer_title text,
  signer_ip_hash text,
  signed_at timestamptz not null default now(),
  check (testing_window_end > testing_window_start)
);

alter table public.engagement_authorizations enable row level security;

create policy "roe_select_own_or_admin"
  on public.engagement_authorizations for select
  using (client_id = auth.uid() or public.is_admin());

create policy "roe_insert_own_client"
  on public.engagement_authorizations for insert
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "roe_admin_all"
  on public.engagement_authorizations for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enforce Rules of Engagement before an order requiring RoE can enter 'in_progress'
create or replace function public.enforce_order_roe_before_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requires_roe is true and new.status = 'in_progress'::public.order_status then
    if not exists (
      select 1 from public.engagement_authorizations ea
      where ea.order_id = new.id and ea.ownership_attested is true
    ) then
      raise exception 'Signed Rules of Engagement (RoE) authorization is required before starting this security engagement.';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_roe
  before insert or update of status on public.orders
  for each row execute function public.enforce_order_roe_before_progress();

-- Order Requirements Intake
create table public.order_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  client_id uuid not null references public.profiles (id),
  responses jsonb not null default '{}'::jsonb,
  target_scope_notes text,
  access_instructions text,
  submitted_at timestamptz not null default now(),
  verified_by_admin_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger order_requirements_set_updated_at
  before update on public.order_requirements
  for each row execute function public.set_updated_at();

alter table public.order_requirements enable row level security;

create policy "order_requirements_select_own_or_admin"
  on public.order_requirements for select
  using (client_id = auth.uid() or public.is_admin());

create policy "order_requirements_insert_own"
  on public.order_requirements for insert
  with check (client_id = auth.uid());

create policy "order_requirements_update_own"
  on public.order_requirements for update
  using (client_id = auth.uid() and verified_by_admin_at is null);

create policy "order_requirements_admin_all"
  on public.order_requirements for all
  using (public.is_admin())
  with check (public.is_admin());

-- Order Milestones
create table public.order_milestones (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  weight_percent int not null default 25 check (weight_percent between 0 and 100),
  position int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'delivered', 'approved')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_milestones_order_idx on public.order_milestones (order_id, position);

alter table public.order_milestones enable row level security;

create policy "order_milestones_select_via_order"
  on public.order_milestones for select
  using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "order_milestones_admin_all"
  on public.order_milestones for all
  using (public.is_admin())
  with check (public.is_admin());

-- Order Execution Checklist Tasks
create table public.order_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  milestone_id uuid references public.order_milestones (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 250),
  is_client_visible boolean not null default true,
  is_completed boolean not null default false,
  position int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_tasks_order_idx on public.order_tasks (order_id, position);

alter table public.order_tasks enable row level security;

create policy "order_tasks_select_visible_or_admin"
  on public.order_tasks for select
  using (
    public.is_admin() or (
      is_client_visible is true and exists (
        select 1 from public.orders o
        where o.id = order_id and o.client_id = auth.uid()
      )
    )
  );

create policy "order_tasks_admin_all"
  on public.order_tasks for all
  using (public.is_admin())
  with check (public.is_admin());

-- Deliverables (DLV-1001) with auto-accept timer (Amendment A2)
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.deliverable_num_seq') unique,
  code text generated always as ('DLV-' || number::text) stored,
  order_id uuid not null references public.orders (id) on delete cascade,
  milestone_id uuid references public.order_milestones (id) on delete set null,
  version_label text not null default 'v1.0' check (char_length(btrim(version_label)) between 1 and 40),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  release_notes text,
  status public.deliverable_status not null default 'submitted',
  is_final_delivery boolean not null default true,
  auto_accept_at timestamptz,
  client_feedback text,
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz
);

create index deliverables_order_idx on public.deliverables (order_id, submitted_at desc);
create index deliverables_auto_accept_idx on public.deliverables (status, auto_accept_at) where status = 'submitted';

alter table public.deliverables enable row level security;

create policy "deliverables_select_via_order"
  on public.deliverables for select
  using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "deliverables_admin_all"
  on public.deliverables for all
  using (public.is_admin())
  with check (public.is_admin());

-- Unified R2 Vault Files Registry (Amendment B2: retention_until + download counters)
create table public.vault_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'private' check (bucket in ('public', 'private')),
  r2_key text not null unique,
  category text not null default 'deliverable' check (category in ('deliverable', 'order_attachment', 'ticket_attachment', 'payment_proof', 'public_asset')),
  owner_client_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete cascade,
  deliverable_id uuid references public.deliverables (id) on delete cascade,
  ticket_id uuid,
  invoice_id uuid,
  uploaded_by uuid not null references public.profiles (id),
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 128),
  size_bytes bigint not null check (size_bytes > 0),
  sha256_checksum text,
  download_count int not null default 0 check (download_count >= 0),
  last_downloaded_at timestamptz,
  retention_until timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index vault_files_owner_idx on public.vault_files (owner_client_id, created_at desc);
create index vault_files_order_idx on public.vault_files (order_id);
create index vault_files_deliverable_idx on public.vault_files (deliverable_id);
create index vault_files_retention_idx on public.vault_files (retention_until) where retention_until is not null and archived_at is null;

alter table public.vault_files enable row level security;

create policy "vault_files_select_own_or_admin"
  on public.vault_files for select
  using (
    public.is_admin()
    or bucket = 'public'
    or owner_client_id = auth.uid()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.client_id = auth.uid()
    )
  );

create policy "vault_files_admin_all"
  on public.vault_files for all
  using (public.is_admin())
  with check (public.is_admin());
