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

## Bounded abandoned upload retention lifecycle and sweep concurrency: 16 September 2026

Verification suite `tests/reliability/retention-lifecycle.test.mjs` (18 cases) confirms:
- Endpoint protection: `GET /api/cron/r2-retention` requires valid `Bearer <CRON_SECRET>` (401 on missing, bad, or non-bearer tokens); fails closed with 503 if R2 is unconfigured or if `maintenance_cursors` table is unavailable or missing cursor rows; returns `Cache-Control: no-store` on all responses.
- Bound vs. unbound separation: bound ticket attachments (`private/{user}/ticket_{ticketId}/...` or `files.ticket_id IS NOT NULL`) and bound deliverables (`private/{user}/project_{projectId}/...` or `files.project_id IS NOT NULL`) are strictly excluded from retention claims; fresh pending uploads (< 24 hours) are preserved; abandoned pending uploads (>= 24 hours, unbound) are claimed by `claim_expired_storage`, snapshotted into `storage_deletions(source='pending')`, and deleted from `files`; lead attachments (`contact/...`) are preserved if < 90 days or marked `retained: true`, and expired unretained attachments are queued for deletion.
- CAS cursor concurrency: compare-and-set updates on `maintenance_cursors` (`contact`, `private`, `projects`) return 503 with `Retry-After: 60` upon detecting a concurrent worker race (`count === 0`); uncontested sweeps advance cursors cleanly.
- Storage drain reliability: `drainStorageDeletions` requires exact per-key acknowledgement; storage failures retain `completed_at: null` for retry; concurrent worker acknowledgements are skipped without false error.
- Project retention safeguards: projects with linked invoices or unarchived status are refused; clean archived projects require verified recovery archives before deletion.
## Action manifest & caller inventory verification (Issue #42 / V01): 16 September 2026

Verification suite `tests/reliability/caller-inventory.test.mjs` (6 cases) and `docs/security/CALLER-INVENTORY-V01.md` confirm:
- Complete HTTP entry point inventory: 8 API route handlers (`app/api/**/route.ts`) and 41 server actions across 6 modules (`lib/auth/actions.ts`, `lib/crm/admin-actions.ts`, `lib/crm/client-actions.ts`, `lib/crm/public-asset-actions.ts`, `lib/crm/workflow-actions.ts`, `lib/crm/ticket-upload-actions.ts`).
- Build manifest agreement: `.next/server/server-reference-manifest.json` entries map directly to real, exported server action definitions.
- Universal fail-closed authorization: admin mutations reject anonymous callers, client sessions, deactivated profiles (`is_active=false`), stale roles, and DB lookup errors with `{ error: 'Unauthorized.' }`. Client mutations strictly reject non-clients and deactivated accounts.
- Anti-enumeration: cross-client ticket interactions and foreign profile edits return opaque 404 responses (`'Ticket not found.'` / `'Client not found.'`).
- Bearer routes: `/api/cron/email-outbox`, `/api/cron/r2-retention`, and `/api/revalidate` strictly enforce length-guarded Bearer authorization and fail closed when tokens or configuration are omitted.
- Latent export governance: 3 latent server actions (`uploadAssetAction`, `getTicketAttachmentPresignAction`, `confirmTicketAttachmentAction`) remain compiled for API stability but enforce full caller authorization gates.

## Email outbox lifecycle, authority verification, and retry backoff (Issues #38, #41 / E01): 16 September 2026

