# Task 3: Admin Invoice UI Report

Date: 2026-08-31

## Implementation

- Enabled Invoices in the admin navigation.
- Replaced the Overview unpaid-invoice placeholder with `countUnpaidInvoices()`.
- Added dynamic admin invoice list, draft builder, and print-friendly detail routes.
- Added repeatable draft line items with positive quantity validation and dollar-to-cent conversion before action calls.
- Added draft metadata and line-item update/remove controls.
- Added confirmation dialogs for Send and typed `INV-<number>` confirmation for Void.
- Added transition-backed payment confirmation/rejection controls with inline errors and refreshes.
- Extended `CrmActionState` with `invoiceId` and returned the created ID from `createDraftInvoiceAction` while preserving role gating and revalidation.
- No email send behavior was added.

## Validation

- `npm run lint`: passed. ESLint emitted only existing dependency-data freshness warnings.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed. Next.js generated `/admin/invoices`, `/admin/invoices/new`, and `/admin/invoices/[id]` as dynamic routes.
- `git diff --check`: passed.
- Unauthenticated HTTP probes: `/admin/invoices` and `/admin/invoices/new` each returned `307` redirects to the login flow.

## Fixture Probes

The authenticated temporary-fixture probe matrix could not be executed in this environment. The local `supabase` CLI is not installed, Chromium is not installed for Playwright, and the configured Supabase URL is malformed and was rejected by the Supabase integration as `NEXT_PUBLIC_SUPABASE_URL=cqxtmzzlywolulechcob`.

Consequently, no temporary users, projects, invoices, items, or payments were created, and no cleanup was required. The required create/edit/send/lock, partial-confirmation, rejection, void-filter, Overview-count, cascade, and print-media probes remain deployment-environment follow-up items.

## Concerns

- Authenticated browser and database probes remain outstanding because of the unavailable tooling/configuration above.
- Existing repository build warnings report stale `baseline-browser-mapping` and `caniuse-lite` data; these were not changed because they are outside Task 3 scope.

## Review Fixes

Date: 2026-08-31

- Added `supabase/migrations/0010_invoice_draft_atomicity.sql` with the service-role-only `create_draft_invoice_with_items` transaction. It validates active non-archived projects, draft fields, every item row, integer cents, and inserts the invoice and all items atomically.
- Added the matching service/action path and moved the new builder off separate create/item mutations. Every populated builder row is validated before the RPC call.
- Added calculated per-line amounts and total, a print button, active project selectors on draft editing, delete-item errors, and an empty active-project state.
- Fresh `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed.
- `npx supabase db push` applied `0010_invoice_draft_atomicity.sql` to the linked database. A linked read-only privilege query verified `service_role` can execute `create_draft_invoice_with_items` and `authenticated` cannot. The Supabase MCP verifier remains unusable because the configured project reference is invalid: `NEXT_PUBLIC_SUPABASE_URL=cqxtmzzlywolulechcob`.
- Authenticated UI/database fixture probes remain unavailable because Chromium is not installed and the configured MCP project reference is invalid. No temporary fixture mutations were made.
