# AGENTS.md: redwan.work

Personal portfolio of Md Redwan Ahmed. Production: https://redwan.work.

## Stack and commands

Next.js16 App Router, React19, strict TypeScript, Tailwind CSS3 (not4), shadcn/Radix, Supabase Auth/Postgres, Cloudflare R2, Resend, Blogger and Vercel Hobby. Use npm with committed package-lock.json.

```bash
npm ci
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

Every push to main auto-deploys. Never push or merge main without explicit exact-head release confirmation. Current unmerged development work is not production merely because a test or superseded PR is closed.

## Architecture and conventions

Server Components by default; use client components for interactivity. Keep strict TypeScript. Use cn() from lib/utils and established shadcn/ui patterns; do not hand-edit generated components/ui files. Read relevant docs/<feature>/ before each coding slice and verify old claims against actual source.

Contact: components/enhanced-contact-form.tsx -> POST /api/contact -> lib/contact/lead-schema.ts -> lead-store.ts -> Supabase. Google Forms/Apps Script are retired. Required configuration, rate-control and replay-control failures are fail-closed, not graceful acceptance without persistence. See docs/contact/README.md. Budget/NDA validation is shared through lib/contact/intake-contract.ts; preserve explicit consent and attachment validation.

Auth: app/(auth), lib/auth and proxy.ts; server actions and current-account authorization remain authoritative. Canonical relative return-path validation is not destination authorization. Blog content uses lib/blogger.ts and external Blogger; public content cache/pagination claims require their own evidence.

## Approved work and evidence

One master plan, one release tracker: PR56 and original issues28-47. Superpowers design approval, Ralph small-story execution and GSD phase tracking are methods, not independently running agents or separate backlogs. Owner approved M00/A01/I01/I02 plus whole-dollar budgets and exact legacy NDA compatibility. Consent-version schema, post-OTP recovery, retention lifecycle and later master-plan stories require their own approvals.

Current criterion ledger: docs/security/ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md. Separate implemented, tested, independently reviewed, deployed and monitored. Failed policy-version acceptance remains failed; green suites prove only named assertions. No independent reviewer is created by loading a skill.

## Safety

No production credentials/data in builds, dependency installation or tests. Use disposable local Supabase/Auth/mailbox/storage services; GitHub Actions supplies installed dependencies/browsers when the sandbox cannot. Never use legacy anon/service_role API keys or JWT shared secrets. Use current sb_publishable_/sb_secret_ keys and asymmetric JWT/JWKS verification. SQL service_role remains a valid database role.

Applied migrations0001-0017 are immutable. Development additions through0035 do not establish the actual production ledger. Never reset production, replay all migrations, destructively migrate or perform unverified restoration. Verify a backup AND isolated restoration before separately approved production rollout. Clone/restored Cron must never call production.

Historical production Auth/configuration/diagnostic workflows are retired. Do not restore their credentials or retry production Auth from this development approval. GET email-outbox sends mail; GET r2-retention deletes objects. Neither is a read-only probe. Scheduler provisioning/activation, real mail, production reads/writes and release require their applicable separate authorization.

No secrets, tokens, signed URLs, raw provider responses, mail bodies, customer rows or backups in chat/public artifacts/logs. Use fixed categories and private exact fixture cleanup. Do not force-push, rewrite/delete branches or weaken protection. Never assign implementation to GitHub Copilot.
