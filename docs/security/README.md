# Security Hardening & Repository Security

This document covers the application-layer hardening (Phases 5a/5c), the
lifecycle-email audit trail (Phase 5b), and the repository-level security
controls (scanners, secrets, dependencies, branch protection) that guard every
change going forward.

## Audit Findings and Fixes

The audit identified the following verified issues, all addressed in this phase:

| Finding | Severity | Fix (Task) |
|---------|----------|------------|
| Presigned PUT does not sign `ContentLength`; declared size is advisory | Critical | Task 2: sign size in `presignPrivatePut` and `presignContactUpload`; verify stored size at confirm time via `verifyStoredObjectSize` |
| File download (`getOwnedFileUrl`) and deletion skip `is_active`; no session revocation on deactivation | Critical | Task 3: add `is_active` check to `getOwnedFileUrl`/`deleteOwnedFile`; revoke sessions in `setClientActive(false)` and `setClaimRole` |
| Client ticket/message INSERT policies bypass app-level caps | Important | Task 1: drop `tickets_insert_own` and `ticket_messages_insert_own_in_own_ticket` |
| Admin `FOR ALL` invoice policies and unguarded `status`; payment DELETE allowed | Important | Task 1: replace with `FOR SELECT`; add `status` guard to `guard_invoice_lock`; add `guard_payment_delete` + cascade marker |
| `requireAdmin` claim-only; no revocation on demotion | Important | Task 3: re-check `profiles.role` and `is_active` in `requireAdmin` |
| Client-facing errors leak DB/storage detail | Important | Task 4: replace all interpolated errors with fixed copy; log details server-side |
| Ticket-presign uses in-memory limiter (not fail‑closed) | Important | Task 4: replace with DB-backed `consume_rate_limit` (`presign-portal`); fail-closed on RPC/salt errors |
| `files` attachment CHECK contradicts pending path | Important | Task 1: replace CHECK to allow `ticket_id IS NULL` only when `r2_key LIKE '%/pending/%'` |
| `createFileRow` accepts contact keys for portal files; no key/project match | Important | Task 4: require `isPortalKey` for portal file rows; verify `project_<id>` segment in `confirmDeliverableAction` |
| Missing same-origin check on ticket-presign | Minor | Task 4: add same-origin check |

## Enforcement Model

The hardening introduces four main enforcement layers:

1. **Signed upload size** – Every presigned PUT now includes `ContentLength`; R2 rejects mismatched sizes. At confirm time, `verifyStoredObjectSize` does a `HeadObject` check and rejects mismatches with a generic error.

2. **Active-client chokepoint** – `getOwnedFileUrl` and `deleteOwnedFile` now check `profiles.is_active` for clients before granting access. Deactivation (`setClientActive(false)`) and role demotion (`setClaimRole`) call the auth admin sign-out API, revoking sessions immediately.

3. **Service-role‑only mutations** – Direct REST writes to tickets, invoices, items, payments, and status fields are removed. All writes go through controlled RPCs (`send_invoice_atomic`, `void_invoice_atomic`, `confirm_invoice_payment_atomic`, `recompute_invoice_status`) that set transaction-local markers to pass the new `guard_invoice_lock` (which guards `status` and financial fields). Payment deletions are only allowed when triggered by invoice cascade (via `mark_invoice_payment_cascade`).

4. **Fail‑closed generic errors + DB‑backed limits** – Every client-reachable error path returns a fixed, non‑disclosing message; details are logged server‑side. Ticket-presign uses the `consume_rate_limit` RPC with kind `'presign-portal'` (60s, 3 requests) and denies on any failure (missing salt, RPC error). Portal file keys are strictly validated: deliverable/attachment keys must pass `isPortalKey`, and `confirmDeliverableAction` verifies the key's `project_<id>` segment matches the target project.

## Probe Matrix

All probes from Tasks 1–4 were run against the remote Supabase project and R2, using temporary users, projects, invoices, tickets, and files. Every probe passed as expected; failures are noted below.

