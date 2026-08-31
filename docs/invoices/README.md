# Invoices and Payments (Phase 4b)

Phase 4b adds admin invoice creation and payment review, plus an ownership-scoped client invoice view. Invoice data is served through the invoice service using the service-role client after the relevant admin or client session guard; clients never choose their own identity from form data.

## Schema and Numbering

- **Migration:** `supabase/migrations/0007_invoices_payments.sql`, hardened by migrations `0008` through `0010`.
- **Tables:** `public.invoices`, `public.invoice_items`, and `public.payments`. Invoices belong to a project, and the project identifies the client.
- **Invoice number:** `invoice_number_seq` starts at `1000`. Each invoice receives the next unique integer and displays as `INV-<number>`.
- **Currency:** three-letter uppercase currency code, such as `USD`. Monetary values are stored as integer cents.
- **Line amount:** each line is `round(quantity * unit_price_cents)`. The invoice total is the sum of line amounts.

## Amounts and Partial Payments

The invoice detail view exposes four calculated amounts:

| Amount | Calculation |
|---|---|
| Total | Sum of rounded line amounts |
| Submitted | Submitted plus confirmed payment amounts |
| Confirmed | Confirmed payment amounts only |
| Outstanding | `max(total - confirmed, 0)` |

Payment submission reserves both `submitted` and `confirmed` amounts, so concurrent submissions cannot reserve more than the invoice total. A partial confirmed payment leaves a sent invoice in `sent` status. The invoice changes to `paid` only when confirmed payments reach the calculated total. Rejected payments do not contribute to either submitted or confirmed totals. Confirmation is rejected if it would exceed the invoice total.

## Invoice Lifecycle

### Draft

Admins can create a draft for an active, non-archived project, choose currency and due date, add or edit line items, and add an optional payment note. Creation of the invoice and its initial items is atomic. A draft must have at least one item and a positive total before it can be sent.

### Send and lock

The admin builder offers **Save draft** and **Save and send**. Sending sets `issued_at` and changes the status to `sent`. Sending is explicit and confirmed in a dialog. Once sent, the invoice number, project, currency, due date, payment note, and financial line-item fields are locked. Database triggers enforce the lock in addition to service-level checks.

### Paid

A sent invoice transitions to `paid` only after an admin confirms enough submitted payments to cover the calculated total. Paid invoices retain their payment history and are not edited through the draft workflow.

### Void

Only a sent invoice can be voided. The admin must type the displayed `INV-<number>` value to confirm. Voiding preserves the invoice and its history for audit; it does not send an email.

## Payment Methods and Review

Clients can submit a positive amount with a required transaction/reference ID using one of these methods:

- Bank transfer
- bKash
- PayPal
- Other

The submission form is available for sent invoices owned by the signed-in client. The atomic submission path checks invoice status, project ownership, supported method, reference length (1-200 characters), and the remaining reserved balance. Errors shown to clients are generic payment errors.

Submitted payments appear in the admin invoice detail view. An admin can **Confirm** or **Reject** a submitted payment. Confirmation records the confirming admin and timestamp, normalizes confirmation metadata, and recalculates invoice status. Rejection removes the payment from the reserved and confirmed totals. A payment that is no longer submitted cannot be confirmed or rejected through these controls.

## Ownership and RLS

- Admin action wrappers require an admin session before invoice operations and revalidate the owning project path.
- Client actions require an active client session. The client id comes from the session, and invoice detail/list queries are scoped through the invoice's project ownership.
- Invoice helper functions and atomic payment/draft RPCs are `SECURITY DEFINER` but executable only by `service_role`; they are not public or authenticated RPCs.
- Database RLS is enabled for invoice, item, and payment records. Service-role server queries perform the application-level ownership checks before loading client-visible items or payments.
- Foreign invoice access returns a generic not-found result rather than exposing whether another client's invoice exists.

## Print Workflow

Use the **Print** control on the admin or client invoice detail page, then select the browser's print-to-PDF destination if a PDF is needed. Print styles keep the invoice identity, dates, line items, totals, and payment history. Navigation, back links, action buttons, payment decision controls, and the client payment form are hidden from the printed document.

## Email Boundary

Phase 4b does not send invoice or payment lifecycle email. Sending an invoice only changes its database status and displays the invoice in the client portal. Lifecycle emails and `email_log` remain deferred to **P5**.

## Manual Runbook

Use only throwaway local or staging fixtures. Replace every angle-bracket placeholder locally; do not put credentials, tokens, signed URLs, full UUIDs, customer names, customer email addresses, or payment references in committed documentation.

### Create and send an invoice

1. Sign in as an admin using the local/staging admin fixture.
2. Open `/admin/invoices/new`.
3. Select `<active-project-id>`, enter `<currency>`, `<due-date>`, and optional `<payment-note>`.
4. Add at least one line: `<description>`, quantity `<quantity>`, and unit price `<unit-price>`.
5. Choose **Save draft** and confirm the invoice shows `draft` and `INV-<number>`.
6. Reopen the draft, verify calculated line and invoice totals, then choose **Send invoice** and confirm the send dialog.
7. Verify the status is `sent`, financial edits are refused, and no email is sent.

### Submit and review a partial payment

