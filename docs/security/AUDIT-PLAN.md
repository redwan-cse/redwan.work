# Full-Project Audit Plan

A repeatable runbook for auditing **redwan.work** end to end — written so a
fresh session or a different coding agent can execute it with zero prior
context. Run it before a major release, quarterly, after any dependency bump,
or whenever the Security tab shows new findings.

**Repo:** `redwan-cse/redwan.work` (public) · **Live:** https://redwan.work
**Stack:** Next.js 16 App Router + React 19 + TypeScript strict · Tailwind 3 +
shadcn/ui · Supabase Postgres + Auth (`sb_publishable_` / `sb_secret_` keys
only) · Cloudflare R2 (public + private buckets) · Resend · Vercel
(auto-deploys from `main`) · Cloudflare Turnstile.

**How to use this document:** work areas in order (each builds on the trust
established by the previous one). Every area lists *files to read*, *commands
to run with expected results*, and *probes* where live verification is needed.
Record each result as ✅ / ❌ with evidence (command output, row counts,
HTTP codes). File findings per the rubric in §8.

**Standing rules for every probe run:**
- Never print secret *values* — env var *names* and presence only.
- No persistent fixtures: every temporary user, project, ticket, invoice,
  file, R2 object, and `email_log` row is deleted after probing, with a
  zero-count confirmation query at the end.
- Use synthetic addresses only (`…@example.test`); Resend's test mode rejects
  `example.com`, so use the verified sender as the sink for live-send probes.
- Redact PII from all notes (mask emails to `abc***@…`, truncate UUIDs).

## 0. Prerequisites

- [ ] Node 20+, `npm`, `gh` CLI (authenticated as repo owner), Supabase CLI linked to project `cqxtmzzlywolulechcob`.
- [ ] `.env.local` present with (names only — never paste values):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_BUCKET`,
  `R2_PUBLIC_ACCESS_KEY_ID`, `R2_PUBLIC_SECRET_ACCESS_KEY`,
  `R2_PRIVATE_BUCKET`, `R2_PRIVATE_ACCESS_KEY_ID`,
  `R2_PRIVATE_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`,
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`, `LEAD_IP_HASH_SALT`, `CRON_SECRET`,
  `BLOGGER_BLOG_ID`, `GOOGLE_CREDENTIALS_B64`, `NEXT_PUBLIC_SITE_URL`.
- [ ] Baseline gates green on a clean tree:
  `npm run lint && npx tsc --noEmit && npm run build`
- [ ] Production reachable: `curl -s -o /dev/null -w "%{http_code}\n" https://redwan.work/` → `200`.

## 1. Repository & supply chain

**Files:** `.github/workflows/*.yml`, `package.json`, `package-lock.json`,
`.gitignore`, `SECURITY.md`, `next.config.js` (headers section).

- [ ] 1.1 `gh api repos/redwan-cse/redwan.work/code-scanning/alerts?state=open` → expect `[]`. Any open alert is a finding (see §8 for triage).
- [ ] 1.2 Same for `secret-scanning/alerts?state=open` → expect `[]`.
- [ ] 1.3 `gh api repos/redwan-cse/redwan.work/dependabot/alerts?state=open` → expect `[]`. If non-empty: note severity/package/count; do not fix inside the audit — file findings and plan a dedicated deps PR.
- [ ] 1.4 `npm audit --audit-level=low` → expect `found 0 vulnerabilities`. A mismatch with 1.3 (counts differ — Dependabot tracks per-path advisories) is normal; record both numbers.
- [ ] 1.5 All `uses:` refs in `.github/workflows/*.yml` pinned to full 40-char SHAs (Semgrep flags mutable tags). Check: `grep -n "uses:" .github/workflows/*.yml` — every line must end with `@<40-hex> # <tag>`.
- [ ] 1.6 Branch protection intact: `gh api repos/redwan-cse/redwan.work/branches/main/protection --jq .required_status_checks.contexts` → must include `CodeQL` and `Scan`; `allow_force_pushes`/`allow_deletions` false.
- [ ] 1.7 `git ls-files | grep -E '\.env\.local$|pem$|key\.json$'` → expect empty (no secrets tracked). `.env.example` must contain only empty keys.
- [ ] 1.8 `SECURITY.md` reporting path works: private vulnerability reporting enabled (Settings → Code security), contact address valid.

## 2. Authentication & sessions

