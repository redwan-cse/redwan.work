# Phase 4b - Invoices & Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invoice building, client invoice viewing, partial manual-payment submission, and admin payment confirmation with calculated balances and an immutable sent-invoice workflow.

**Architecture:** Invoice totals are calculated from `invoice_items` rather than duplicated in an editable total column. Draft financial fields are mutable; sending locks them at both the action and database-policy layers, while voiding preserves the record for audit and permits a replacement invoice. Multiple payments are supported: only the sum of confirmed payments reaching the calculated total changes an invoice to `paid`. All mutations use service-role server actions with role checks; RLS remains the data boundary.

**Tech Stack:** Next.js 16 App Router · React 19 server components and `useTransition` · Supabase Postgres enums, RLS, triggers, and service-role client · existing shadcn/ui primitives · browser print CSS. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§3 invoices/items/payments, §5 invoice panels, §8 P4b). Approved decisions 2026-08-31: dedicated `invoice_number_seq` displayed as `INV-<number>`; partial payments; draft-only editing with sent financial fields locked; no lifecycle email work until P5.

## Global Constraints

- Gate after every task: `npm run lint && npx tsc --noEmit && npm run build`.
- Branch: `feat/invoices-payments`; commits per task; no push/merge to `main` without explicit confirmation.
- Env names remain unchanged; no new environment variables; secrets never printed/logged/committed.
- RLS is the security boundary; every server action still verifies the current role before mutation.
- Never log invoice descriptions, payment references, customer emails, or other PII.
- All monetary values are integer cents in persistence and action boundaries. Decimal quantities are validated as positive finite values and multiplied in SQL/application using exact decimal-safe handling.
- Sent, paid, and void invoices cannot be edited through draft mutation paths. Paid and void records remain readable for audit.
- Clients can only submit payments for their own `sent` invoices; clients cannot change invoice, item, or payment status.
- No email notifications in P4b; Resend lifecycle API integration remains P5.
- Existing P4a project/file behavior, P3c ticket behavior, contact pipeline, and Blogger integration remain intact.
- No persistent probe fixtures: temporary clients, projects, invoices, and payments are deleted after probes, with cascade checks.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0007_invoices_payments.sql` | invoice/item/payment schema, RLS, amount constraints, status trigger |
| `lib/crm/invoices.ts` | service-role invoice queries, totals, draft mutations, payment operations |
| `lib/crm/admin-actions.ts` | admin invoice/item/payment action wrappers |
| `lib/crm/client-actions.ts` | client invoice/payment action wrappers |
| `app/(admin)/admin/layout.tsx` | enable Invoices navigation |
| `app/(admin)/admin/page.tsx` | real unpaid-invoice summary |
| `app/(admin)/admin/invoices/page.tsx` | filtered invoice list and new-invoice entry |
| `app/(admin)/admin/invoices/new/page.tsx` | draft invoice builder |
| `app/(admin)/admin/invoices/[id]/page.tsx` | admin invoice preview, send/void, payment decisions |
| `components/admin/invoice-forms.tsx` | client-side draft/item/payment controls |
| `app/(client)/portal/layout.tsx` | enable Invoices navigation |
| `app/(client)/portal/page.tsx` | real outstanding-invoice summary |
| `app/(client)/portal/invoices/page.tsx` | client invoice list |
| `app/(client)/portal/invoices/[id]/page.tsx` | client print-friendly detail and payment form |
| `components/portal/payment-form.tsx` | client payment submission form |
| `docs/invoices/README.md` | invoice/payment flows, RLS, probe matrix, operations notes |
| `docs/crm/README.md` | link P4b flow and update non-goals/probes |

---

### Task 1: Migration - invoices, items, payments, RLS, payment trigger

**Files:**
- Create: `supabase/migrations/0007_invoices_payments.sql`

**Interfaces:**
- Produces `invoice_status` enum `draft|sent|paid|void`, `payment_method` enum `bank|bkash|paypal|other`, and `payment_status` enum `submitted|confirmed|rejected`.
- Produces `public.invoices`, `public.invoice_items`, and `public.payments` with UUID keys and `timestamptz` defaults.
- Produces `public.invoice_total_cents(invoice_id uuid) -> bigint` and `public.recompute_invoice_status(invoice_id uuid) -> void` security-definer helpers.
- Produces RLS: clients SELECT only invoices/items/payments reachable through a project they own; clients INSERT only submitted payments for their own sent invoices; admins SELECT/INSERT/UPDATE all; no client UPDATE/DELETE policies.
- Produces a payment-status trigger that recalculates the parent invoice: `paid` only when confirmed payment cents are greater than or equal to calculated item total and the total is positive; otherwise a sent invoice remains sent.
- Database policies/functions reject updates to financial invoice/item fields after status leaves `draft`.

- [ ] **Step 1: Write the migration**

```sql
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
  perform public.recompute_invoice_status(new.invoice_id);
  return new;