Verification suite `tests/reliability/email-outbox-lifecycle.test.mjs` (25 cases) confirms:
- Template rendering & payload contracts (`renderOutboxEvent`): validates exact subjects and deep links for all 6 lifecycle events (`new-ticket`, `reply-posted` admin and client audiences, `status-changed`, `deliverable-uploaded`, `invoice-issued`, `payment-confirmed`); rejects invalid currencies, malformed amounts, and unsupported templates.
- Strict site origin parsing: accepts only clean HTTPS origins (or loopback HTTP for localhost/127.0.0.1); rejects non-root paths, query strings, hash fragments, and embedded credentials with fail-closed `render_failed` error.
- Bounded queue draining: budget is clamped between 1 and 3; empty queues exit without overhead; `claim_email_event` DB errors fail closed.
- Two-phase delivery authority (`email_dispatch_recipient`): rechecks profile activity, role matching, bans, and resource ownership before envelope rendering and immediately before Resend transport; rejects and suppresses events if authority changes in-flight; enforces that frozen retry envelopes strictly match the recipient's current normalized Auth address to prevent emailing reassigned addresses.
- Idempotency & 409 conflict taxonomy: Resend 409 `concurrent_idempotent_requests` defers (`state='pending'`); 409 `invalid_idempotent_request` (payload conflict) or unknown categories fail permanently (`state='failed'`); oversized 409 responses (> 4096 bytes) and non-JSON fail closed; 429 and 5xx defer; 400 fails permanently.
- Transport timeout & network recovery: AbortSignal timeouts map to `provider_timeout` (`state='pending'`); disconnects map to `provider_unavailable` (`state='pending'`).
- Configuration and persistence guardrails: missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL` defers with `configuration_unavailable`; envelope persistence failure defers with `audit_unavailable`; outcome persistence failure throws fail-closed error.
- Cron endpoint security (`GET /api/cron/email-outbox`): requires valid `Bearer <CRON_SECRET>`; returns 401 on unauthorized calls; returns 503 on deferred/failed events; returns 200 on clean drain; emits `Cache-Control: no-store`.
- Diagnostic redaction & legacy isolation: ensures no private bodies, tokens, or raw provider strings enter `email_outbox` or `email_log`; verifies compatibility `sendEmail` helper refuses transport to prevent duplicate sends.

## Intake and consent diagnostic contracts (Issue #45 / I01 / I02): 16 September 2026

Verification suite `tests/reliability/intake-consent.test.mjs` (11 cases) and `tests/wave-one.test.mjs` (80 cases) confirm:
- Intake NDA contract (I01): `parseNdaValues` in `lib/contact/intake-contract.ts` accepts omitted entries (`[]`), empty strings (`''`), literal `'false'`, literal `'true'`, and exact legacy copy (`'Yes - NDA or strict confidentiality required'`); strictly rejects unknown strings (`'yes'`, `'TRUE'`, `'1'`), duplicate entries (`['true', 'true']`), and file blobs with 400 `NDA_ERROR`.
- Whole-dollar USD budget contract (I02): `parseBudgetRange` accepts both blank or whole numbers between 0 and 10,000,000 USD where `min <= max`; strictly rejects decimals (`1.5`), exponents (`1e3`), hex (`0x10`), currency codes (`100USD`, `$100`), explicit signs (`+1`, `-1`), commas (`1,000`), negative values, inverted ranges (`min > max`), asymmetric blanks, and duplicate fields with `BUDGET_ERROR`.
- Explicit consent contract (Issue #45): requires exactly one `gdprConsent` field containing literal `'true'`; rejects omitted, empty, `'false'`, non-literal truthy values (`'1'`, `'on'`, `'TRUE'`), and duplicate fields with 400 `'Please agree to the Data & Privacy policy before submitting.'`; produces server-generated ISO `consent_at` timestamp evidence while discarding wire overrides.
- Turnstile replay & verification: verifies token with Cloudflare siteverify endpoint; enforces 300s single-use replay protection via `consume_rate_limit(p_kind='turnstile')`, rejecting replayed tokens with 400 `'Verification token already used. Please reload the form.'`.
- IP rate controls: limits submissions to 5 per hour per IP hash (`consume_rate_limit(p_kind='ip')`), returning 429 when exhausted; fails closed with 503 if RPC errors occur.
- Configuration and origin guardrails: missing `LEAD_IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`, or Supabase configuration returns 503 fail-closed; cross-origin requests return 403.
- Attachment validation & scope: enforces 5-file cap, 1 byte to 10 MB limits, `contact/{uuid}/{uuid}.{ext}` schema, and byte-exact R2 HEAD checks (`verifyStoredObjectSize`); drops client-submitted `retained` flags.
- Lead persistence & error masking: returns server-issued `TKT-<number>` reference only after successful insert; database errors mask internal Postgres diagnostics behind generic 502 copy.

## Thread keyset pagination and microsecond cursor invariants (Issue #44 / T01): 16 September 2026

Verification suite `tests/reliability/thread-keyset-pagination.test.mjs` (14 cases) and `tests/reliability/thread-pagination.test.mjs` (8 cases) confirm:
- 50-message bounded windows & 51-row lookahead: queries fetch up to 50 visible items with `limit(51)` to verify `olderCursor` presence without an extra `COUNT(*)` database scan; empty threads return clean empty arrays; exactly 50 messages produces no older cursor; exactly 51 messages triggers an older cursor lookahead.
- Deterministic compound keyset tiebreakers: cursor filters combine `created_at` with `id` (`created_at.lt.X,and(created_at.eq.X,id.lt.Y)` and `created_at.gt.X,and(created_at.eq.X,id.gt.Y)`), deterministically resolving sub-second timestamp collisions across page boundaries without skipping or duplicating records.
- Cursor tampering & injection protection: `decodeThreadCursor` enforces Base64url encoding, ticket binding (`x.ticketId === ticketId`), strict key allowlist (`createdAt,direction,id,ticketId,v`), UUID format, and ISO timestamp grammar; rejects PostgREST filter injection in `id` or `createdAt`, non-UTC offsets, invalid calendar dates (e.g. Feb 30), standard base64 padding/characters (`=`, `+`, `/`), and extra JSON keys.
- Caller scoping & anti-enumeration: `getOwnTicketThread` verifies client ownership before querying messages; unowned or foreign tickets return opaque 404 (`'Ticket not found.'`) with 0 queries to `ticket_messages`.
- Error classification: database failures return retryable `{ ok: false, kind: 'unavailable', error: 'Could not load messages.' }`, preventing false 404 errors during transient outages.
- Author profile hydration: joins `profiles!ticket_messages_author_id_fkey(full_name, role)`, accurately distinguishing `'admin'` from `'client'` roles, and safely falling back to `author_name: null, author_role: 'client'` when profile records are missing.

## Privileged account protection and administrator invariants (Issue #40 / U01): 16 September 2026

Verification suite `tests/reliability/privileged-account-protection.test.mjs` (12 cases) confirms:
- Dual-store role synchronization & protection: protects administrator accounts across all combinations of Supabase Auth `app_metadata.role` and PostgreSQL `public.profiles.role` (`['admin', 'admin']`, `['admin', 'client']`, `['client', 'admin']`, `[undefined, 'admin']`); `inviteClient` and `convertLead` reject targeting any admin account with `'That email belongs to an admin account.'` or `'That email belongs to a protected account.'`, queuing 0 emails and performing 0 profile or auth mutations.
- Admin deactivation refusal: `setClientActive` and `setClientActiveAction` enforce `profile.role === 'client'`; any attempt to deactivate or reactivate an admin account fails closed with `'Client not found.'`, performing 0 database updates and 0 Auth `updateUserById` ban calls; admins cannot deactivate themselves or any other administrator.
- Input validation: `setClientActive` strictly rejects non-boolean `active` parameters (`'false'`, `'true'`, `null`, `undefined`, integers) with `'Invalid account state.'`.
- Lead conversion safety: `convertLead` checks if the lead's email matches an admin in either store, refusing conversion, leaving `converted_client_id: null` and status `'new'`, and preserving the admin account completely unchanged.
- Profile field scoping: during onboarding, name and company updates in `profiles` are strictly filtered on `.eq('role', 'client')`; database errors during profile updates return safe recovery guidance without leaking internal database diagnostics.
- Directory separation: `listClients` filters exclusively on `profiles.eq('role', 'client')`, ensuring that no administrator accounts are ever leaked or enumerated in client listings.
- Fail-closed partial state transitions:
  - Deactivation: profile is deactivated first (advancing the `tokens_valid_after` token cutoff); if the subsequent Auth ban call fails, returns `'Portal access is disabled. Sign-in blocking failed; retry deactivation.'` while keeping the profile deactivated (fail-closed).
  - Reactivation: Auth unban is executed first; if unban fails, the profile is never activated, returning `'Reactivation failed. Account remains disabled.'` (fail-closed).
- Session authority & drift rejection: `getCurrentSession()` requires both Auth JWT claims and the live `profiles` record to agree on role (`role === 'admin'` or `'client'`) and requires `profile.is_active === true`; any role drift or deactivated state immediately returns `null`.

## Retained storage, verified archive integrity, and recoverable project purge (Issue #30 / S02): 16 September 2026

Verification suite `tests/reliability/verified-archive.test.mjs` (16 cases) confirms:
- Project archive integrity & zip-slip protection: `archiveProject` assembles manifests (`project.json`, `milestones.json`, `files.json`, `recovery.json`); customer display filenames remain solely within metadata JSON, while ZIP internal entries strictly use immutable IDs (`files/${file.id}`) to prevent path traversal; verifies that each R2 source object byte length matches database `file.size_bytes`; uploads archive to `archive/project_${projectId}/verified_${uuid}.zip` and conducts mandatory SHA-256 and byte length readback verification before invoking `mark_project_archived` RPC.
- Concurrency & drift protection: `archiveProject` rejects already archived projects (`'Project already archived.'`), malformed UUIDs (`'Project not found.'`), and concurrent project modifications detected during `mark_project_archived` (`'Project changed during archive. Source data is preserved; retry after review.'`), preserving source records upon any failure.
- Financial retention blocker: `purgeArchivedProject` checks for linked invoices in both the application layer and the atomic database transaction; projects with linked invoices (regardless of invoice state — draft, sent, paid, or void) strictly refuse deletion with `'Project has retained invoices and cannot be purged.'`; database lookup errors fail closed with `'Financial retention check unavailable.'`.
- Unarchived project refusal: `purgeArchivedProject` rejects unarchived projects with `'Project is not archived.'`.
- Purge idempotency & recovery verification: if `project_recovery` already contains a recovery record for the project, returns `{ ok: true }` without repeating operations; computes round-trip SHA-256 and length readback on the uploaded recovery ZIP, aborting with `'Could not verify recovery backup. Project and source files were not purged.'` if readback bytes differ.
- Atomic cleanup transaction: `prepare_project_cleanup` verifies snapshot equality under row locks, inserts a verifiable record into `project_recovery`, queues each file's key into `storage_deletions(source='project')`, and cascades project deletion only after recovery is durably verified.
- Archive download presigning: `getArchiveDownloadUrl` generates 60-second presigned GET URLs for verified archives; rejects unarchived projects (`'Project is not archived.'`) or missing records; masks R2 signing errors behind `'Archive download unavailable.'`.
- Admin action boundaries: `archiveProjectAction`, `purgeArchivedProjectAction`, and `archiveDownloadUrlAction` require active administrator authority (`requireAdmin()`), rejecting unauthenticated, client, and inactive admin callers with `{ error: 'Unauthorized.' }` and revalidating Next.js project paths on success.

## Deployment and rollback

Do not run a remote migration from CI. Validate all old migrations plus 0018 against a fresh disposable database and representative synthetic data. Before an authorized production release, take and verify a backup; apply additive 0018 before deploying the dependent application. Roll back application code if needed, retaining the additive table/functions and existing data. Never reset production or delete submission identities as a rollback shortcut.