1. Sign in as the client owning `<active-project-id>` and open `/portal/invoices/<invoice-id>`.
2. Submit `<partial-amount>` using `<bank|bkash|paypal|other>` and reference `<local-test-reference>`.
3. Sign in as an admin and open the same invoice through `/admin/invoices/<invoice-id>`.
4. Confirm the payment and verify `confirmed`, the confirmation timestamp, and the reduced outstanding balance.
5. Submit and confirm a second payment for the remaining amount. Verify the invoice becomes `paid` only when the confirmed total reaches the invoice total.
6. Repeat with a separate submitted payment and choose **Reject**. Verify it does not change the calculated balance.

### Cleanup

Delete all throwaway auth users and their fixture project/invoice rows using the local or staging administrative cleanup procedure. Confirm no temporary invoice, item, payment, project, object, or user remains. Do not record cleanup credentials or identifiers in this repository.

## Probe Matrix

The matrix below records only evidence in the Task 1–4 reports. “Unavailable” means the probe was not executed and must not be treated as a pass. Fixture identifiers and credentials are intentionally omitted.

| # | Area | Probe | Expected | Observed / status |
|---|---|---|---|---|
| 1 | Schema and privileges | Apply migrations through `0010`; inspect enums, policies, and helper privileges | Invoice/payment schema exists; financial helpers and RPCs are service-role-only | **Composite evidence:** Task 1 reports migrations `0007`–`0008` and required enums/policies/helper privileges verified; Task 3 reports migration `0010` applied and its privilege check passed. This is not one complete migration probe. |
| 2 | Numbering | Create invoice and inspect displayed number | Dedicated sequence; unique `INV-<number>` | **Unavailable authenticated probe:** Task 3 could not run invoice fixture UI probes |
| 3 | Totals | Calculate line totals and invoice aggregates | Rounded line amounts; submitted includes submitted + confirmed; outstanding clamps at zero | **Static/contract pass; live aggregate behavior reported in Task 1:** Task 2 validated the calculation contract, and Task 1 reported live fixture coverage of calculated total behavior |
| 4 | Partial confirmation | Confirm less than total, then confirm the remainder | First confirmation leaves `sent`; full confirmed total changes status to `paid` | **Pass:** Task 1 live fixture probe; Task 2 atomicity probe also passed |
| 5 | Rejection | Reject submitted payment | Payment no longer affects reserved/confirmed totals | **Pass:** Task 1 live fixture probe |
| 6 | Confirmation metadata | Confirm, then move a confirmed payment back to submitted | Confirmation metadata is set on confirmation and cleared when non-confirmed | **Pass:** Task 1 hardening probe |
| 7 | Over-confirmation | Confirm payment that would exceed invoice total | Confirmation refused; invoice and payment remain consistent | **Pass:** Task 2 live transactional probe |
| 8 | Draft lock | Update invoice/items after send | Financial updates and item insert/update/delete are refused | **Pass:** Task 1 and Task 2 live probes covered sent-item locking |
| 9 | Send/void | Send valid draft; void sent invoice | Send requires positive items; sent locks; typed `INV-<number>` confirms void | **Unavailable authenticated probe:** Task 3 UI fixture probes could not run |
| 10 | Atomic draft creation | Create draft with invalid project or item payload | No partial invoice or item rows | **Static/RPC privilege verification passed:** Task 3 reports migration `0010` applied and the service-role privilege check passed. **Authenticated invalid-payload/rollback probe unavailable** and remains a staging follow-up |
| 11 | Client ownership | Client A reads client B invoice/list/payment data | No foreign data or existence leak | **Unavailable authenticated probe:** Task 4 could not initialize Chromium; no fixture data was created |
| 12 | Payment submission | Owned client submits supported method, reference, and amount | Submitted payment is created only within reserved balance | **Unavailable authenticated probe:** Task 4 browser probe unavailable; atomic RPC implementation and privilege checks reported |
| 13 | Admin decision UI | Admin confirms or rejects submitted payment | Transition controls refresh calculated totals/status | **Unavailable authenticated probe:** Task 3 browser fixture probe unavailable |
| 14 | Print | Print admin/client detail page | Invoice content remains; controls and portal chrome are hidden | **Static pass; browser probe unavailable:** Task 3 static print check and Task 4 print-style implementation check passed; the print-media browser probe was unavailable |
| 15 | Unauthenticated routes | Request admin/client invoice routes without a session | Redirect to login | **Pass:** Task 3 admin routes and Task 4 `/portal/invoices` returned `307` login redirects |
| 16 | Email boundary | Send invoice | Database-only transition; no lifecycle email | **Pass by implementation:** Task 3 explicitly reports no email behavior added; authenticated UI probe unavailable |
| 17 | Cleanup | Inspect temporary fixtures after probes | No temporary fixture rows or objects remain | **Pass for executed probes:** Task 1/2 transactional probes rolled back or cleaned up; Task 3/4 created no fixtures because authenticated probes were unavailable |

## Follow-ups

- Run rows 2, 9, 11–13, and the browser portion of row 14 in a staging environment with Chromium and valid Supabase configuration.
- Run the manual runbook with throwaway fixtures and record only pass/fail outcomes in the next task report.
- Keep P5 lifecycle email and `email_log` work separate from the Phase 4b invoice/payment implementation.
