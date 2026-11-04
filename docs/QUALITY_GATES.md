# Quality gates and Antigravity contract

Status: proposed safeguard package for the v2 audit baseline. It contains automation, not application fixes or production approval.

## What runs immediately

`CI` uses Node 24, a locked npm installation, the gate's own Node tests, Next route type generation, the existing typecheck/lint/build scripts, synthetic loopback service configuration, and no production secrets. Warnings fail. `Security` runs dependency audit, history secret scanning, and CodeQL. These jobs require GitHub-hosted network access and have not been executed by merely adding this document.

GitHub issues short-lived job tokens: checkout/setup use their scoped defaults, secret scanning receives read-only contents/PR permissions, and the separate CodeQL job receives `security-events: write` to publish analysis. These tokens are not Supabase, R2, Resend, deployment, or production credentials. No application build or behavioral test receives production credentials, and no job can deploy.

## Required behavioral suites

`Required Quality` intentionally fails the audited baseline because it has no application tests. Do not add `echo`, `--passWithNoTests`, `continue-on-error`, `|| true`, fake receipts, or a placeholder `test:*` command to make it green.

| Script | Test directory | Required meaning |
| --- | --- | --- |
| `test:unit` | `tests/unit` | Real consent/rate-limit/money/publishing regressions, using Vitest or an equivalent actual runner |
| `test:db` | `tests/db` | Clean disposable Supabase bootstrap, SQL/RLS/ACL/actor/tenant/AAL and concurrency tests |
| `test:e2e` | `tests/e2e` | A real isolated order-to-delivery-to-payment flow plus auth, upload and email failure/retry coverage |
| `test:a11y` | `tests/a11y` | Browser layout, keyboard, automated a11y and reduced-motion tests on synthetic data |
| `test:seo` | `tests/seo` | Built HTML/headers, pagination canonical, sitemap, private noindex and identity-contract tests |

Add `.test.ts`, `.spec.ts`, `.test.tsx`, `.spec.tsx`, equivalent JS module forms, or `.test.sql`/`.spec.sql` files. Existing application code must be imported or exercised; copied miniature implementations do not count as regression tests. The gate's own tests are not application unit coverage.

Every suite script owns startup, readiness waits and guaranteed cleanup of its ephemeral dependencies. Pin runner packages and Supabase CLI in the lockfile; add `supabase/config.toml`, synthetic seeds and generated types checks as part of the database-harness story. Nothing in this package invents a running DB, browser installation or fixture provider. Browser suites install their pinned Playwright browsers and start a production build against isolated fixtures. They must use a dedicated disposable database, mail sink and object-store fake or restricted disposable bucket. Stop if any host/database/bucket is not on the explicit test allowlist.

Placeholder service values deliberately fail external service access. A suite may replace them only with freshly provisioned disposable-fixture settings, never repository/organization production secrets. Use the supported publishable/secret API key types issued only for newly provisioned disposable fixtures, plus SDK/JWKS verification. Never use the current project's retained or production credentials. Do not add legacy JWT secrets or legacy API keys. Do not run a reset against any remote or retained database. Avoid network-dependent third-party assertions; supply deterministic fixtures.

## Machine receipts

A suite must derive `artifacts/quality/<suite>.json` from its test runner result, not hand-author it. Required fields: `schema: 1`, the suite ID, `commit` equal to the checked-out `GITHUB_SHA`, `environment: "isolated-ci"`, a positive integer `passed`, `failed: 0`, `skipped: 0`, and `coveredRequirements` containing the suite's IDs from `.github/quality-contract.json`. A skipped mandatory test is not acceptance. Add a separately reviewed change to scope rather than rewriting a result.

`node scripts/verify-quality-contract.mjs --receipt unit` validates a unit receipt. Locally, the verifier uses `git rev-parse HEAD` if `GITHUB_SHA` is absent. Test a clean checkout; a receipt hash does not establish the state of uncommitted files. On pull requests GitHub normally tests a synthetic merge checkout: record both PR head and tested merge SHA/tree. After rebasing or merging, verify the new integration version before release.

