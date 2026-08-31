# Task 4 Report: Client Invoice UI

## Status

Implemented the client invoice UI and portal dashboard integration on `feat/invoices-payments`.

## Changes

- Enabled the Invoices item in the client portal navigation.
- Replaced the dashboard invoice placeholder with `countOwnOutstandingInvoices()` and a link to `/portal/invoices`.
- Added the force-dynamic own-invoice list at `/portal/invoices`.
- Added the ownership-checked, print-friendly invoice detail route at `/portal/invoices/[id]`.
- Added client payment submission with method, reference, amount, inline errors, pending state, and success-only reset.
- Kept invoice totals and balances sourced from invoice service data; no client invoice ID or ownership is trusted from form data.
- Print styles hide portal navigation, headers, buttons, and payment forms while retaining invoice content and payment history.

## Validation

- `npm run lint`: passed. Existing `baseline-browser-mapping` update notices remain.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Both invoice routes appear as dynamic routes.
- `git diff --check`: passed.
- HTTP unauthenticated probe: `GET /portal/invoices` returns `307` to `/login?next=%2Fportal%2Finvoices`.

## Probes

Authenticated cross-client, payment lifecycle, and print-media browser probes were unavailable. Playwright could not initialize because Chromium is not installed at `/opt/google/chrome/chrome`; no authenticated fixture data was created, so no cleanup was required.

## Commit

`feat(invoice): add client invoice detail and payment submission UI`
