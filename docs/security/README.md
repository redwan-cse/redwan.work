# Security: current evidence and historical context

## October 3, 2026: PR63 dependency repair (development only)

Current dependency-repair tracker: [PR63](https://github.com/redwan-cse/redwan.work/pull/63). The M00/PR56 sections below are retained historical checkpoints, not a refreshed statement of current release readiness. This repair does not authorize a merge, deployment, production operation or changes to PR61/PR62.

### Decision and exact artifact

The original full dependency audit failed on [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), a nesting-depth denial of service affecting upstream `braces` through 3.0.3. Fourteen high-severity affected package entries were reported, not fourteen independent vulnerabilities. Official npm `braces` remained at 3.0.3 during this investigation; the upstream depth-guard [PR72](https://github.com/micromatch/braces/pull/72) had not merged. Runtime application exploitability was not established.

The owner approved the temporary exact override `braces: npm:@dieub/braces-depth-guard@3.0.3-pn.1`, rather than an unrelated Next ESLint downgrade or audit suppression. This is a newly published, single-maintainer derivative, not an official upstream release or endorsement. Never resolve it through `latest`, which pointed at the earlier bootstrap version when inspected.

- Source: [dieub/braces-depth-guard at 2a95d57076c2c8a2ae0b75b05b7e2369ffbb137e](https://github.com/dieub/braces-depth-guard/tree/2a95d57076c2c8a2ae0b75b05b7e2369ffbb137e).
- Exact tarball: `https://registry.npmjs.org/@dieub/braces-depth-guard/-/braces-depth-guard-3.0.3-pn.1.tgz`.
- SHA512 integrity: `sha512-Y45K9cPXRCVrbXMenyNgKrzd+rl4jyto+BvvzVkVSsxHZ0ETQsYArTX/ZQjjCEpEmZsTzjUzHcHR6ygRtDjxQg==`.
- MIT, CommonJS, unchanged `fill-range: ^7.1.1` runtime dependency and no install lifecycle hook in the inspected artifact.

An alias can remove a version-based advisory match without fixing code. Therefore a clean audit alone is not the security proof, and the original GHSA remains recorded here. Provenance establishes publication/source identity, not that a maintainer or package is inherently trustworthy.

### Observed red/green and supply-chain evidence

[Isolated preparation run 37137981670](https://github.com/redwan-cse/redwan.work/actions/runs/37137981670/job/111246325236), at source head `0e88fbbfd0dda292fee303ffde90dd15d77c4ca2`, completed successfully on October 3 at 16:45:27 UTC. It verified the intended red against unchanged installed upstream 3.0.3: parse accepted nesting depth 101, producing the expected regression assertion failure. Earlier malformed test-copy commits are not valid red evidence.

The same unprivileged preparation verified the tarball SHA512, all ten tarball files byte-for-byte against pinned source, and provenance binding to the exact source commit and publishing workflow/tag. A separate package fixture passed `npm audit signatures`, including registry signature/provenance verification. Clean locked installation, the complete dependency regression file and `npm audit --audit-level=low` then passed with the alias.

Regressions retain the existing full-audit fail-closed, output-redaction, Next/compiler alignment and `brace-expansion` security-floor checks. Added coverage binds installed runtime source hashes and every locked braces copy to the selected artifact; rejects excessive string and direct-AST nesting; checks boundary/configured depths and hard-cap bypasses; and exercises ordinary ranges, escaping, `escapeInvalid`, micromatch, fast-glob and chokidar with disposable fixtures and cleanup. The separate `brace-expansion` floors are not a repair for this `braces` advisory.

Standard npm lock generation attempted unrelated package-population changes (two added, one removed) and was rejected before publication. The successful generator used npm-generated metadata from the independently verified isolated fork fixture, replacing only existing braces entries in the original lockfile. It required identical package populations and deep equality for every unrelated entry, followed by a clean `npm ci --ignore-scripts`. No unrelated dependency version, audit threshold or existing security floor changed.

The [separate publisher](https://github.com/redwan-cse/redwan.work/actions/runs/37137981670/job/111246445763) completed at 16:45:36 UTC. It checked inert JSON without source checkout, package installation or artifact-code execution, bound the write to the expected PR63 branch head/base/ancestry, and used a non-force update. Published [commit 87006ffb816b08436806303411615af9f952fd75](https://github.com/redwan-cse/redwan.work/commit/87006ffb816b08436806303411615af9f952fd75) changes only `package.json` and `package-lock.json`: the override and one existing lock entry. The one-use workflow is now a disabled, read-only marker with no artifact consumer, credential binding or publishing code. The older dependency publisher remains retired.

This records completed preparation and publication, not final PR acceptance. Full ordinary CI must pass on the exact subsequent retirement/documentation head, including Foundation audit/build/browser smoke, reliability/lint/types/build/manifests, Auth/provider/browser acceptance and disposable teardown. Current exact-head results belong in PR63 and the portal master plan; success on the preparation head must not be transferred silently.

### Residual risk, replacement and release boundaries

Default nesting is capped at 100 and excess depth throws a controlled error; callers still need appropriate error handling. This does not solve expansion cardinality, broad AST width or hostile cyclic parent links. Fractional `maxDepth` semantics have an upstream inconsistency; tests cover integer configuration and the hard cap, not a claim of corrected fractional semantics. The selected fork preserves the published 3.0.3 parent handling rather than adopting an unrelated stringify behavior change.

Replace this temporary fork only through a separately reviewed, exact-pinned upstream release (or other explicitly approved remediation), with verified artifact/source correspondence, full-audit success, depth and consumer regression coverage, and exact-head application acceptance. Do not automatically float the version, accept a scanner-only rename, suppress the GHSA or downgrade unrelated dependencies.

PR63 remains a development candidate. Brain review is self-review, not independent approval. Hosted Auth configuration/version parity, applicable operational/manual acceptance, production backup and isolated-restore readiness, rollback evidence and exact-head release authorization remain separate gates. PR61/PR62 integration is not proven by this repair. Main auto-deploys; no main write, merge, production access, deployment or AGY operation occurred under this scope.

## Historical M00 security checkpoint (retained)

This describes the unmerged development candidate, not a production certification. Canonical release tracker: [PR56](https://github.com/redwan-cse/redwan.work/pull/56). Criterion-by-criterion state and exact execution links: [M00 ledger](ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md). Original audit issues28-47 remain open; superseded PR closures were consolidation, not completed acceptance or deployment.

## Current enforcement, with boundaries

- Current-account authority uses profile role/activity, Auth state and token cutoffs; protected actions/RLS must agree. Inspected setClientActive disables a client profile and applies an Auth ban, or removes the ban before activation. It does not call an admin sign-out API with a user UUID. Do not describe this as unconditional global session revocation.
- Service-only mutation RPCs, atomic quotas and financial invariants are implemented and have disposable acceptance evidence. A trusted helper lacking its own session parameter is not automatically a public bypass; every actual caller and built action manifest still needs complete inventory.
- Uploads use signed storage capabilities and confirm-time metadata/size/scope validation. A HEAD result is not malware scanning or proof of permanent byte immutability. Full ticket sharing/cancel/reload acceptance and abandoned unbound-key lifecycle remain separate work.
- File deletion preserves durable tracking and verified archive/recovery evidence before physical deletion. Disposable restore tests do not establish production backup/restoration readiness.
- Durable email outbox implements fencing, retries, recipient reauthorization and frozen-envelope idempotency. Hosted delivery, monitoring, production schema/scheduler and paid/void notification freshness remain open.
- Diagnostics must use fixed categories and approved safe correlation. Do not log raw original provider/database errors, and do not equate truncation with redaction. Remaining presign/email-log/Blogger/revalidate sinks are tracked source findings, not claimed observed production leaks.

## Approved wave

M00/A01/I01/I02 only: criterion tracking, canonical relative login return paths, explicit NDA intent including approved exact legacy compatibility, and optional whole-dollar USD budgets. Both budgets blank is allowed; otherwise both integer bounds0..10,000,000 with minimum<=maximum. No rounding, clamping, partial-range acceptance or existing-record rewrite. New forms send NDA true/false; exact legacy checked string is recognized, empty/omitted unchecked, unknown/duplicate/non-string rejected.

Implementation is not verification. Check the current head's actual action/parser, built-browser and disposable DB results before marking these stories Verified. Consent time/explicit consent have prior evidence; policy-version remains a failed criterion, with no schema/backfill authorized. Post-OTP recovery and logout redesign are outside this wave.

## Repository and production gates

CodeQL/Semgrep passes are exact-version scanner evidence, not an exhaustive semantic audit. The separate AI failure has no current established cause; historical model diagnoses are not transferable. Verified signatures are required on main; classic protection previously returned403, so required checks/reviews are Unknown where unreadable. No independent APPROVED review is established. Do not weaken protection or rewrite ancestors to make the candidate appear mergeable.

Production Auth origin/template correction remains unresolved. Outbox PGRST205 does not distinguish missing migration from cache/exposure configuration. R2 jurisdiction endpoint form is valid; hosted CORS, credentials, Vercel environment parity and production ledger are still unverified. Vercel Hobby scheduling and worker capacity need operational acceptance; the Supabase Cron installer remains inactive by default and unapproved for production activation.

Production database is live with irreplaceable data. Never reset, destructively migrate, replay migrations or restore unverified data. A verified backup and successful isolated restore are prerequisites to a separately approved rollout. Restored Cron must not call production. Main auto-deploys and requires explicit exact-head release confirmation.

## Historical records

The [pre-M00 security README](https://github.com/redwan-cse/redwan.work/blob/351b9dbb1a8e3aa5f91cf1b3dd72b0c3e89a3647/docs/security/README.md) preserves earlier probe tables and shipped-phase claims for provenance only. They are not new execution, current production proof, or permission to repeat live probes. The original sign-out API, all-shipped, raw-error logging and routine live-fixture statements are superseded by this document and the M00 ledger.

Use the [safe audit runbook](AUDIT-PLAN.md). Full semantic review of every feature/privacy document remains incomplete; preserve unknown historical consent/retention evidence rather than inventing policy or deleting production data to match old prose.

## October 6, 2026: official CSS dependency repair in PR63

This dated section supersedes earlier dependency-readiness claims for the current candidate without rewriting the historical records above. The owner approved exactly five development files, isolated proof/publication and final ordinary PR CI. No main merge, deployment, provider/production access, AGY or retained-host operation was included.

The [Foundation failure at 3e5d4bb](https://github.com/redwan-cse/redwan.work/actions/runs/37406543596/job/112085262082) reported five affected graph entries arising from two root advisories, not five independent vulnerabilities: [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), indexed source-map resource exhaustion, and [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), quadratic flat-selector parsing. Request-path exploitability in this application was not established; trusted build-time use and untrusted synchronous parsing are different exposure paths. The full audit was not waived.

### Selected official artifacts and compatibility

Exact overrides now select `source-map-js: 1.2.2` and `postcss-selector-parser: 7.1.6`. Tailwind 3.4.18, postcss-nested 6.2.0, tailwindcss-animate 1.0.7, the prior braces override and every unrelated lock entry remain unchanged. Parser 7 is outside Tailwind 3's declared 6.x range, so this choice required real consumer and generated-CSS proof rather than relying on npm's suggested remediation.

- `source-map-js@1.2.2`: official tarball `https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz`, integrity `sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==`. BSD-3-Clause, no runtime dependencies or inspected install hooks.
- `postcss-selector-parser@7.1.6`: official tarball `https://registry.npmjs.org/postcss-selector-parser/-/postcss-selector-parser-7.1.6.tgz`, integrity `sha512-7qASPzhKF2l2KLboRZux8CCTRMdGiV08vWmyKzPz22qZ7ZjQBOeY7rNzNoCLSUiftJ7HUq0GERHmxw/t0dCdMw==`. MIT, unchanged `cssesc:^3.0.0` and `util-deprecate:^1.0.2` runtime dependencies, no inspected install hooks.

Source review examined the [source-map security patch](https://github.com/7rulnik/source-map-js/commit/cf7658058ceeaa8619d5ae0ec90be6905209d016) and release tag at `0a1d334fd1e55a47df97fcd60a7915d46df3b08a`, plus the [parser complexity patch](https://github.com/postcss/postcss-selector-parser/commit/62b191792df0a0bc56062e5a875bc74aae2a51cd) and release tag at `556def3c707d81e9c3b3fb434b3e6c0b709be274`. Parser 7's insertion-during-iteration change and later Tailwind-compatible non-node serialization fix were explicitly considered.

### Observed test-first and package proof

[Preparation job 112130696241](https://github.com/redwan-cse/redwan.work/actions/runs/37421193193/job/112130696241), attempt 1 at test-first head `588e1cede34438c4234dc05fa5c6560e18906ae6`, completed successfully at 05:58:49 UTC on October 6. It verified the approved starting manifest/lock blobs and all 689 lockfile entries (including the root), installed the unchanged baseline with lifecycle scripts disabled, and observed both intended failures: `ERR_SOURCE_OFFSET_REJECT` and `ERR_SELECTOR_QUADRATIC`. The latter counts numeric-array search work on bounded class/ID/interpolation fixtures, not a flaky elapsed-time threshold. Each probe uses a time/memory-bounded child process.

The job verified exact tarball SHA512 against registry metadata, inspected bounded archive paths/types and package lifecycle/dependency metadata, and passed `npm audit signatures` in an isolated package fixture. This establishes the observed artifact and registry-signature checks; it is not a claim that every distributed file was independently rebuilt from upstream source or that provenance was available for every package.

Only two existing lock entries were replaced using npm-generated metadata. The package population and all unrelated entries were deep-equal to baseline. Fresh frozen installation preserved manifest/lock hashes. The complete dependency regression file and unchanged full `npm audit --audit-level=low` passed before publication. Existing fail-closed/redaction, Next/compiler, brace-expansion and braces source/consumer protections remain.

New regression coverage exercises invalid/excessive and cumulative indexed offsets, nested-source getter amplification, normal mapping/SourceNode behavior, flat-selector complexity, selector round trips and safe mutation, Tailwind's unescape import, PostCSS nesting/source maps, and exact patched-version resolution for every locked consumer. No audit omission, severity change, unrelated package upgrade, Tailwind 4 migration or application/CSS configuration edit was used.

### Generated-CSS equivalence and guarded publication

Baseline and candidate generated output was compared as complete CSS and source-map objects, without normalization: actual `app/globals.css` using the existing Tailwind configuration, representative responsive/dark/focus/group/peer/arbitrary/data-state/animation utilities, and a nested-selector/media fixture. All were byte-identical. CSS SHA256 receipts:

- App: `98d05e4eb6324dc173203bb4933b97f7d169aadcda85ffa5502c88c55ba58dfc`.
- Utility fixture: `faa7f0914bb2bf305575aa1c29a0f6edcf26fa774b3c037f4f64467ecfd9473a`.
- Nesting fixture: `be2a98bf06377d4eb88541c9486c4992a283bcdfdcb39b975d440303502a0093`.

[Publisher job 112130902386](https://github.com/redwan-cse/redwan.work/actions/runs/37421193193/job/112130902386) completed successfully at 05:59:02 UTC. Only that clean job held job-scoped `contents:write`; it performed no checkout, dependency installation or project/artifact-code execution. It validated inert payload bytes, two exact paths, expected parent/base, unchanged unrelated data and the fixed package contract before a non-force branch update and blob readback. Both jobs' exact temporary-file cleanup steps succeeded.

Published dependency commit [`a8469df75851faf145d72345bb8597c6d67b12b9`](https://github.com/redwan-cse/redwan.work/commit/a8469df75851faf145d72345bb8597c6d67b12b9), tree `6ec8fc7d95e111094fa053859a8a0745686aa890`, has parent `588e1cede34438c4234dc05fa5c6560e18906ae6`. Its directly reviewed diff changes only the two manifest overrides and version/resolved/integrity fields of the two locked packages. Main remains `a86b2934556af04c74279d00ad1b0dbde3d81ec6`.

The one-use CSS workflow is retired in this documentation commit to an inert read-only marker with no executable publisher, artifact consumer or credential binding. Both older consumed publishers remain untouched. This final ordinary development commit triggers the existing PR acceptance workflows.

### Final-candidate and release boundaries

Preparation success and conditional publication are established, not automatically final whole-candidate acceptance. Inspect Foundation's audit/build/browser smoke, Reliability tests/lint/types/build/manifests, security checks and Combined Auth/provider/lifecycle/wave acceptance plus cleanup at the exact retirement/documentation head before claiming all required development verification passed. Old head checks do not transfer to changed executable dependencies.

SEC-02 was independently closed on the prior candidate, and its implementation bytes remain unchanged. This dependency repair has engineering self-review, not native approval or a new independent G1 disposition. Applicable hosted/manual/operational gates, consolidated AGY acceptance, backup/isolated-restore and rollback readiness, current protection requirements and separate exact-head release authorization remain. No merge or production-readiness claim follows from this dependency repair alone.