**Files:** `proxy.ts`, `lib/auth/actions.ts`, `lib/auth/session.ts`,
`lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/crm/clients.ts`
(`setClientActive`, `setClaimRole`), `app/login/*`, `app/reset-password/*`,
`app/invite/accept/*`.

- [ ] 2.1 Unauthenticated `GET /admin`, `/portal`, `/admin/emails`, `/admin/assets` → each `307` to `/login?next=…`. Wrong-role access (client → `/admin/*`, logged-out admin session → admin action) → redirect or `Unauthorized.`
- [ ] 2.2 Deactivate a temp client via `setClientActive(id, false)`: existing session download of an owned file → generic `404`; sign-in/refresh blocked; reactivate → access restored. Delete fixture.
- [ ] 2.3 Demote a temp admin to client: an admin-only action with the old session is refused. Delete fixture.
- [ ] 2.4 OTP throttling: 5 rapid magic-link requests allowed, 6th within 300 s denied with generic `Too many requests…`; `rate_limits` row shows `kind='otp-ip'`. Delete the row.
- [ ] 2.5 Cookie flags: SSR writes set `httpOnly`, `secure` (production), `sameSite=lax` — check `lib/supabase/server.ts` *and* `proxy.ts` `setAll`.
- [ ] 2.6 Invite/convert/reset flows complete end to end in staging with a real mailbox; Supabase Auth mail carries the verified domain (DKIM).

## 3. Authorization & database (RLS is the real boundary)

**Files:** `supabase/migrations/0001–0017*.sql` (read-only; migrations are
forward-only — never edit an applied one), `lib/crm/*.ts`.

- [ ] 3.1 `npx supabase migration list --linked` → `0001`–`0017` local **and** remote, in sync. Any drift is a Critical finding.
- [ ] 3.2 With a temp **client** JWT + publishable key: `POST /rest/v1/tickets` → denied; `POST /rest/v1/ticket_messages` → denied; `PATCH /rest/v1/invoices {status}` → no-op; `DELETE /rest/v1/payments` → row survives. Delete fixtures.
- [ ] 3.3 Service-role happy paths still work: draft → `send_invoice_atomic` → `sent`; submit → `confirm_invoice_payment_atomic` → `paid`; `void_invoice_atomic` on `sent`; invoice delete cascades items + payments; direct `status` UPDATE without the `app.invoice_status_transition` marker fails. Delete fixtures.
- [ ] 3.4 `payment_delete_guard` + `invoice_delete_payment_cascade` triggers exist; `files_attachment_scope_check` allows `ticket_id NULL` only under `/pending/`.
- [ ] 3.5 Cross-client isolation: client A cannot list, read, or guess IDs for client B's tickets, projects, invoices, or files (expect `[]` / `404`, never a leak). Delete fixtures.

## 4. Storage & uploads (R2)

**Files:** `lib/r2.ts`, `lib/mime.ts`, `lib/crm/files.ts`,
`app/api/uploads/presign/route.ts`, `app/api/uploads/ticket-presign/route.ts`,
`app/api/contact/route.ts`, `app/api/cron/r2-retention/route.ts`,
`app/(admin)/admin/assets/*`.