| Task | Probe | Expected | Result |
|------|-------|----------|--------|
| 1 | Client POST /rest/v1/tickets | Denied (403) | ✅ |
| 1 | Client POST /rest/v1/ticket_messages | Denied (403) | ✅ |
| 1 | Admin PATCH invoice status (direct) | No rows updated (status unchanged) | ✅ |
| 1 | Admin DELETE payment (direct) | Payment remains (guard prevents) | ✅ |
| 1 | Service-role send→submit→confirm→cascade | All succeed; cascade deletes items/payments | ✅ |
| 1 | Pending attachment with `/pending/` and `ticket_id NULL` | Succeeds | ✅ |
| 1 | Non-pending attachment with `ticket_id NULL` | Fails CHECK | ✅ |
| 2 | PUT exact declared size | Succeeds | ✅ |
| 2 | PUT one byte more than declared | R2 rejects (signature mismatch) | ✅ |
| 2 | PUT smaller than declared | R2 rejects | ✅ |
| 2 | Presign 1 KB, PUT 1 KB, confirm with declared 10 MB | `verifyStoredObjectSize` rejects | ✅ |
| 3 | Active client downloads own deliverable | 302 presigned URL | ✅ |
| 3 | Deactivate, same session download | 404 (generic) | ✅ |
| 3 | Deactivated client cannot obtain new session | Bounce / login with deactivated reason | ✅ |
| 3 | Reactivate → download works | 302 again | ✅ |
| 3 | Demote admin → old session refused on admin action | 401/Unauthorized | ✅ |
| 3 | Admin download of any file | 302 | ✅ |
| 4 | Cross-origin POST to /api/uploads/ticket-presign | 403 | ✅ |
| 4 | 4 presign calls in 1 minute for one client | 4th denied by DB limiter (429) | ✅ |
| 4 | Force DB failure (e.g. missing salt in scratch) | Request denied (503) | ✅ |
| 4 | Trigger each former leak path | Response body contains no DB/storage text | ✅ |
| 4 | `confirmDeliverableAction` with key from different project | Rejected | ✅ |
| 4 | `contact/…` key rejected for deliverable row | Rejected by `isPortalKey` check | ✅ |
| 4 | Normal ticket attachment and deliverable flows | Succeed | ✅ |

All probes are self‑contained and cleaned up after each run; no persistent fixtures remain.

## P5c Hardening Close-out (Shipped)

The following residual items shipped in Phase 5c (`feat/p5c-consolidation-assets`,
Task 5 — code in the task commit, `'otp-ip'` kind in follow-up migration
`0017_otp_rate_kind.sql`, already applied in production):

- **Env-derived CSP Supabase origin** – `next.config.js` no longer hardcodes the
  project ref. `connect-src` interpolates the origin parsed from
  `NEXT_PUBLIC_SUPABASE_URL` (`new URL(...).origin`, try/catch fallback to no
  origin); the R2 derivation is unchanged. Verified: no project-ref string
  remains in the file.
- **Hardened SSR cookies** – every server-side cookie write in `lib/supabase/`
  sets `httpOnly: true`, `secure` in production only, and `sameSite: 'lax'`
  (merged over the Supabase SSR defaults).
- **OTP throttling** – `requestMagicLinkAction` and
  `consumeMagicLinkTokenAction` call `consume_rate_limit('otp-ip',
  <salted-IP-hash>, 300, 5)` using the existing `LEAD_IP_HASH_SALT` salt
  pattern, fail-closed with generic `Too many requests. Please try again
  later.` on missing salt or RPC error. No PII is logged.

Note: the `'otp-ip'` rate-limit kind is allowed by the
`rate_limits_kind_check` constraint via migration `0017_otp_rate_kind.sql`
(kinds: `ip`, `turnstile`, `presign-ip`, `presign-portal`, `otp-ip`), already
applied in production — OTP throttling is live, and the limiter only fails
closed on genuine RPC/salt errors. Verified end-to-end: 5 rapid
`consume_rate_limit('otp-ip', …)` calls allowed, 6th denied — see the Task 5
report.

## Residual Risks (Tracked, Not Deferred Phases)

All planned phases (P1 → P5c) are shipped. What remains is continuous and
operational rather than phased work:

- **Staging browser probes** (cross‑client, payment UI, print, `/admin/assets`
  upload/delete click-through, `/admin/emails` as admin vs client) — blocked
  historically by missing Chromium; run in staging with a real browser.
