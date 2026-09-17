# Safe audit and verification runbook

Scope each run to an approved change and exact candidate. This supersedes the [historical live-probe runbook](https://github.com/redwan-cse/redwan.work/blob/351b9dbb1a8e3aa5f91cf1b3dd72b0c3e89a3647/docs/security/AUDIT-PLAN.md); preserve that record as provenance, not executable permission. Use the [M00 criterion ledger](ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md) and PR56 instead of creating another backlog.

## 1. Entry and isolation

Read AGENTS.md, approved contracts, exclusions, current main/candidate heads, source callers and relevant SQL definitions. Use npm/committed package-lock, Node22.23.1 and the actual Tailwind3 stack. Never assume a proposal is approved or an earlier pass covers changed source.

Do not link a CLI project to production. No .env/.env.local/.env.production files or production credential inheritance in test checkouts. Disposable Auth runners validate loopback API/mailbox origins and current sb_publishable_/sb_secret_ keys, then pass only allowlisted environment names to build/test children. Use JWKS/asymmetric verification; no legacy JWT shared secret. SQL service_role is a role, not a deprecated API-key recommendation.

Use reviewed GitHub Actions setup when local dependencies/browsers/services are unavailable. Keep credential-bearing reporting steps separate from dependency installation/application tests. Never rerun historical production diagnostic/writer workflows or restore their credentials.

## 2. Test-first contract repair

Write the desired regression and verify it fails for the intended assertion, not an import/config/fixture defect. Implement the smallest approved fix. Actual action/parser tests use explicit synthetic boundaries and must be labeled accordingly. A source slice is not an executed browser/SQL exploit. Browser fixtures must exercise the actual built application, and persistence assertions must query only their disposable records.

Run relevant commands in the reviewed credential-free/disposable environment:

```bash
npm ci
node --experimental-strip-types --test tests/reliability/*.test.mjs tests/invoice-quantity.test.mjs
node --experimental-strip-types --test tests/wave-one.test.mjs
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

Disposable SQL/RLS/transaction/Cron and Auth/mailbox/browser/storage/archive/restore jobs provide their own isolated setup. tests/wave-one-browser.mjs uses actual built login/contact HTTP/persistence with mocked Cloudflare widget/siteverify and blocked external browser/server fetches; it is not hosted Turnstile/R2/Vercel acceptance. Baseline replay is retrospective regression evidence, not a claim browser tests ran before code was written. The earlier action/parser red execution supplies that test-first evidence.

Test success, denial, error, duplicate, concurrency/retry and recovery scenarios appropriate to each story. Never weaken a criterion, skip-as-pass or relabel failed acceptance. Issue45 policy-version challenge stays failed until a separately approved genuine contract is implemented.

## 3. Cleanup and evidence

Keep exact generated IDs/emails/hashes privately in the fixture process. Delete only those fixtures in the disposable environment and verify no exact matching records/objects remain. Stop disposable services even on failure; report assertion and cleanup failures separately. Never restore customer rows from an unverified artifact. Do not publish raw mail, tokens, signed URLs, credentials, provider payloads or customer records. Output fixed phase names, counts and outcomes.

For each criterion record: story and original requirement; approved scope; head/main; source/test path; command and environment; mocked boundaries; intended red and actual green result/run URL; negatives/retries; cleanup; residual limits; independent reviewer and decision (or absent); deployed/monitored state. All20 original issues remain tracked until separately evaluated for closure.

## 4. Separate production and release gates

Production backup/isolated restoration, actual migration ledger, missing additive migration rehearsal, environment/CORS/provider configuration, live mail, scheduler activation and monitoring need separate approved procedures. Applied0001-0017 remain immutable; development files through0035 are not proof of production parity. Clone Cron must be disabled or isolated from production before restoration testing. No reset, destructive migration or blanket replay.

GET /api/cron/email-outbox sends mail and GET /api/cron/r2-retention deletes objects. They are mutations, never health/read-only probes. Synthetic diagnostic repair is not renewed production Auth correction permission.

Refresh actual branch rules/signatures/checks/reviews; inaccessible inventories remain Unknown. No force-push, ancestor rewrite, branch deletion or protection weakening. Obtain independent review and explicit exact-head release confirmation before main push/merge; main auto-deploys. Only verified deployment and monitoring can support released claims.