The gate checks structure, non-empty counts and claim consistency. It reads immutable Git objects at the pinned audited commit and rejects a changed baseline commit, path set or migration bytes even if the mutable JSON hashes are recomputed. With full checkout history, it also protects migration files already present in the PR base (or the preceding main push). The workflow and verifier remain editable source: protect them with reviewed branch rules. New forward migrations need real database tests, not only hash checks.

This is a structural contract plus execution gate, not semantic certification. It cannot prove the truth of a forged receipt, executable assertions, fixture isolation or security behavior. An empty file or a dishonest runner can satisfy superficial structure. The next test-harness story must add locked runners and independently reviewed result adapters that derive coverage/counts from runner output. Test review must establish that assertions actually exercise current app code and would detect the reported defects. Protect the verifier, adapters, contract and test directories. Never treat a successful CodeQL execution as zero findings: require code-scanning alert protection or a recorded security-review decision for high/critical alerts.

After validating a successful receipt, the verifier writes only suite, exact checkout, counts and allowlisted contract requirement IDs to the GitHub job summary. It excludes arbitrary fields and extra requirement claims. This preserves safe review evidence; it does not make a forged input trustworthy. Failed receipts remain failed checks and are not summarized as passes.

## Required GitHub settings (not applied by files)

The audit found `main` marked unprotected and the readable active-rule endpoint returned no rules. After installing and observing the jobs, configure a main-branch ruleset requiring a pull request, up-to-date passing checks, resolved review conversations, blocked force pushes/deletions, and no routine bypass actors. Require the actual emitted check names: `Static build`, `Dependency audit`, `Secret scan`, `Required quality`, and `CodeQL`. Verify names from the first run before saving the ruleset. Protect these workflows, scripts, migrations, contract and AGENTS.md with code-owner review. Enable high/critical CodeQL alert protection where available.

A sole repository owner cannot supply an independent approval on their own PR. Add an independent trusted reviewer before requiring one approval, or explicitly record that independent release review is still missing. Do not create a self-approval loophole or pretend CODEOWNERS alone enforces anything. Restrict Actions to trusted actions, require full SHA pins, keep default token permissions read-only, enable secret scanning/push protection where available, and isolate preview/production environments. Rulesets and provider settings require their own owner-reviewed change; this branch does not modify them.

## Antigravity definition of done

1. Read the current plan and audit, identify the smallest approved story, and bind work to the current branch head.
2. Write a regression and observe its intended failure. Fix the root cause; preserve legitimate behavior.
3. Add application tests under the appropriate directories and run the actual test commands, not only the gate's tests.
4. Generate receipts from test results. Include failures, negative permissions, retries/concurrency and cleanup.
5. Keep applied migration bytes unchanged; add compatible forward migrations. Never infer hosted parity from generated types.
6. Submit a small reviewed PR; report exact commit/tree, suite results, unresolved findings, and next dependency.
7. Perform one consolidated local acceptance only after development, bound to the final candidate. Prior acceptance is not transferable.
8. Obtain separate exact-head approval for production-changing merges/deployments. Scheduler activation, real mail, live uploads/deletion and provider changes need separate bounded authority.

## Artifact hygiene and release operations

Default workflow logs should contain only safe errors, phase IDs and counts. Do not publish raw HTTP archives, auth cookies, bearer/signed URLs, real client files, request bodies, secrets, production snapshots or provider responses. If test artifacts are later added, use synthetic fixtures, redact first, keep retention short (for example 7 days) and restrict access. Security findings remain internal until coordinated remediation.

Before release: verify all applicable critical/high fixes, exact-head CI and review, current hosted auth/CORS/CSP/queue configuration, isolated acceptance, backup/restore proof where live data exists, rollback instructions, and monitoring owner. Production smoke belongs after separately authorized deployment. No CI job in this package deploys, migrates production, invokes a cron endpoint, sends real mail, uploads live data or notifies search engines.
