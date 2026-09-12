# Submission and storage reliability acceptance

Branch work for issues #31, #35, #36, #37, #33, #34 and #42. Not a production release or an issue-closure claim.

## Contracts

Contact intake requires configured Supabase and IP hash salt; production also requires Turnstile. Rate/replay RPC errors and nonboolean results return a fixed 503 and never reach lead persistence. Development retains only its explicit missing-Turnstile bypass, never a DB/rate-control bypass. Only one-way IP keys enter the memory pre-layer. Contact HEAD accepts validated contact keys; portal GET still refuses them.

Ticket attachments use the same presign service from route and legacy action. Scope, role, current profile, MIME, integer byte count and DB-backed rate budget are checked. Confirmation validates the whole batch and checks each actual stored size before any database write. Pending new-ticket keys cannot be used as existing-ticket confirmation keys; existing ticket/project keys cannot be submitted as new-ticket pending uploads. Pending uploads remain unbound until ticket creation.

Migration 0018 adds service-only atomic RPCs. Creation serializes on the active client profile, checks the 24-hour quota, inserts ticket/message/files/submission identity in one transaction, and rejects changed content under an existing request identity. Confirmation serializes on its ticket, checks the cap under lock and treats an exact already-confirmed file as an idempotent success. Cross-ticket key rebinding is refused. Existing records and migrations 0001-0017 remain unchanged.

Storage deletion requires positive per-key acknowledgement. If any key fails or is absent from the response, callers must retain tracking and retry. Already-deleted keys can be retried. Listing without a valid fresh continuation token fails instead of returning a partial authorization set. This is not yet the complete recoverable project-purge solution.

## Verification

`node --experimental-strip-types --test tests/reliability/*.test.mjs` executes real application modules with isolated external adapters. Storage cases cover contact HEAD, portal GET boundary, mismatch/missing sizes, partial deletion, duplicate keys, incomplete/looping inventories and invalid file metadata. Contact cases cover config/IP/replay failures and positive persistence. These are not live Cloudflare or hosted-policy evidence.

Remaining acceptance: disposable DB migration, transaction rollback and concurrent cap/retry tests; real browser ticket workflow; complete cleanup DB inventories; hosted upload request ceiling; durable notification identity (a repeated successful creation can still schedule the existing email notification); production deployment approval and verified backup/recovery. The historical README probes are not proof that these new changes passed.

## Deployment and rollback

Do not run a remote migration from CI. Validate all old migrations plus 0018 against a fresh disposable database and representative synthetic data. Before an authorized production release, take and verify a backup; apply additive 0018 before deploying the dependent application. Roll back application code if needed, retaining the additive table/functions and existing data. Never reset production or delete submission identities as a rollback shortcut.
