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
