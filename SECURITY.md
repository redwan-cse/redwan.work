# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch. This project deploys
continuously from `main` to production (Vercel), so there are no maintained
release lines — update to the latest commit.

| Version | Supported          |
| ------- | ------------------ |
| `main` (latest) | :white_check_mark: |
| Older commits / forks | :x:            |

## Reporting a Vulnerability

**Please do not open a public issue for security reports.**

- **Preferred:** use [private vulnerability reporting](../../security/advisories/new)
  on this repository (Security tab → Advisories → Report a vulnerability).
- **Alternative:** email `contact@redwan.work` with subject `[SECURITY]`.

Include, where possible:

- Affected URL, route, or file (e.g. `/portal/files`, `lib/crm/files.ts`)
- Steps to reproduce (accounts needed, request sequence)
- Impact assessment (what an attacker can read, modify, or bypass)
- Any suggested fix or workaround

## What Happens Next

1. **Acknowledgement** — within 72 hours.
2. **Triage** — we confirm scope and severity, and keep you updated.
3. **Fix** — a patch is developed on a private branch if the issue is
   confirmed, then merged to `main` (which auto-deploys to production).
4. **Disclosure** — coordinated public disclosure after the fix is live.
   Credit is given with your permission.

## Scope

In scope for this repository (`redwan.work` — Next.js app, Supabase
Postgres/Auth, Cloudflare R2, Resend email):

- Authentication / session handling (`proxy.ts`, `lib/auth/`, `lib/supabase/`)
- Authorization boundaries (RLS policies in `supabase/migrations/`, `requireAdmin` / `requireClient` gates)
- File access and presigned-URL flows (`lib/r2.ts`, `lib/crm/files.ts`, `/api/files/*`, `/api/uploads/*`)
- Ticket / invoice / payment integrity (`lib/crm/`)
- Security headers and bot protection (`next.config.js`, Turnstile)

Out of scope (report anyway if impact is severe):

- Third-party hosted services themselves (Supabase, Cloudflare, Resend, Vercel)
- Social-engineering, physical attacks, or availability (DoS) testing
  against production

## Automated Coverage

Every push and pull request to `main` runs:

- **CodeQL** (GitHub-native SAST) and **Semgrep** (OWASP / secrets ruleset),
  both reporting to the Security tab
- **Dependabot** alerts and security updates for dependencies
- **Secret scanning** with push protection (commits containing secrets are blocked)

Vulnerabilities found by automation are triaged like any other report.
