# Invoices and payments

Current development-branch guide; not an unmerged-release claim. [Historical Phase 4b evidence](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/invoices/README.md) is preserved separately.

Invoices belong to projects and use dedicated INV numbering. Amounts are integer cents; quantities permit up to three decimal places. The shared validator checks decimal syntax rather than binary floating-point scaling, while existing BigInt-based line rounding is preserved. Every line rounds separately before totals are added. See [quantity validation](QUANTITY-VALIDATION.md).

Admins create drafts for active non-archived projects, add/edit items, then explicitly send. Sending locks financial fields; voiding preserves audit history. Clients see only their own non-draft invoices and submit payment references/amounts. Admin confirmation or rejection uses controlled atomic transitions; pending plus confirmed reservations prevent over-submission, and paid status follows confirmed totals.

Project overview links to project-scoped invoice lists and creation. A milestone can generate one draft snapshot of its title, amount and currency; repeated/concurrent generation returns the same invoice. Later milestone edits do not rewrite the invoice. Referenced financial provenance prevents destructive removal. Global invoice pages now filter ownership/status in SQL before pagination, return at most 25 rows, and calculate complete payment/item totals in PostgreSQL instead of per-row API hydration.

## Notifications

The old Phase 4b statement that sending an invoice sends no email is obsolete. Invoice-issued and payment-confirmed events are captured in the durable CRM outbox. Request completion can wake dispatch; a production scheduler is required for retries/backlog. Provider acceptance is not inbox delivery. Sending must remain explicitly confirmed because it changes financial state and can notify the client. See [durable email](../email/DURABLE-OUTBOX.md).

## Bounded F01 draft-save repair: 12 September 2026

Owner approved only the draft-invoice result repair with test-first verification. This is a supporting checkpoint for [PR56](https://github.com/redwan-cse/redwan.work/pull/56), not a new backlog or completion of all F01 work. Baseline was 5ddd58ca7e609a5238fb1a72aa8234639f0845e1; main remained 27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a.

`updateDraftInvoice` now requests an exact affected-row count on the existing update filtered by invoice ID and status `draft`. Success requires no database error and count exactly 1. Zero, missing or unexpected counts return a fixed refresh/retry message; provider errors retain the generic failure. Existing input validation, admin authorization, result shape and caller propagation are unchanged. No extra write, post-write read, automatic retry or notification is introduced. A missing count does not prove rollback: refresh and inspect the current invoice before retrying.

Test-first evidence:

- [Red commit 03ea8a1](https://github.com/redwan-cse/redwan.work/commit/03ea8a1a9c7d2b57c214abe16577467add4959ca) added `tests/reliability/draft-invoice-save.test.mjs` without modifying application code. [Red reliability run](https://github.com/redwan-cse/redwan.work/actions/runs/34680590524) failed with `draft status race to sent returns conflict rather than success; ERR_ASSERTION`, not an import/setup failure.
- [Repair 90c5017](https://github.com/redwan-cse/redwan.work/commit/90c501734f90dac67d84598630d371fa4cf83797) changes only four added/two removed lines in the draft-save service. [Green reliability run](https://github.com/redwan-cse/redwan.work/actions/runs/34680711122) passed the regression suite, lint, Next type generation, strict TypeScript and build at that exact commit. The 23 new module/action cases cover status changes before write, disappearance, exact-count success, identical repeated saves, unconfirmed counts, database/read errors, invalid inputs, action propagation/revalidation and anonymous/client/inactive/changed-role denial.
- Tests import the actual invoice service, input validator, result helper and admin action with explicit synthetic service adapters. Unrelated provider/email dependencies throw if called. The race is a deterministic adapter interleaving, not new concurrent PostgreSQL or hosted browser evidence. Existing form error rendering was source-reviewed, not newly browser-certified by these tests.

Self-review confirmed the bounded diff and preserved ID/status filters; independent APPROVED review remains absent. Concurrent draft-to-draft lost updates are not solved by row counting. Item mutations, other financial results, notification freshness, consent versioning, migrations and release gates remain outside this slice. No production access/change, real mail, schema change, merge or deployment occurred. Later documentation-only commits do not change the tested application, but their own current-head checks must still be inspected before claiming current-head verification.

## Verification and release

Disposable tests cover decimal quantities, atomic financial operations, milestone snapshot/retry behavior, paginated counts and access restrictions. Complete current-head browser billing/payment/print acceptance and hosted delivery remain release gates. Never cascade-delete financial data as test cleanup on production. Any production migration needs reviewed dependency order, verified backup/restore and explicit approval. Applied migrations are not rewritten; application rollback does not automatically undo new financial/provenance constraints.