- **`email_log` grows unbounded** — no retention policy yet (unlike R2 objects).
  Decide a window (e.g. 365 days) and add a cron purge.
- **No bounce or complaint handling** — Resend webhooks are not wired, so a hard
  bounce after a `sent` row leaves the log optimistic.
- **Deactivation does not stop email** — a deactivated client with a pending
  invoice still receives lifecycle mail.
- **`HANDOFF_MARKER` string coupling** — editing that sentence reclassifies
  historical handoff rows; a `delivery_confidence` column would be cleaner.
- **Preview deployments inherit production `NEXT_PUBLIC_SITE_URL`** — preview
  emails carry production links. Scope the variable per Vercel environment.
- **`emailOrigin` has no scheme check beyond `https?`** and `adminRecipients()`
  fans out serially against Resend's 10 req/s default — fine at current scale.
- **Dependabot is continuous** — 0 open alerts as of the last sweep; new CVEs
  arrive weekly via the scheduled scans. Triage new highs within 7 days.

## Repository Security Controls

Every push and pull request to `main` runs both scanners; results land in the
[Security tab](https://github.com/redwan-cse/redwan.work/security):

| Control | Configuration |
|---|---|
| CodeQL SAST | Default setup, `javascript-typescript` + `actions`; runs on push/PR + weekly |
| Semgrep SAST | `.github/workflows/semgrep.yml` (`auto` ruleset: OWASP, security-audit, secrets); SARIF uploaded to the same tab |
| Action pinning | All `uses:` refs pinned to full commit SHAs (Semgrep flags mutable tags) |
| Secret scanning | Enabled, with push protection (secret-bearing pushes are blocked) |
| Dependabot | Alerts + security updates enabled; swept to 0 open alerts (next 16.3.4, sharp 0.35.4) |
| Branch protection | `main` requires CodeQL + Semgrep checks (strict), no force-push/deletion, no reviewer requirement (solo project) |
| Vulnerability reporting | Private reporting enabled; public policy in [`SECURITY.md`](../../SECURITY.md) |

### SAST findings to date (all closed)

| # | Rule | File | Resolution |
|---|---|---|---|
| 1 | `js/double-escaping` | `lib/blogger.ts` (`extractExcerpt`) | Fixed — `&amp;` now decodes last, giving true single-pass semantics |
| 2 | `js/incomplete-multi-character-sanitization` | `lib/blogger.ts` | False positive in context (sole consumer renders JSX text, React-escaped; verified no `dangerouslySetInnerHTML` on the path) — documented in code, dismissed with justification |
| 3–7 | Unpinned GitHub Actions | `.github/workflows/*.yml` | Fixed — all refs pinned to SHAs |
| 8 | `unsafe-formatstring` (note) | `lib/email/index.ts` | Fixed — constant format string |

Alerts auto-resolve when the fix lands on `main`; false-positive dismissals are re-evaluated per analysis and re-dismissed with the same recorded justification if a finding reappears on moved lines.

## Operator Notes

- **Deactivation now revokes sessions**: when `setClientActive(clientId, false)` is called, the auth admin sign‑out API is invoked. The caller receives an error if revocation fails, preventing a scenario where a deactivated user might hold a live session.
- **Service‑role RPCs are the only write path** for tickets, invoices, items, payments, and file status. Any direct REST mutation will be rejected by RLS or guard triggers.
- **Client‑facing errors are generic** – if you need to debug, inspect the server logs (console.error) which contain the original error details.
- **Migration ordering**: `0014_security_hardening.sql` applies the core hardening; `0015_presign_portal_rate_kind.sql` adds the rate‑limit kind for ticket‑presign; `0016_email_log.sql` adds the email audit table; `0017_otp_rate_kind.sql` adds `'otp-ip'` for OTP throttling. All are forward‑only and already applied in production.
- **Probe environment**: all probes run against the live Supabase project and R2; they create and delete temporary resources. No real customer data is touched.

## Related Documentation

- [CRM Core README](../crm/README.md) – operational guide and probe matrix for earlier phases.
- [Auth README](../auth/README.md) – authentication model and session handling.
- [R2 README](../r2/README.md) – object storage and presigned URLs.
