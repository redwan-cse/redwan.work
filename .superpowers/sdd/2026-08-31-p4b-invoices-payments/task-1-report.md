# Task 1 Report

## Status

Implemented and applied `0007_invoices_payments.sql`.

## Changes

- Added invoice, invoice item, and payment tables, enums, sequence, indexes, RLS policies, helper functions, triggers, and draft-state financial locks.
- Kept payment normalization in the `BEFORE` trigger and moved invoice status recomputation to the `AFTER` trigger so the changed payment row is visible to the aggregate.
- Allowed only nested cascade deletes through the invoice item lock trigger, preserving direct sent-item delete/update protection while allowing invoice cleanup.

## Verification

- `npx supabase db push`: applied migration successfully.
- `npx supabase migration list`: local and remote both show `0001` through `0007`.
- Live metadata probe: all three enums and seven required policies present. The sequence metadata query timed out once through the CLI, while the migration push and subsequent enum/policy probes completed normally.
- Live fixture probe passed: confirmed partial payment left invoice `sent`; second confirmation reached total and changed it to `paid`; rejected payment had no effect; confirmed timestamp was normalized; sent invoice/item financial updates were rejected; invoice deletion cascaded to items and payments.

## Concerns

- The linked database had already recorded migration `0007` before the cascade correction was made. The corrected `guard_invoice_item_lock()` function was therefore applied with `CREATE OR REPLACE FUNCTION` through the linked CLI; the committed migration contains the corrected definition for fresh databases.
- The SQL LSP reports a parser false positive at the `create sequence` statement; `supabase db push` accepted and applied the migration.

## Review Fix Report

### Changes

- Added forward-only migration `0008_invoice_payment_hardening.sql`; `0007` remains unchanged for reproducibility.
- Revoked `EXECUTE` on `invoice_total_cents(uuid)` and `recompute_invoice_status(uuid)` from `public`, `anon`, and `authenticated`; granted it only to `service_role`.
- Extended the item lock to `INSERT`, so new items require a draft parent invoice.
- Removed the broad `pg_trigger_depth()` bypass. Parent invoice cascade deletes are allowed only when the parent row is already absent; direct child deletes on non-draft invoices remain blocked.
- Payment normalization now clears `confirmed_by` and `confirmed_at` for every non-confirmed status, including `confirmed` to `submitted`.

### Verification

- `npx supabase db push`: applied `0008_invoice_payment_hardening.sql` successfully.
- `npx supabase migration list`: local and remote both show `0001` through `0008`.
- Live privilege metadata: both helper functions remain `SECURITY DEFINER`; `public`, `anon`, and `authenticated` cannot execute them; `service_role` can execute them.
- Anonymous REST RPC probe returned HTTP `401` with `permission denied for function invoice_total_cents`.
- Transactional live probe passed: sent-invoice item INSERT was denied; confirmed partial payment kept the invoice `sent`; confirmed-to-submitted cleared both confirmation metadata fields; a subsequent confirmation reaching the item total changed the invoice to `paid`; invoice deletion cascaded to items and payments.
- `npm run lint && npx tsc --noEmit && npm run build`: passed. Existing dependency/browser-data freshness warnings were non-blocking.

### Concerns

- Supabase MCP metadata calls were unavailable because the configured MCP project reference included the `NEXT_PUBLIC_SUPABASE_URL=` prefix. Equivalent live SQL and REST probes through the linked Supabase CLI/API completed successfully.
- The SQL LSP still reports its known false positive on `REVOKE`; Supabase accepted and applied the migration.
