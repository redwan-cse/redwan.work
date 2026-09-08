# Invoices and payments

Current development-branch guide; not an unmerged-release claim. [Historical Phase 4b evidence](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/invoices/README.md) is preserved separately.

Invoices belong to projects and use dedicated INV numbering. Amounts are integer cents; quantities permit up to three decimal places. The shared validator checks decimal syntax rather than binary floating-point scaling, while existing BigInt-based line rounding is preserved. Every line rounds separately before totals are added. See [quantity validation](QUANTITY-VALIDATION.md).

Admins create drafts for active non-archived projects, add/edit items, then explicitly send. Sending locks financial fields; voiding preserves audit history. Clients see only their own non-draft invoices and submit payment references/amounts. Admin confirmation or rejection uses controlled atomic transitions; pending plus confirmed reservations prevent over-submission, and paid status follows confirmed totals.

Project overview links to project-scoped invoice lists and creation. A milestone can generate one draft snapshot of its title, amount and currency; repeated/concurrent generation returns the same invoice. Later milestone edits do not rewrite the invoice. Referenced financial provenance prevents destructive removal. Global invoice pages now filter ownership/status in SQL before pagination, return at most 25 rows, and calculate complete payment/item totals in PostgreSQL instead of per-row API hydration.

## Notifications

The old Phase 4b statement that sending an invoice sends no email is obsolete. Invoice-issued and payment-confirmed events are captured in the durable CRM outbox. Request completion can wake dispatch; a production scheduler is required for retries/backlog. Provider acceptance is not inbox delivery. Sending must remain explicitly confirmed because it changes financial state and can notify the client. See [durable email](../email/DURABLE-OUTBOX.md).

## Verification and release

Disposable tests cover decimal quantities, atomic financial operations, milestone snapshot/retry behavior, paginated counts and access restrictions. Complete current-head browser billing/payment/print acceptance and hosted delivery remain release gates. Never cascade-delete financial data as test cleanup on production. Any production migration needs reviewed dependency order, verified backup/restore and explicit approval. Applied migrations are not rewritten; application rollback does not automatically undo new financial/provenance constraints.
