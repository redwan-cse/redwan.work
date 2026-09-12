# Approved client workflow implementation

## Added flows

Clients have Projects and Profile navigation. Project pages scope the project lookup to the current active client before reading milestones, show completion counts and progress, and paginate both projects and milestone details. Profile editing accepts only name and company; role, active state, auth email and billing identity are not posted fields. Admin client rows expose the same bounded field editor, with a paginated directory and at most 20 account-email lookups per page.

Project overview now links to project-scoped invoice lists and creation. Lists filter project_id in the database, not after global hydration. The existing invoice editor is reused with one project candidate. Milestone draft generation is a service-only atomic RPC: current active admin, project lock, milestone lock, positive amount, snapshot of title/amount/currency, one invoice mapping per milestone. Repeated generation returns the original invoice, including after later lifecycle transitions. It never sends an invoice automatically. The draft remains manually editable and is not synchronized to subsequent milestone edits.

## Deletion and retention boundary

Profile editing is not account deletion. No data deletion, auth-user removal, invoice cascade or retention period is authorized by this UI. Invoiced milestones retain an explicit provenance link and cannot be removed while referenced. A deletion request must be reviewed for financial/legal holds, exported data, private objects, retained backups and verified recovery; the owner still needs to choose the retention periods and erasure policy. Existing activation actions are separate and their session-lifecycle remediation remains tracked in #28. Do not claim full client deletion CRUD is shipped.

## Acceptance and rollout

All code is branch-only. Apply additive 0019 only after 0018 and disposable migration/concurrency tests. Verify own/foreign/inactive/admin routes; mobile and keyboard profile forms; empty and paginated projects; milestone snapshot amounts and same-invoice retry; active/archived/zero-value guards; client denial of invoice generation. Never execute migrations against production from CI. Backup and verified restore precede a separately approved production migration. Rollback can restore application code while retaining provenance and all financial data.

This document is an implementation contract, not a record of passed browser acceptance. Historical README claims do not substitute for current CI evidence.
