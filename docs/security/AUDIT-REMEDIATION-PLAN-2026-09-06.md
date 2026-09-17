# Audit remediation and production-readiness plan

Date: 2026-09-06. Audited baseline: `d4b2b3fa2037dd493051564abe070a17900856b3` on main. PR #27 was reviewed separately at `9ec956e826dda07ae6852bc00be586f0840d989c` and remains unmerged.

## Purpose and authority

Move from a portfolio/full-stack prototype toward a dependable service for direct clients. The owner approved publication of twenty sanitized finding trackers and this plan on a documentation-only branch. This does not authorize implementation, migrations, PR creation/merging, deployment or production mutation. Every main push auto-deploys and needs separate explicit approval.

The source audit identified 2 Critical, 14 Important and 4 Minor findings. Release sign-off was withheld. The detailed report is held separately by the owner; do not copy sensitive evidence, exploit steps or private attachment links into this public repository. Follow SECURITY.md for confidential reporting.

## Evidence limits

The expected main commit was confirmed through GitHub. Core source, all 17 migrations and related contracts were inspected. A few dependency-free predicate checks ran, but this was not an executed full-project production audit. No local checkout, npm, linked Supabase CLI, browser, real mailbox or network-enabled shell was available. Live HTTP, database, storage, account and baseline build probes remain unverified. Historical green documentation is not current execution evidence. No production fixtures were created and no production zero-count sweep was claimed.

Current audit outcomes are a release-planning baseline, not a claim of actual compromise or historical data loss. No code or applied migration was changed by this publication.

## Finding trackers

