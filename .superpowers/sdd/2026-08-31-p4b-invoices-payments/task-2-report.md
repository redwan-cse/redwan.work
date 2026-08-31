# Task 2 Report: Invoice Service Module and Action Contracts

## Implementation

- Added `lib/crm/invoices.ts` with the invoice, item, and payment contracts.
- Added centralized `calculateAmounts()` semantics:
  - line totals use `round(qty * unit_price_cents)`;
  - submitted totals include submitted and confirmed payments;
  - confirmed totals include confirmed payments only;
  - outstanding totals are clamped at zero.
- Added service-role-only invoice listing and detail queries. Client detail ownership is checked before item or payment queries.
- Added draft invoice creation/update, item mutations, send, void, payment confirmation/rejection, unpaid counts, client outstanding counts, and payment submission.
- Added admin action wrappers with role checks first and admin/project/invoice path revalidation.
- Added client payment submission wrapper with role check first, session-derived ownership, and generic payment errors.

## Security and Contract Checks

- All invoice database access in the new service uses `getSupabaseAdmin()`.
- Client payment submissions require a sent invoice owned by the authenticated client, a supported method, a non-empty bounded reference, and a positive integer amount.
- Submission balance checks reserve both submitted and confirmed payments.
- Payment confirmation re-fetches invoice totals and rejects an amount that would exceed the calculated total.
- Draft-only changes are checked in the service and remain protected by the live database triggers.
- Existing CRM action exports were preserved.
- No invoice, payment, reference, email, or database error details are logged or returned on payment failure paths.

## Validation

- `npm run lint`: passed. Existing `baseline-browser-mapping` update notices remain.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Next.js production build completed successfully.
- No production mutation probes were run.

## Concerns

- The repository has no configured test runner, so focused automated unit tests were not added or executed.
- The service currently uses sequential hydration queries for invoice lists; this is acceptable for the Task 2 contract but may be worth batching when the invoice UI is added.
- Payment submission balance validation and insertion are separate requests. The database schema and status trigger protect status transitions, but strict concurrent submission reservation would require a transaction or database RPC in a later hardening task.

## Task 2 Review Fixes

- Added forward migration `0009_invoice_payment_atomicity.sql` with service-role-only security-definer RPCs for atomic payment confirmation and submission.
- Both RPCs lock the invoice row before calculating payment totals, serializing confirmation and submission decisions per invoice.
- Confirmation locks and re-checks the submitted payment, rejects over-confirmation, sets `confirmed_by` and `confirmed_at`, and recomputes invoice status.
- Submission repeats sent-status and client-ownership checks inside the RPC, reserves submitted plus confirmed payments, and inserts only within the locked transaction.
- Service methods now call the RPCs and return generic payment errors.
- Admin invoice mutation wrappers now resolve project ownership and revalidate the owning project path for draft updates, item additions, and void operations.
- Live transactional probe passed for over-reservation rejection, confirmation metadata, and sent-invoice item locking. The probe transaction rolled back all temporary rows.
- `npx supabase migration list` and `npx supabase db push` confirmed migration `0009` is applied remotely.

## Final P4b Integrity Fixes

- Added and applied forward migration `0011_invoice_payment_integrity.sql`.
- Removed the authenticated direct payment INSERT path and restricted client invoice, item, and payment reads to `sent`, `paid`, and `void` invoices. Admin access remains available through the existing admin policy and service-role application client.
- Added fail-closed payment integrity triggers: payment identity/accounting fields and confirmation metadata cannot be edited after insert, direct payment inserts are rejected, and status changes are accepted only from controlled transition RPCs.
- Added an atomic rejection RPC and routed `rejectPayment` through it; confirmation and submission continue through their locked service-role RPCs.
- Added active, non-archived project validation to both legacy draft creation and draft updates. The existing draft-builder RPC path retains its database-side active-project check and now receives matching service-side validation.
- Added bounded decimal quantity, unit-price, line-total, payment-sum, and total validation. Quantities are limited to three decimal places, quantities to `1,000,000`, unit prices to `1,000,000,000` cents, and calculated totals to `Number.MAX_SAFE_INTEGER`; UI and PostgreSQL use the same rounded line-total semantics.
- Invoice list/detail hydration now propagates generic operation failures instead of returning empty or zero financial data.
- Live integrity probe passed for direct insert denial, draft read denial, atomic submit over-reservation, atomic confirm/reject, payment immutability, draft project restrictions, fractional/half-cent rounding, and paid transition. The probe transaction rolled back all temporary rows.
- `npx supabase db push` and `npx supabase migration list` confirmed remote migration alignment through `0011`.

## Final Fix Concerns

- The service still uses sequential invoice hydration queries; batching can be considered with the invoice UI performance work.
- Direct client PostgREST denial was verified at the database boundary with an authenticated-role probe. The application client remains intentionally service-role-only for invoice mutations.

## Remaining P4b Review Fixes

- Added `roundInvoiceLineCents`, `calculateInvoiceTotalCents`, and shared safe-bound constants in `lib/crm/invoice-math.ts`. Service and admin/client invoice displays now use the same exact positive three-decimal rounding semantics as PostgreSQL.
- Client `listInvoices` filters to `sent`, `paid`, and `void`; client detail rejects drafts before child queries. Missing project hydration now returns a generic operation failure instead of silently omitting rows.
- Added aggregate total validation in the service/UI and a forward database hardening migration `0012_invoice_read_and_total_hardening.sql`. The documented maximum is `Number.MAX_SAFE_INTEGER` cents; database item writes invoke the bounded total function before completion.
- Live probe passed for direct authenticated insert denial, draft read denial, atomic submission reservation, rejection, fractional rounding, payment immutability, and existing payment transition behavior. Temporary rows were rolled back.
- `npx supabase db push` applied `0012`; local and remote migration state aligned through `0012`.

## Final Fix Concerns

- Invoice hydration remains sequential and can be batched as a later performance improvement.