end;
$$;

create trigger payment_status_normalize
  before insert or update of status on public.payments
  for each row execute function public.handle_payment_status_change();

-- The recomputation must run AFTER the row is visible to invoice_total_cents();
-- keeping it separate from normalization avoids a BEFORE-trigger off-by-one.
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
  select status into v_status from public.invoices where id = old.invoice_id;
  if v_status <> 'draft'::public.invoice_status then
    raise exception 'Only draft invoices can change items';
  end if;
  return new;
end;
$$;

create trigger invoice_item_lock before update or delete on public.invoice_items
  for each row execute function public.guard_invoice_item_lock();
```

- [ ] **Step 2: Apply and verify**

Run `npx supabase db push` and `npx supabase migration list`; expect 0007 local and remote. Verify with service-role SQL/REST:

```sql
select last_value from public.invoice_number_seq;
select typname from pg_type where typname in ('invoice_status','payment_method','payment_status');
select policyname, cmd from pg_policies where tablename in ('invoices','invoice_items','payments');
```

Create a temporary project/invoice with two items and payments: one confirmed partial must leave status `sent`; a second confirmed payment reaching total must set `paid`; a rejected payment must not affect totals. Attempt a sent-item update and expect the lock exception. Delete every temporary row and confirm cascade.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_invoices_payments.sql
git commit -m "feat(invoice): add invoices payments schema rls and partial-payment trigger"
```

---

### Task 2: Invoice service module and action contracts

**Files:**
- Create: `lib/crm/invoices.ts`
- Modify: `lib/crm/admin-actions.ts`
- Modify: `lib/crm/client-actions.ts`

**Interfaces:**
- `InvoiceStatus = 'draft'|'sent'|'paid'|'void'`; `PaymentMethod = 'bank'|'bkash'|'paypal'|'other'`; `PaymentStatus = 'submitted'|'confirmed'|'rejected'`.
- `InvoiceItemRow { id, invoice_id, description, qty, unit_price_cents, position }`.
- `PaymentRow { id, invoice_id, method, reference, amount_cents, status, confirmed_by, confirmed_at, created_at }`.
- `InvoiceRow { id, project_id, project_name, client_id, client_name, client_email, number, currency, status, issued_at, due_at, payment_note, total_cents, submitted_cents, confirmed_cents, outstanding_cents, created_at }`.
- `listInvoices(viewer: { userId: string; role: 'admin'|'client' }, status?: InvoiceStatus): Promise<InvoiceRow[]>` — admin all, client own; computed totals.
- `getInvoiceDetail(invoiceId, viewer): Promise<{ok:true; invoice; items; payments}|{ok:false;error}>` — ownership enforced before child queries.
- Admin functions: `createDraftInvoice`, `updateDraftInvoice`, `addInvoiceItem`, `updateInvoiceItem`, `deleteInvoiceItem`, `sendInvoice`, `voidInvoice`, `confirmPayment`, `rejectPayment`, `countUnpaidInvoices`.
- Client functions: `countOwnOutstandingInvoices`, `submitPayment(invoiceId, clientId, input: { method; reference; amount_cents }): Promise<CrmResult>`; validates sent status, ownership, positive amount, and amount not exceeding the current outstanding balance after both confirmed and already-submitted payments are reserved.
- Admin action wrappers use `requireAdmin()` and `revalidatePath`; client wrappers use `requireClient()` and `revalidatePath`; all payment decisions re-fetch server totals.