| Reference | Severity | Tracker |
|---|---|---|
| F01 | Critical | [Authorization lifecycle verification](https://github.com/redwan-cse/redwan.work/issues/29) |
| F02 | Important | [Session lifecycle and recoverable transitions](https://github.com/redwan-cse/redwan.work/issues/28) |
| F03 | Critical | [Recoverable, dependency-aware cleanup](https://github.com/redwan-cse/redwan.work/issues/30) |
| F04 | Important | [Contact attachment acceptance](https://github.com/redwan-cse/redwan.work/issues/31) |
| F05 | Important | [Consistent attachment confirmation](https://github.com/redwan-cse/redwan.work/issues/37) |
| F06 | Important | [Client-facing failure responses](https://github.com/redwan-cse/redwan.work/issues/34) |
| F07 | Important | [Persistent abuse-control failure behavior](https://github.com/redwan-cse/redwan.work/issues/35) |
| F08 | Important | [Framework and hosted upload limits](https://github.com/redwan-cse/redwan.work/issues/32) |
| F09 | Important | [Atomic ticket and attachment accounting](https://github.com/redwan-cse/redwan.work/issues/33) |
| F10 | Important | [Partial object-deletion reconciliation](https://github.com/redwan-cse/redwan.work/issues/36) |
| F11 | Important | [Complete retention inventories](https://github.com/redwan-cse/redwan.work/issues/43) |
| F12 | Important | [Durable lifecycle email traceability](https://github.com/redwan-cse/redwan.work/issues/38) |
| F13 | Important | [Independent release quality gates](https://github.com/redwan-cse/redwan.work/issues/39) |
| F14 | Minor | [Documentation reconciliation](https://github.com/redwan-cse/redwan.work/issues/41) |
| F15 | Minor | [Obsolete upload action consolidation](https://github.com/redwan-cse/redwan.work/issues/42) |
| F16 | Important | [Privileged account protection in onboarding](https://github.com/redwan-cse/redwan.work/issues/40) |
| F17 | Minor | [Bounded CRM listing work](https://github.com/redwan-cse/redwan.work/issues/44) |
| F18 | Important | [Structured diagnostic redaction](https://github.com/redwan-cse/redwan.work/issues/46) |
| F19 | Minor | [Attachment sharing/removal semantics](https://github.com/redwan-cse/redwan.work/issues/47) |
| F20 | Important | [Consent submission and recording contract](https://github.com/redwan-cse/redwan.work/issues/45) |

## Dependency-ordered remediation proposal

1. **Verification baseline: F13/F14.** Re-read current AGENTS.md and AUDIT-PLAN.md in an authorized checkout. Establish exact branch state, current scanner inventories, required checks, dependency versions, clean build and isolated staging. Capture raw redacted evidence. No automated implementation is authorized.
2. **Account authority: F01/F02/F16.** Review account lifecycle, role synchronization and read/write access together. Preserve approved dual role storage and ownership isolation. Changes to database policy must be forward-only and separately reviewed.
3. **Recovery and retention: F03/F10/F11.** Define financial dependencies, complete inventories, per-object outcomes and recoverable cleanup before irreversible work. Verify backup integrity and failure behavior with disposable staging data. Do not silently change accounting retention.
4. **Attachment and abuse contracts: F04/F05/F07/F08/F15.** Align actual entry points with shared validated contracts. Verify namespace, metadata, persistent budgets, framework settings and hosting boundaries independently.
5. **Transactional workflows and diagnostics: F09/F06/F18/F20.** Couple persistence and retries safely, standardize public responses, redact diagnostics, and record the submitted consent accurately. Include concurrency and injected-failure tests.
6. **Email traceability: F12 with F18.** Keep business operations fail-soft while tracking event outcomes durably and preventing duplicate sends. Test local renderers separately from external invitation delivery. Define timeout ambiguity and reconciliation.
7. **Usability and scale: F17/F19.** Measure list completeness/cost and make attachment UI state truthful. Resolve operational decisions with the owner rather than inventing product policy.
8. **Close-out: F14/F13.** Reconcile docs after verified fixes, complete every runbook check, and reconsider PR #27 and main release sign-off separately.

## Subsequent 2026 plan-gap review

Read-only review: map all available 2026 changes, original plans and follow-up decisions against complete direct-client journeys. Preserve context and distinguish implemented behavior from proposals and historical assertions. Compare public site, enquiry, onboarding, account lifecycle, project delivery, support, files, invoicing/payment tracking, communication, retention and recovery.

For each subsystem produce a keep / improve / reconstruct recommendation with commit/source evidence, user impact, dependencies, migration/recovery implications and estimated scope. Do not recommend a rewrite merely because earlier work used a different model or tool. Prefer targeted reconstruction where boundaries or invariants are unsound; preserve validated components. This review is not permission to implement those recommendations.

## Operational decisions still needed

Define email audit retention, inactive-client notification policy, bounce/complaint and ambiguous provider outcomes, environment-specific email origins, recipient fan-out limits and operational ownership. Verify backup/restore and deletion policies against business and accounting obligations. Do not invent historical consent or assume an absent record proves an event never happened.

## Required verification

Follow AUDIT-PLAN.md in order. Every result must distinguish source inspection, isolated execution, live execution, historical evidence and unavailable tests. Capture commit, environment, tool version, command, exit code, HTTP code or SQL count as appropriate. Never expose secrets, access tokens, signed URLs or client data.

- Clean dependency install, lint, typecheck, production build, dependency audit, scanner inventories and branch controls.
- Anonymous, active/inactive, changed-role and cross-client access across UI, APIs, server actions and database boundaries.
- Negative direct writes plus valid financial transaction, concurrency and cascade behavior in a safe environment.
- Actual upload/confirmation/download byte checks, MIME/type/size boundaries and admin UI workflows.
- Lifecycle event outcomes, generic error handling, redacted logging, mailbox delivery and audit completeness.
- Production header configuration, safe read-only reachability checks, deployment evidence and documented rollback.
- Backup integrity, retention completeness, failure recovery and fixture cleanup evidence.

New-format Supabase publishable/secret keys only. Keep applied migrations 0001-0017 byte-identical. No production reset, destructive migration or broad cron invocation as an audit probe. Any production mutation requires a verified backup, exact authorized scope and recoverable procedure. Use synthetic ...@example.test fixtures; authorize and delete only those fixtures, with exact post-cleanup evidence.

## Branch housekeeping

At inspection, four branch tips matched their merged PR heads: docs/security-refresh (#26), fix/blogger-excerpt-sanitization (#25), feat/dependabot-fixes (#24), feat/security-scanning (#23). Deletion was requested but cannot be performed through the available connection. They were not deleted. Recheck their tips and merged status before manual deletion.

Preserve main, cleanup/contact-legacy-payload (#27), the four open Dependabot PR branches pending supersession review, and this new documentation branch. No PR was closed or merged by this publication.

## Release decision

Not ready for a new release on the audited evidence. Close Critical findings with verification, resolve or explicitly accept Important risks, triage outstanding security outcomes and execute the unavailable gates. Scanner success alone is insufficient. This plan is not an instruction to shut down production or alter any live setting.

## Audit remediation status and branch retirement (17 September 2026)

Findings F01 through F19 across open backlog issues #28–#47 have been remediated, verified with automated regression tests, and merged into `main` via PR #56 (Merge commit `432c7d1`).

### F20 (Consent Policy Integration / I03) Approved Deferral
Finding F20 is intentionally deferred and not claimed as active in production:
- In `lib/contact/consent-policy.ts`, `CONSENT_ACTIVATION_ENABLED = false`.
- Intake route `app/api/contact/route.ts` validates explicit consent presence, but is not wired to database-backed multi-version consent registry gating.
- Test suites in `tests/reliability/consent-writers-db.py` use synthetic bypasses for isolated contract validation only.
- Full activation requires future database schema additions, published policy bundles, and explicit owner approval.

### Follow-up Audit Remediation (Branch `fix/audit-followup-remediation`)
Following current-source audit on `main` (commit `31ff564`), four specific technical limitations were resolved:
1. **Blogger Pagination, Cache Bounds & Cap Disclosure** (`lib/blogger.ts`, `app/blogs/page.tsx`):
   - Honest post collection up to `MAX_POSTS_FETCH` (300) so Page 1 displays accurate total items and renders pagination controls.
   - Explicit disclosure of 300-post cap in blog header badge (`300+ Articles`), explanatory note (`Archive display is capped at the latest 300 articles`), and pagination summary (`Showing 1-9 of 300+`) so visitors are informed the listing is capped rather than complete.
   - Non-overlapping window slicing `(page - 1) * perPage` eliminating tail overlap duplication on later pages.
   - Bounded in-memory cache (max 50 entries) with expired-key sweep, LRU eviction, and in-flight request deduplication.
   - Verified by 11 unit tests in `tests/reliability/blogger-pagination.test.mjs`.
2. **Recovery & Invite Session Proof Binding** (`lib/auth/actions.ts`):
   - Cryptographic session proof cookie (`recovery_proof` / `invite_proof`) set on initial `verifyOtp` success, binding the user ID and token hash with 300s TTL.
   - On retry after single-use OTP consumption, verifies active session user, proof cookie, and hash match before invoking `updateUser`. Rejects unrelated sessions, expired sessions, wrong users, and wrong tokens fail-closed with `INVALID_LINK`. Cookie proof deleted on successful update.
   - Verified by stateful unit tests in `tests/reliability/recovery-controls.test.mjs` covering unrelated active sessions, expired proof cookies, wrong-user sessions, and wrong-token submissions.
3. **Build Manifest & Route Verification** (`scripts/audit-manifests.mjs`, `tests/reliability/caller-inventory.test.mjs`, `tests/reliability/verify.py`):
   - Separated post-build manifest verification (`node scripts/audit-manifests.mjs`) checking all 41 Server Actions and 8 API routes against built manifests.
   - Tested real `public-asset-actions.ts` with leaf R2 upload mock in caller inventory unit tests.
4. **Evidence Ledger Reconciliation**:
   - Reconciled F20 deferral status and trust-boundary limits across documentation.

## Criterion-Level Evidence Matrix (F01–F19 & F20)

Every remediated finding has concrete, automated verification linking the issue obligation to its source mechanism and executing test suites:

| Ref | Issue Tracker | Criterion / Obligation | Enforcing Source Files | Automated Test Suites | Verification Assertion |
|---|---|---|---|---|---|
| **F01** | [#29](https://github.com/redwan-cse/redwan.work/issues/29) | Authorization lifecycle verification: active vs inactive accounts separated, cross-tenant/cross-client boundaries strictly enforced, and fail-closed RLS policies across DB tables. | `proxy.ts`, `lib/crm/workflow-access.ts`, `lib/crm/client-actions.ts`, `lib/crm/admin-actions.ts`, `lib/crm/tickets.ts`, `lib/crm/invoice-server-boundary.ts`, DB migrations `0001`–`0035` | `tests/reliability/caller-inventory.test.mjs`, `tests/reliability/admin-boundaries.test.mjs`, `tests/reliability/invoice-server-boundary.test.mjs`, `tests/reliability/workflows.test.mjs` | Unauthenticated or unauthorized callers receive deterministic rejection; client users cannot access admin endpoints; inactive accounts fail closed. |
| **F02** | [#28](https://github.com/redwan-cse/redwan.work/issues/28) | Session lifecycle and recoverable transitions: recovery and invite acceptance reject expired/tampered tokens and single-use retries without valid cryptographic proof; canonical relative return paths prevent open redirects. | `lib/auth/actions.ts` (`setNewPasswordFromRecoveryAction`, `acceptInviteAction`, `loginAction`, `getValidatedReturnPath`) | `tests/reliability/recovery-controls.test.mjs`, `tests/reliability/login-return.test.mjs`, `tests/reliability/account-lifecycle.acceptance.mjs` | Rejects password < 12 chars before token consumption; rejects unrelated active sessions, expired sessions, and wrong-user sessions on retry; enforces canonical relative return paths (`A01`). |
| **F03** | [#30](https://github.com/redwan-cse/redwan.work/issues/30) | Recoverable, dependency-aware cleanup: customer/project deletion preserves financial dependencies, audit archives, and related billing records before irreversible cleanup; manifest is verifiable. | `lib/crm/verified-archive.ts`, `lib/crm/invoices.ts`, `lib/crm/clients.ts`, `lib/crm/projects.ts` | `tests/reliability/verified-archive.test.mjs`, `tests/reliability/archive-storage.acceptance.mjs` | Verifies archival requirements before cleanup; prevents deletion when outstanding invoices or financial transactions exist; generates verifiable archive manifest. |
| **F04** | [#31](https://github.com/redwan-cse/redwan.work/issues/31) | Contact attachment acceptance: public contact form validates file sizes, extensions, MIME types, Turnstile token replay, and whole-dollar budget and exact legacy NDA wire formats. | `app/api/contact/route.ts`, `lib/contact/lead-schema.ts`, `lib/contact/lead-store.ts`, `lib/contact/intake-contract.ts` | `tests/reliability/contact.test.mjs`, `tests/reliability/contact-pipeline.acceptance.mjs`, `tests/reliability/intake-consent.test.mjs` | Rejects missing/malformed Turnstile token; enforces max file size and allowed MIME types; validates budget whole-dollar integer bounds [0, 10,000,000]; accepts exact legacy NDA string. |
| **F05** | [#37](https://github.com/redwan-cse/redwan.work/issues/37) | Consistent attachment confirmation: ticket file uploads confirm metadata, file existence, and attachment binding atomically in database before exposing attachment links. | `lib/crm/ticket-upload-actions.ts`, `lib/crm/attachments.ts`, `lib/crm/tickets.ts` | `tests/reliability/ticket-attachments.test.mjs`, `tests/reliability/storage.test.mjs` | Unconfirmed attachments are never visible; attachment records are atomically tied to ticket messages; size and MIME mismatches fail closed. |
| **F06** | [#34](https://github.com/redwan-cse/redwan.work/issues/34) | Client-facing failure responses: standardized error responses without internal sentinels, stack traces, raw SQL error strings, or provider diagnostics; stable user-friendly error codes. | `lib/crm/tickets.ts`, `lib/crm/projects.ts`, `lib/crm/invoices.ts`, `lib/auth/actions.ts` | `tests/reliability/project-errors.test.mjs`, `tests/audit-claim-challenges.mjs` | Database exception responses are mapped to generic, classified errors; internal SQL/PostgREST error codes and provider details are stripped. |
| **F07** | [#35](https://github.com/redwan-cse/redwan.work/issues/35) | Persistent abuse-control failure behavior: rate limiting, Turnstile verification, and abuse controls fail closed on configuration errors, missing secrets, or upstream failures; no persistence without checks. | `app/api/contact/route.ts`, `lib/auth/actions.ts`, `lib/supabase/admin.ts` | `tests/reliability/contact.test.mjs`, `tests/reliability/recovery-controls.test.mjs` | Missing `TURNSTILE_SECRET_KEY` or `LEAD_IP_HASH_SALT` fails closed; exhausted rate limits reject requests immediately with no database side effects. |
| **F08** | [#32](https://github.com/redwan-cse/redwan.work/issues/32) | Framework and hosted upload limits: body parser sizes, Next.js configuration, and Cloudflare R2 presigned URLs enforce strict size limits (max 10MB per attachment, 25MB request limit). | `next.config.mjs`, `lib/r2.ts`, `lib/contact/lead-schema.ts` | `tests/reliability/integrated-framework.test.mjs`, `tests/reliability/storage.test.mjs` | Enforces size ceilings; presigned URL generation validates content-length and bucket boundary restrictions; oversized payloads rejected before handler execution. |
| **F09** | [#33](https://github.com/redwan-cse/redwan.work/issues/33) | Atomic ticket and attachment accounting: ticket creation, message appending, and attachment association run within transactional boundaries without orphaned attachment references. | `lib/crm/ticket-upload-actions.ts`, `lib/crm/tickets.ts`, `lib/crm/attachments.ts` | `tests/reliability/ticket-attachments.test.mjs`, `tests/reliability/workflows.test.mjs` | Failed message writes revert attachment association; attachment count and quota increments match committed database transactions. |
| **F10** | [#36](https://github.com/redwan-cse/redwan.work/issues/36) | Partial object-deletion reconciliation: storage object deletions handle partial failure and provider errors without losing track of un-deleted files; database state remains consistent with storage. | `lib/crm/files.ts`, `lib/r2.ts`, `lib/crm/file-authority.ts` | `tests/reliability/file-deletion.test.mjs`, `tests/reliability/file-deletion-order.test.mjs` | Failed object deletions retain file records for subsequent cleanup retries; successful deletions prune metadata atomically. |
| **F11** | [#43](https://github.com/redwan-cse/redwan.work/issues/43) | Complete retention inventories: R2 retention sweep inventories expired objects across all namespaces without destructive unbounded sweeps or silent deletion of active files. | `lib/r2-inventory.ts`, `app/api/cron/r2-retention/route.ts`, `lib/crm/retention.ts` | `tests/reliability/inventory.test.mjs`, `tests/reliability/retention.test.mjs`, `tests/reliability/retention-lifecycle.test.mjs` | Inventory traverses multi-page object listings; expired candidates are verified against active ticket and project references before pruning. |
| **F12** | [#38](https://github.com/redwan-cse/redwan.work/issues/38) | Durable lifecycle email traceability: transactional emails are written to a durable database outbox table before dispatch; dispatch includes retry fences, idempotency keys, and failure tracking. | `lib/email/outbox.ts`, `app/api/cron/email-outbox/route.ts`, `lib/email/diagnostics.ts` | `tests/reliability/outbox.test.mjs`, `tests/reliability/outbox-cron.test.mjs`, `tests/reliability/email-outbox-lifecycle.test.mjs`, `tests/reliability/email-diagnostics.test.mjs` | Outbox rows record status (`pending`, `sent`, `failed`), retry attempts, and provider IDs; duplicate sends are fenced; payload failures are logged safely. |
| **F13** | [#39](https://github.com/redwan-cse/redwan.work/issues/39) | Independent release quality gates: automated quality gates run without credentials or ambient bypasses: strict TypeScript compilation, linting, production Next.js build, manifest auditing, and regression test suites. | `scripts/audit-manifests.mjs`, `package.json`, `.github/workflows/` | `scripts/audit-manifests.mjs`, `npm run lint`, `npx tsc --noEmit`, `npm run build` | Post-build manifest audit verifies all 41 server actions and 8 route handlers; build completes cleanly with zero type or lint errors. |
| **F14** | [#41](https://github.com/redwan-cse/redwan.work/issues/41) | Documentation reconciliation: project documentation, threat models, and operational runbooks accurately reflect actual implementation, retiring stale assumptions and explicitly recording evidence boundaries. | `docs/security/AUDIT-REMEDIATION-PLAN-2026-09-06.md`, `docs/security/ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md`, `docs/contact/README.md` | Doc review and criterion ledger tracking | Documents exact branch states, retired legacy flows, explicit consent contracts, and deferred items. |
| **F15** | [#42](https://github.com/redwan-cse/redwan.work/issues/42) | Obsolete upload action consolidation: obsolete and unverified upload server actions consolidated and protected; public asset actions use strict leaf validation and caller authorization. | `lib/crm/public-asset-actions.ts`, `lib/crm/ticket-upload-actions.ts` | `tests/reliability/public-assets.test.mjs`, `tests/reliability/caller-inventory.test.mjs` | Public asset upload actions validate file keys, reject path traversal, and enforce caller permissions; verified against build manifests. |
| **F16** | [#40](https://github.com/redwan-cse/redwan.work/issues/40) | Privileged account protection in onboarding: privileged administrator accounts are protected in both Auth and database stores (`profiles.role` and `raw_app_meta_data->role`); onboarding cannot overwrite admin roles. | `lib/crm/clients.ts`, `lib/auth/actions.ts`, `lib/crm/admin-actions.ts` | `tests/reliability/privileged-account-protection.test.mjs`, `tests/reliability/account-lifecycle.acceptance.mjs` | Deactivation or demotion of primary administrators is blocked; dual-store role parity is verified before granting administrative access. |
| **F17** | [#44](https://github.com/redwan-cse/redwan.work/issues/44) | Bounded CRM listing work: CRM ticket listings, thread histories, and public blog listings use keyset/cursor-based pagination or bounded queries, preventing unbounded memory consumption. | `lib/crm/tickets.ts`, `lib/blogger.ts`, `app/blogs/page.tsx` | `tests/reliability/thread-keyset-pagination.test.mjs`, `tests/reliability/thread-pagination.test.mjs`, `tests/reliability/blogger-pagination.test.mjs` | Keyset pagination queries enforce bounded page limits; Blogger pagination enforces 300-post cap, non-overlapping windowing, and discloses cap. |
| **F18** | [#46](https://github.com/redwan-cse/redwan.work/issues/46) | Structured diagnostic redaction: structured logging and error diagnostics redact sensitive client tokens, passwords, session hashes, email contents, and financial identifiers before logging or telemetry sinks. | `lib/email/diagnostics.ts`, `lib/crm/lead-diagnostics.ts`, `tests/r01-redaction.mjs` | `tests/reliability/diagnostic-redaction.test.mjs`, `tests/reliability/lead-diagnostics.test.mjs`, `tests/r01-redaction.mjs` | PII, tokens, and raw credentials in error objects are scrubbed with `[REDACTED]` markers; log output contains only safe diagnostic categories. |
| **F19** | [#47](https://github.com/redwan-cse/redwan.work/issues/47) | Attachment sharing/removal semantics: ticket attachment sharing, removal, and download URLs adhere strictly to access control rules; client removal does not delete shared files permanently without confirmation. | `lib/crm/attachments.ts`, `lib/crm/download-contract.ts`, `lib/crm/file-authority.ts` | `tests/reliability/ticket-attachments.test.mjs`, `tests/reliability/download-contract.test.mjs`, `tests/reliability/file-authority.test.mjs` | Presigned download URLs are scoped to authorized ticket holders; removal marks attachment records and respects ownership permissions. |
| **F20** | [#45](https://github.com/redwan-cse/redwan.work/issues/45) | **DEFERRED (Not activated in production)**: Consent submission and recording contract. Baseline contact intake enforces explicit consent checkbox and timestamp; multi-version policy bundle activation is intentionally held pending future database schema additions. | `lib/contact/consent-policy.ts`, `app/api/contact/route.ts` | `tests/reliability/consent-policy.test.mjs`, `tests/reliability/intake-consent.test.mjs` | Contact intake verifies affirmative consent checkbox; `CONSENT_ACTIVATION_ENABLED = false` holds policy registry gating pending future migration. |

### Branch retirement record
The four legacy audit/remediation branches have been retired and deleted from remote tracking:
- `cleanup/contact-legacy-payload` (PR #27): Legacy Google Forms entry payload removed; intake contract standardized in `lib/contact/intake-contract.ts` and `components/enhanced-contact-form.tsx`.
- `docs/audit-remediation-plan-2026-09-06`: Master finding trackers F01–F20 and remediation strategy preserved in this document.
- `fix/audit-quality-gates`: Quality gates, disposable Supabase database testing, and browser acceptance test suites merged into `tests/reliability/`.
- `fix/consent-diagnostic-contracts`: Consent contracts (I01/I02), explicit consent checks, Turnstile token replay guards, and diagnostic redaction merged into `main`.

All future development, features, and fixes will branch from fresh branches created from `main`.

