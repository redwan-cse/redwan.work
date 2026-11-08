# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch. This project deploys
continuously from `main` to production (Vercel), so there are no separate
maintained release lines — always update to the latest commit on `main`.

| Version | Supported |
| ------- | --------- |
| `main` (latest) | :white_check_mark: |
| Older commits / forks | :x: |

## Reporting a Vulnerability

**Please do not open a public GitHub issue or discussion for security reports.**

- **Preferred:** Use [GitHub Private Vulnerability Reporting](https://github.com/redwan-cse/redwan.work/security/advisories/new) on this repository (`Security` tab → `Advisories` → `Report a vulnerability`).
- **Alternative:** Email `contact@redwan.work` with the subject prefix `[SECURITY]`.

Include, where possible:

- Affected URL, route, RPC, or file (e.g. `/portal/files`, `proxy.ts`, `supabase/migrations/0011_trust_boundaries_and_rls_hardening.sql`)
- Steps to reproduce (account role required, request sequence, or proof-of-concept payload)
- Impact assessment (what an attacker could read, modify, escalate, or bypass)
- Any suggested remediation or mitigation

## What Happens Next

1. **Acknowledgement** — within 72 hours of receipt.
2. **Triage & Verification** — we confirm scope, severity, and root cause, and keep you updated.
3. **Remediation** — a fix and regression test are developed and verified against the fail-closed quality contract before merging to `main`.
4. **Coordinated Disclosure** — public disclosure after the remediation is deployed, with credit given with your permission.

## Scope

In scope for this repository (`redwan.work` v2 — Next.js 16 App Router, React 19, Supabase PostgreSQL/Auth, Cloudflare R2, Resend):

- **Authentication, Session & MFA Gates:** `proxy.ts`, `lib/auth/`, `app/(auth)/mfa/`, AAL2 enforcement for `/admin/*`, and active-account (`account_status = 'active'`) checks.
- **Database Trust Boundaries & RLS:** Row-Level Security policies, caller-bound `SECURITY DEFINER` RPCs, explicit function ACLs, and tenant/parent-child ownership constraints in `supabase/migrations/`.
- **Financial & Commercial Integrity:** Proposal, order, C|EH Rules of Engagement (RoE) gates, invoice immutability after draft, payment idempotency, and settlement RPCs (`lib/crm/`, `lib/finance/invariants.ts`).
- **File Vault & Background Processing:** Cloudflare R2 presigned upload/download flows (`lib/r2.ts`, `/api/uploads/*`, `/api/files/[id]/download`), 500 MB per-client storage quotas, retention purge (`/api/cron/r2-retention`), and atomic `FOR UPDATE SKIP LOCKED` email outbox processing (`/api/cron/email-outbox`).
- **Content & Redirect Safety:** Blogger HTML sanitization (`lib/blogger.ts`), internal redirect validation (`lib/security/safe-redirect.ts`), rate limiting (`lib/security/rate-limit.ts`), and HTTP security headers (`next.config.js`).

Out of scope (report anyway if impact is severe):

- Third-party infrastructure providers themselves (Supabase, Cloudflare, Resend, Vercel, Google Blogger)
- Volumetric denial-of-service (DoS/DDoS), social engineering, or physical attacks against production

## Automated Security & Quality Gates

Every push and pull request to `main` is gated by fail-closed GitHub Actions workflows:

- **Security (`.github/workflows/security.yml`):**
  - Secret scanning across working tree and commit history
  - Locked `npm audit --audit-level=moderate` dependency vulnerability gate
  - GitHub **CodeQL** (`security-extended` Javascript/TypeScript static analysis)
  - **Dependabot** automated security and weekly grouped dependency updates (`.github/dependabot.yml`)
- **CI (`.github/workflows/ci.yml`):**
  - Verifier self-tests (`scripts/verify-quality-contract.test.mjs`)
  - Next.js route type generation, strict `tsc --noEmit`, zero-warning `eslint`, and production build
- **Required Quality (`.github/workflows/required-quality.yml`):**
  - Immutable migration byte-hash verification (`supabase/migrations/0001..0010.sql`)
  - Exact-commit test receipts across `unit`, `db` (disposable PostgreSQL 17), `e2e`, `a11y`, and `seo` suites