- [ ] 4.1 Presigned PUT binds `ContentLength`: PUT of exactly the declared size succeeds; ±1 byte is rejected by R2 (signature mismatch).
- [ ] 4.2 Confirm-time verification: presign 1 KB → PUT 1 KB → confirm declaring 10 MB is rejected by `verifyStoredObjectSize`.
- [ ] 4.3 Key scoping: `contact/…` key rejected for a deliverable row; deliverable key for project A rejected when confirming for project B; non-`/pending/` ticket-less attachment insert fails the CHECK.
- [ ] 4.4 Ticket-presign abuse paths: cross-origin POST → `403`; 4th presign in 60 s for one client → `429` with a `presign-portal` row; missing salt / DB outage → denied, never allowed.
- [ ] 4.5 Asset uploader (admin): valid png ≤5 MB → CDN URL that GETs 200 with identical bytes; 6 MB / `.exe` / mime-mismatch → `400`; delete → origin `NotFound` (note: CDN edge may serve a stale HIT — spec'd cache-forever behavior, not a bug).
- [ ] 4.6 Retention cron: unauthenticated `GET /api/cron/r2-retention` → `401`; with bearer → `200 {deleted, examined}`; orphan `pending/` objects older than 24 h are removed; contact attachments older than 90 days (unretained) are purged.
- [ ] 4.7 `connect-src` in the production CSP contains the Supabase origin *and* the R2 origins: `curl -s -D - https://redwan.work/ | grep -i content-security-policy`.

## 5. Lifecycle email

**Files:** `lib/email/*`, `lib/crm/email-log.ts`, `app/(admin)/admin/emails/page.tsx`,
`supabase/migrations/0016_email_log.sql`.

- [ ] 5.1 All 7 templates render with hostile input (`<img src=x onerror=…>` in every interpolated field) → output contains zero raw markup.
- [ ] 5.2 Each event produces its row: invite (handoff), new-ticket, reply-posted ×2 directions, status-changed, deliverable-uploaded, invoice-issued, payment-confirmed — correct `template`/`entity_type`/`entity_id`.
- [ ] 5.3 Fail-soft proof: force a send failure (bad recipient or removed key) → triggering action still returns `ok`, row lands with `status='failed'`.
- [ ] 5.4 No message content in `email_log`: `select *` over test rows contains no subject/body/filename/amount strings.
- [ ] 5.5 `/admin/emails` as admin renders the table with working filters/pagination; as client → bounced; logged out → `307` to login.
- [ ] 5.6 `email_log` row count is sane (no unbounded growth since last audit); decide whether the retention window decided earlier is now due.

## 6. Transport, headers & abuse controls

**Files:** `next.config.js`, `proxy.ts`, `app/api/contact/route.ts`,
`lib/contact/*`, `app/api/revalidate/route.ts`.

- [ ] 6.1 Production headers on `/`: `Content-Security-Policy` (no hardcoded project ref — derived from env), `Strict-Transport-Security` (includeSubDomains + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- [ ] 6.2 Contact abuse paths: cross-origin POST → `403`; Turnstile failure → `400`; token reuse → `400`; IP over budget → `429`; oversized/invalid attachment metadata → generic `Attachment data is invalid…`.
- [ ] 6.3 Every client-reachable error path returns fixed copy: trigger each former leak (ticket count, file save, reply, presign) and confirm bodies contain no DB/storage/constraint text.
- [ ] 6.4 Revalidate endpoint: missing/bad bearer → `401`; wrong path → refused.

## 7. Privacy & data lifecycle

- [ ] 7.1 No PII in logs: grep server logs produced during probing for emails, names, payment references, filenames — expect none outside the `email_log.to_email` audit column.
- [ ] 7.2 Retention operating: R2 orphans purged (§4.6), `email_log` window per §5.6 decision, contact attachments honored per `retained` flags.
- [ ] 7.3 Backups: `archive/project_<id>/<ISO>.zip` downloads contain `project.json` + `milestones.json` + `files/…` with matching bytes; purge removes rows + objects (verify counts hit 0).
- [ ] 7.4 Third-party data map still accurate: Supabase (auth + Postgres), R2 (attachments/deliverables/assets), Resend (SMTP + API), Turnstile (bot checks), Blogger (read-only posts). No new vendor since last audit.

## 8. Recording findings

| Severity | Meaning | Examples |
|---|---|---|
| Critical | Must not ship / must hotfix: bypasses auth, leaks data across clients, deletes or corrupts data, secrets exposed | RLS bypass, IDOR, session survives deactivation, private key in repo |
| Important | Should fix before next release: fail-open limiter, error leak, missing audit row, broken probe that hid a regression | fail-open rate limit, DB text in response, unsent event with no log row |
| Minor | Ship and track: polish, defense-in-depth, docs drift, flaky probe | unbounded fan-out at scale, missing legend, stale comment |

For each finding record: area (§), file:line, observed vs expected (with exact output), severity, and suggested fix. Dismiss a scanner finding **only** with a sink-level justification (where the value is rendered, why it is safe) recorded both in code comment and in the finding — never silently.

## 9. Sign-off

- [ ] All 7 areas executed; every checkbox is ✅ or a filed finding.
- [ ] Zero open code/secret alerts or all are triaged findings above.
- [ ] Dependabot at 0 open or new alerts filed as findings.
- [ ] Fixture sweep: `profiles` holds only real users; all CRM tables and `email_log` back to pre-audit counts; no R2 probe objects remain.
- [ ] Docs updated for anything the audit changed or discovered (`docs/security/README.md` residual list, `docs/email/README.md` matrix as applicable).
- [ ] Gates green on the final tree: `npm run lint && npx tsc --noEmit && npm run build`.