- [ ] **Step 1: Implement `lib/crm/invoices.ts`**

Use `getSupabaseAdmin()` only. Centralize `calculateAmounts(items, payments)` so UI and actions share the same semantics: `total_cents = round(qty * unit_price_cents)` per line; `submitted_cents = sum(status in submitted|confirmed)`; `confirmed_cents = sum(confirmed)`; `outstanding_cents = max(total - confirmed, 0)`. Never trust totals from form fields. Return generic domain errors for missing/locked/foreign records.

- [ ] **Step 2: Append admin actions**

Every action calls `requireAdmin()` first. Draft actions validate UUIDs, statuses, names, dates, integer cents, and `qty > 0`; send requires at least one item and total > 0, then sets `status='sent'` and `issued_at=now()`. `confirmPayment` only accepts `submitted` payments and rejects an amount that would make confirmed cents exceed total; `rejectPayment` only accepts submitted. Revalidate `/admin`, `/admin/invoices`, `/admin/invoices/[id]`, and the owning project path after mutations.

- [ ] **Step 3: Append client actions**

Every action calls `requireClient()` first. `submitPayment` validates method/reference/amount, re-fetches invoice ownership and current balance, refuses non-sent or over-balance submissions (including amounts already submitted but not confirmed), inserts `status='submitted'`, and revalidates `/portal`, `/portal/invoices`, and the detail path. Never return internal database error text to clients.

- [ ] **Step 4: Gates + commit**

Run `npm run lint && npx tsc --noEmit && npm run build`.

```bash
git add lib/crm/invoices.ts lib/crm/admin-actions.ts lib/crm/client-actions.ts
git commit -m "feat(invoice): add invoice totals payments and role-gated actions"
```

---

### Task 3: Admin invoice UI

**Files:**
- Modify: `app/(admin)/admin/layout.tsx` (enable Invoices)
- Modify: `app/(admin)/admin/page.tsx` (real unpaid count)
- Create: `app/(admin)/admin/invoices/page.tsx`
- Create: `app/(admin)/admin/invoices/new/page.tsx`
- Create: `app/(admin)/admin/invoices/[id]/page.tsx`
- Create: `components/admin/invoice-forms.tsx`

**Behavior contracts:**
- `/admin/invoices`: force-dynamic list; filter tabs All/Draft/Sent/Paid/Void via URL `status`; rows show `INV-<number>`, client, project, total, outstanding, status, due date; New invoice starts from an active project/client select.
- `/admin/invoices/new`: draft builder with project, currency, due date, payment note, repeatable line items (description, qty, unit price); add/remove rows; Save draft and Send invoice actions; all amounts displayed with cents conversion but submitted as integer cents.
- `/admin/invoices/[id]`: print-friendly preview; draft edit controls only while draft; sent/paid/void views are read-only financially. Shows line items, calculated total, submitted/confirmed/outstanding amounts, payment history, and admin confirmation/rejection controls. Send requires confirmation; Void requires typed invoice-number confirmation. No email send.
- Admin payment decisions use `useTransition` and refresh after success; errors render near the relevant control. Payment references are visible only to admins and the owning client.
- Overview unpaid card uses `countUnpaidInvoices()` and counts `sent` invoices with positive outstanding balance; no placeholder text remains for this card.

- [ ] **Step 1: Build UI components and pages**

Mirror `components/admin/project-forms.tsx`, `components/admin/client-actions.tsx`, and existing tables/dialogs. Use `useTransition` direct server-action calls, typed confirmations for Send/Void, semantic table headers, `type="number" step="0.01"` for quantity/price inputs, and print-only CSS (`print:hidden` on controls, `print:block` on invoice content).

