# PR57: sanitized engineering evidence and release readiness

Evidence checkpoint: 29 September 2026. Publication prepared 30 September 2026.

**Recommendation: publish the bounded development repairs and documentation, not release.** [PR57](https://github.com/redwan-cse/redwan.work/pull/57) and original issues28-47 remain the trackers. The owner approved 14 repository files and the PR description, then explicitly chose to restore draft status before publication. No merge, main push, production operation, deployment, policy action, host operation, cleanup, migration-byte change, rule change, history rewrite or issue closure is included.

## Version binding and evidence limits

Reviewed and operator-tested baseline: [b4430c187cb3b46c953cd6660b59146fa5d2204e](https://github.com/redwan-cse/redwan.work/commit/b4430c187cb3b46c953cd6660b59146fa5d2204e), against main/base `31ff564d815b912bce3ab6d26a8ddc744ef1cad0`. The commit introducing this document is the bounded repair/publication candidate, not another b4430c1 runtime execution. Its measured SHA and subsequently observed CI belong in the PR description after readback; this document does not preclaim future CI.

| Evidence | Verified population/result | Limit |
|---|---|---|
| b4430c1 GitHub CI | 32 completed-success check rows; nine successful status contexts | Marker rows are not 32 independent test suites. |
| b4430c1 operator report | 143/143 preparation; 61/61 runtime tests across eight ordered suites; browser A-E passed; 41 migration hashes matched | Accepted after 127 consistency checks, not direct host observation or independent receipt of original private artifact bytes. |
| Independent source review | All 137 changed files, plus affected dependencies; inventory and assignment union reconciled | Not every repository file, a native GitHub APPROVED review, or production acceptance. |
| Repair red/green | 23 actual-source tests: original 6 pass/17 assertion failures; repaired 23/23 | Synthetic external-service transports, not hosted Auth/Blogger execution. |
| Related local regression | 64/64: 23 new, 11 existing Blogger and 30 existing recovery-read/helper/layout tests; Node22.23.1, umask077, exit0, no skips | New-commit full-project lint/types/build/security CI and runtime delta assessment remain separate. |

Exact b4430c1 jobs: [Reliability](https://github.com/redwan-cse/redwan.work/actions/runs/36573575714/job/109423336239) and [Combined Auth/mailbox/product/browser/database](https://github.com/redwan-cse/redwan.work/actions/runs/36573575834/job/109423337981). Reliability executed the exact preparation subset under077 before dependency installation, then regression/lint/types/build. Named F20 explicit-consent/time and policy-version challenges passed, as did the integrated browser/database checks. The retired source-publisher marker is inert and is not acceptance.

The eight reported runtime suite counts are: environment-preflight1, real-backup-restore8, section4-interrupted-restore9, section5-session-authorization17, section6-staging-replay6, section7-browser-usability6, failing-resume-after-reload5, test-browser-resume9. Node includes file/parent/subtest records; these are not 61 independent user journeys. BrowserC reached navigation200 and foreign-import400 with denial/no-Resume/unchanged checkpoint; D/E completed. Consent control remained disabled with no archived real policy.

The successful run and its private evidence remain retained; execution authority is consumed. The original host safe-report file hash/private bytes were not independently received. A normalized transcript hash is not that host-file hash. Old failed attempts and exact packet bytes remain preserved; historical commands are not reusable authority. The owner's uncommitted local packet files are not part of this publication or a completed content audit.

## Independent review and bounded repairs

Coverage partitions: auth/consent33, recovery/storage39, harness/CI37, delivery/general28, totaling 137 unique changed files with no missing/duplicate assignments. Reviewers inspected exact-head source and modified-file base context. Two confirmed medium findings were repaired and independently re-reviewed locally.

**Recovery POST current Auth authority (F01/#29, F13/#39).** Completed restore replay could return actor-scoped UUID metadata before the stronger SQL current-ban check. It was not demonstrated archive-byte or signed-URL disclosure. POST now uses the same `requireUnbannedAuthUser:true` session option as GET/layout. Origin checks, actor filtering, SQL and schema are unchanged. Nineteen actual-route/helper tests cover current bans, provider failure, identity mismatch, replay, unban, role/profile refusal and cross-origin/actor boundaries: original6 pass/13 fail, repaired19/19.

**Blogger cache invalidation (F17/#44, F13/#39).** Pre-clear requests could repopulate stale raw/page caches or erase newer in-flight pointers. Page-cache repopulation predates this PR; shared raw and promise-cleanup hazards are introduced/extended here. This is public-content freshness, not private-data exposure. Cache generations gate publication; promise identity gates cleanup. Four deferred actual-module tests cover both completion orders, old failure and multiple clears: original0/4, repaired4/4. Existing11 pagination tests pass. The eviction comment now correctly says insertion-order, not LRU.

| Reviewed file | SHA256 of publication bytes |
|---|---|
| `app/api/recovery/route.ts` | `9a78551cbac4aba6f7c9b0a98cf4f7cc290396b77eeaab3e54d7d1f94679b3b5` |
| `lib/blogger.ts` | `bc17a5f64970b2eafb63220c971ccd429637245e30180866c78021c2bcda4207` |
| `tests/reliability/recovery-post-authority.test.mjs` | `83e9d1490d0c12660a0dd5b29cb95d4aa8332dbf63ead1805ee2254423f55897` |
| `tests/reliability/blogger-cache-invalidation.test.mjs` | `d7718a79df8c10031cdb07ce3ae070dea2edbba4f47bb54a15bf03c019de6fb3` |

Reproducible focused command, from the publication checkout with Node22.23.1:

```sh
(umask 077; node --test tests/reliability/recovery-post-authority.test.mjs tests/reliability/blogger-cache-invalidation.test.mjs tests/reliability/recovery-read-authority.test.mjs tests/reliability/blogger-pagination.test.mjs)
```

This command imports real source with explicit synthetic leaf adapters. It is not a host/runtime launch. Both new files are covered by the existing reliability `*.test.mjs` selection. Exact-new-head CI must establish full integration and actual inclusion before code completion is claimed. The Auth entry change requires a bounded delta-verification assessment; do not relabel the old143/61 result or request another identical host loop merely for documentation. No new owner-host operation is authorized.

Non-blocking observations remain separate: some synthetic acceptance fetches bypass the owned-origin wrapper while the validated internal bridge supplies separate containment; the preexisting already-purged shortcut does not attest remaining archive bytes but introduces no new deletion; out-of-range blog-page display and mutable PostgreSQL CAS CI tag are preexisting follow-ups. They do not authorize unrelated repair or retention changes.

## Signed-merge path

At the baseline refresh, main was protected; its visible required-status summary listed Scan and CodeQL, both successful on b4430c1. Active [Source Code Protection](https://github.com/redwan-cse/redwan.work/rules/9986879) requires signatures and forbids deletion/non-fast-forward updates. Main's inspected commit was verified; b4430c1 was unsigned.

Full classic required-review/check configuration and enabled merge methods remain unknown because available reads did not expose them. Retrieved reviews contained no APPROVED record. Independent AI review does not satisfy any required native approval. The PR was later observed ready for review despite stale body text; the owner separately chose restoration to draft before this publication.

Investigate owner-authored GitHub web squash only if enabled and all actual requirements are met. [GitHub's signed-commit rule documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) describes author-specific squash behavior; unsigned head alone does not make every compliant method impossible. No method is selected or authorized here. Refresh final head/base, CI, reviews/threads and actual requirements before any later merge decision. Main auto-deploys.

## Production and consent readiness

Current protected backup plus successful restricted isolated restore/upgrade, actual migration ledger/content/schema provenance, hosted Auth SMTP/templates/origin/JWKS and environment parity, R2 CORS/CDN, hosting plan/actual scheduler, monitoring ownership and real rollback deployment artifact remain unverified. Missing evidence does not prove absent configuration.

September9 production preflight/classification documents are historical snapshots. The later classification corrected the older R2 endpoint warning to a supported jurisdiction endpoint. Do not change it based on the older warning. The September17 claim of 35 production migrations is attributed history with inconsistent endpoint names, not independently verified current ledger evidence. Do not claim either that 0018-0041 are absent or that all41 are deployed. A clean synthetic bootstrap is not a production upgrade rehearsal.

F20 route/form/migration0041 integration is implemented and tested in development. Migration0041 is additive with `active_version=null`, no real policy seed and no historical backfill. New contact code returns503 for missing/disabled/unavailable/corrupt control. An uncoordinated app-only rollout can stop intake. The unchanged fallback says information is never shared with third parties while `/privacy` describes provider disclosures. The owner must resolve exact wording before real publication/activation; this batch changes no legal copy.

`vercel.json` declares daily `/api/cron/r2-retention`, not an outbox schedule. An external schedule may exist. `queueEmail()` can dispatch after requests when configured, so no outbox cron does not imply no mail. GET outbox sends mail and GET retention deletes objects: neither is a read-only probe.

Future dependency order, not executable authority:

1. Obtain sanitized current merge/settings and actual ledger metadata without secret values or customer data.
2. Verify a protected complete backup and restricted isolated restore, with copied schedules disabled and production/provider egress blocked before services start.
3. Rehearse only reviewed missing migrations with bounded locks/timeouts, current/candidate app compatibility and controlled mail/storage side effects. Do not run general synthetic CI indiscriminately against restored customer data.
4. Resolve exact policy bytes and coordinated publication/activation/application ordering; separately approve any intake interruption and production operations.
5. Confirm a real rollback artifact, monitoring ownership and bounded smoke checks, then separately approve exact-head merge/deployment. App rollback must preserve immutable consent evidence and spent retry claims; no destructive down migration.

Use current Supabase publishable/secret API keys and asymmetric JWKS; SQL `service_role` remains valid. Never reset production. Customer backups, private logs, credentials, host paths/resource topology and operator authorization identifiers do not belong in this public record.
