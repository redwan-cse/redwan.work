# Submission and storage reliability acceptance

Branch work for issues #31, #35, #36, #37, #33, #34 and #42. Not a production release or an issue-closure claim.

## Contracts

Contact intake requires configured Supabase and IP hash salt; production also requires Turnstile. Rate/replay RPC errors and nonboolean results return a fixed 503 and never reach lead persistence. Development retains only its explicit missing-Turnstile bypass, never a DB/rate-control bypass. Only one-way IP keys enter the memory pre-layer. Contact HEAD accepts validated contact keys; portal GET still refuses them.

Ticket attachments use the same presign service from route and legacy action. Scope, role, current profile, MIME, integer byte count and DB-backed rate budget are checked. Confirmation validates the whole batch and checks each actual stored size before any database write. Pending new-ticket keys cannot be used as existing-ticket confirmation keys; existing ticket/project keys cannot be submitted as new-ticket pending uploads. Pending uploads remain unbound until ticket creation.

Migration 0018 adds service-only atomic RPCs. Creation serializes on the active client profile, checks the 24-hour quota, inserts ticket/message/files/submission identity in one transaction, and rejects changed content under an existing request identity. Confirmation serializes on its ticket, checks the cap under lock and treats an exact already-confirmed file as an idempotent success. Cross-ticket key rebinding is refused. Existing records and migrations 0001-0017 remain unchanged.

Storage deletion requires positive per-key acknowledgement. If any key fails or is absent from the response, callers must retain tracking and retry. Already-deleted keys can be retried. Listing without a valid fresh continuation token fails instead of returning a partial authorization set. This is not yet the complete recoverable project-purge solution.

## Verification

`node --experimental-strip-types --test tests/reliability/*.test.mjs` executes real application modules with isolated external adapters. Storage cases cover contact HEAD, portal GET boundary, mismatch/missing sizes, partial deletion, duplicate keys, incomplete/looping inventories and invalid file metadata. Contact cases cover config/IP/replay failures and positive persistence. These are not live Cloudflare or hosted-policy evidence.

## Bounded ticket attachment presigning, scoped validation, and sharing semantics: 16 September 2026

Verification suite `tests/reliability/ticket-attachments.test.mjs` (37 cases) confirms:
- Presign preparation (`prepareTicketUploads`): validates actor `{ userId, role }` and active profile status; denies inactive accounts and role mismatches (401); forbids admin presign without ticketId ("Choose a ticket first.", 400); denies foreign ticket access (404); enforces the 10-file ticket cap against existing database rows; validates MIME allowlist and 10 MB size limits; consumes database rate limit (`consume_rate_limit`) with fail-closed 429/503 behavior; issues scoped PUT URLs (`private/{owner}/ticket_{ticketId}/` vs `private/{owner}/pending/`).
- Attachment validation (`validateAttachments`): verifies UUIDs, strict key prefix constraints, directory traversal protection (`^[0-9a-f-]{36}\.[a-z0-9]+$`), duplicate detection, and byte-exact R2 HEAD size verification (`verifyStoredObjectSize`); enforces all-or-nothing batch failure if any file is missing or corrupted.
- Server action boundaries: `shareTicketFilesAction` and `confirmTicketAttachmentAction` enforce active profile and ownership, invoke atomic RPC `attach_ticket_files_atomic`, map limit errors to user-facing copy, maintain diagnostic redaction on internal errors, and trigger Next.js cache revalidation for admin and portal ticket views.
- Client ticket creation: `createTicketWithAttachmentsAction` validates client session and pending attachments prior to atomic ticket creation.
- Route boundary: `POST /api/uploads/ticket-presign` enforces same-origin/sec-fetch-site checks (403), authentication (401), and JSON validation (400).

## Deployment and rollback

Do not run a remote migration from CI. Validate all old migrations plus 0018 against a fresh disposable database and representative synthetic data. Before an authorized production release, take and verify a backup; apply additive 0018 before deploying the dependent application. Roll back application code if needed, retaining the additive table/functions and existing data. Never reset production or delete submission identities as a rollback shortcut.