- [ ] **Step 2: Gates + probes**

Run all gates. With a temporary admin/project/client/invoice: create draft, add two items, edit draft, send, verify controls lock; confirm a partial payment and verify balance; reject another; void a separate sent invoice and verify it remains in the Void filter. Verify Overview unpaid count changes. Delete fixtures and confirm payments/items cascade.

- [ ] **Step 3: Commit**

```bash
```

---

### Task 4: Client invoice UI and dashboard integration

**Files:**
- Modify: `app/(client)/portal/layout.tsx` (enable Invoices)
- Modify: `app/(client)/portal/page.tsx` (real outstanding card)
- Create: `app/(client)/portal/invoices/page.tsx`
- Create: `app/(client)/portal/invoices/[id]/page.tsx`
- Create: `components/portal/payment-form.tsx`

**Behavior contracts:**
- `/portal/invoices`: force-dynamic own-invoice list; rows show `INV-<number>`, project, total, outstanding, status, due date; no foreign rows.
- `/portal/invoices/[id]`: ownership-checked, print-friendly invoice detail with line items, totals, payment history, and payment form only while status is `sent` with positive outstanding balance. The form requires method, transaction/reference ID, and amount; amount cannot exceed outstanding; submitted state is clearly pending. No admin-only confirmation fields appear.
- Dashboard outstanding card uses `countOwnOutstandingInvoices()` and links to `/portal/invoices`; zero balance shows `—` and a no-outstanding message.
- Print output hides navigation, forms, and action buttons but preserves invoice identity, client/project, line items, totals, due date, and payment history.

- [ ] **Step 1: Build pages and form**

Use the established client `useTransition` pattern with success-only reset and inline errors. Never accept client id or invoice ownership from form data; actions derive it from the session.

- [ ] **Step 2: Gates + cross-client probes**

Run all gates. Client A sees only A invoices; direct A-invoice URL as client B returns the generic not-found page; unauthenticated routes redirect to login. Submit a partial payment as A, verify the invoice remains sent and the outstanding amount decreases only after admin confirmation; verify a rejected payment leaves the balance unchanged. Check print media hides controls via Playwright.

- [ ] **Step 3: Commit**

```bash
```

---

### Task 5: Documentation and close-out

**Files:**
- Create: `docs/invoices/README.md`
- Modify: `docs/crm/README.md`

- [ ] **Step 1: Document operations**

Document invoice numbering, calculated totals, draft-lock/send/void lifecycle, partial-payment accounting, supported methods, admin confirmation/rejection, ownership/RLS, print workflow, and no-email P5 boundary. Include a runbook for a manual invoice creation and payment-confirmation test using placeholders only. Add the actual probe matrix from Tasks 1-4 and remove P4b from the CRM non-goals section while leaving P5 lifecycle emails deferred.

- [ ] **Step 2: Final gates and review inputs**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Spot-check tracked files for secrets, passwords, signed URLs, and PII. Confirm no temporary fixtures remain in Supabase or R2. Summarize unresolved minor findings for the whole-branch reviewer.

- [ ] **Step 3: Commit**

```bash
```

---

## Spec Coverage Map

| Spec item (§3/§5/§8 P4b) | Task |
|---|---|
| invoices/items/payments schema | Task 1 |
| Dedicated invoice numbering | Task 1 |
| Invoice builder + line items | Tasks 2-3 |
| Draft-only editing / sent lock | Tasks 1-3 |
| Client invoice list/detail/print | Task 4 |
| Manual payment-reference submission | Tasks 2, 4 |
| Admin confirmation/rejection | Tasks 2-3 |
| Partial payments + calculated outstanding balance | Tasks 1-4 |
| Paid transition only at full confirmed total | Task 1 + probes |
| Admin/client RLS isolation | Task 1 + Task 4 probes |
| Dashboard unpaid/outstanding totals | Tasks 3-4 |
| No lifecycle email work | Task 5 |
