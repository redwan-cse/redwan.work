# Fresh acceptance claim challenge

Owner requested actual acceptance execution and next-step advice September9 at15:58 Asia/Dhaka. Baseline application3a31f664c6f1615488de156613b5ade995245829. Test-only additions, no app/schema changes, main push, merge, production credentials or provider reads/writes. This branch commit triggers fresh regression/build, SQL, foundation, contact/browser, Auth/mailbox/storage/restore and security checks. Prior green jobs are historical, not today's fresh result.

New credential-free, network-isolated challenge imports the actual ticket/client/parser modules with explicit service fixtures. It tests ticket count/read/write errors, both admin role stores and admin deactivation refusal, explicit consent/time and the separate issue45 policy-version criterion. It reports each claim as PASS/FAIL and the job fails if any claim fails; no continue-on-error or false green wrapper. It cannot prove real service behavior from mocks or a global final-admin invariant under arbitrary direct SQL/concurrency.

Known evidence boundaries must remain NOT VERIFIED rather than pass: actual hosted contact upload/route/persistence chain; multi-instance public rate controls; full ticket attachment upload/local removal/cancel/reload/visibility journey; all legacy action manifest consumers; measured database/API p50/p95 and query budgets; complete semantic documentation audit; policy-version/historical consent interpretation; live provider/deployment/backup/restore/configuration/review gates. Existing suites exercise related paths, not necessarily each full acceptance criterion. No production retry is authorized.

Results will be read after execution. Any newly failing acceptance claim should be tracked before release, not silently fixed by weakening the test or marking its audit issue done. Thirteen PR closures were consolidation only; the20 audit issues remain open and56 remains unmerged.

---

# M00: approved wave checkpoint, 10 September 2026

This section supersedes future-tense result language above; the preceding record is preserved as historical context. Single release tracker: [PR56](https://github.com/redwan-cse/redwan.work/pull/56). Original issues28-47 remain unchanged and OPEN, refreshed via the repository issue API. This is a supporting criterion ledger, not a second Ralph/GSD backlog.

## Authorization and version

Owner explicitly approved M00/A01/I01/I02 and the whole-dollar budget rule, then approved NDA compatibility and continuation. Other master-plan stories remain proposed. Baseline candidate351b9dbb1a8e3aa5f91cf1b3dd72b0c3e89a3647, main27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a, both refreshed before this test-only commit. PR56 draft/open/unmerged; no independent APPROVED review. No production, schema, retention, consent-version, post-OTP, scheduler, real-mail, main-push or merge authority.

NDA contract: new wire values true/false; accept the exact legacy checked string `Yes - NDA or strict confidentiality required`; empty/omitted means unchecked; unknown, non-string and duplicate values reject, never silently false. Budget contract: both blank/omitted -> null/null, otherwise both decimal-digit whole-dollar USD integers satisfying0 <= minimum <= maximum <=10,000,000. Reject decimals, exponents, signs, suffixes, overflow, partial/reversed ranges and duplicate/non-string fields; no clamping/truncation. Surrounding whitespace may be trimmed consistently; it does not change the numeric value.

A01 contract: canonical same-origin relative return paths, reject controls/backslashes/protocol-relative forms, preserve normal UUID/hyphen paths and query strings. Existing destination authorization stays authoritative. Failure proof must include actual action tests and actual built-browser final origin/path before A01 is Verified.

## Evidence vocabulary

Verified means the named assertion executed successfully at the named version/environment, not the entire issue. Failed means executed contradiction. Source finding means inspected code with integration pending. Untested means insufficient execution for the full criterion, even when related assertions passed. Decision required and Externally blocked are not passes. Implementation, verification, independent review, deployment and monitoring remain separate.

Prior evidence below is ONLY for351b9dbb and must not be relabeled a run on a later source version:

- R: [regression/lint/types/build](https://github.com/redwan-cse/redwan.work/actions/runs/34338279441/job/102422741109), PASS.
- D: [disposable SQL/RLS/transactions/Cron](https://github.com/redwan-cse/redwan.work/actions/runs/34338279296/job/102422853236), PASS.
- A: [disposable Auth/mailbox/browser/storage/restore/contact pipeline](https://github.com/redwan-cse/redwan.work/actions/runs/34338279359/job/102422800783), PASS. Contact siteverify mocked; direct route invocation is not a hosted browser chain.
- C: [contact desktop/mobile](https://github.com/redwan-cse/redwan.work/actions/runs/34338279386/job/102422740425), PASS with intercepted local contact response.
- F: [foundation/framework/browser](https://github.com/redwan-cse/redwan.work/actions/runs/34338279496/job/102422740879), PASS.
- Q: [audit claim challenge](https://github.com/redwan-cse/redwan.work/actions/runs/34338279272/job/102422739897), FAIL policy version; named ticket failures/admin-store protections/explicit consent-time PASS with synthetic adapters.
- S: [CodeQL](https://github.com/redwan-cse/redwan.work/runs/102422866972) and [Semgrep](https://github.com/redwan-cse/redwan.work/actions/runs/34338279480/job/102422740584), PASS; [AI check](https://github.com/redwan-cse/redwan.work/actions/runs/34338278125/job/102422740492), FAIL, current cause unknown.

## Criterion ledger

Each row preserves an obligation from the original issue, not an edited acceptance criterion. Partial support is explicitly not full verification. Test paths below are under tests/reliability unless qualified. Names identify candidate evidence to drill into; file existence alone is not verification. Production and independent review are absent for every row unless separately recorded.

| Issue | Criterion | State / existing evidence / missing proof |
|---|---|---|
| [28](https://github.com/redwan-cse/redwan.work/issues/28) | Both role stores and every account transition | Untested in full; A account-lifecycle.acceptance.mjs covers named invite/ban/unban/protected-account transitions, not every role change |
|28|Session and token lifecycle semantics|Partial A expiry/refresh/replay; current-account cutoffs differ from global session revocation; hosted Auth unresolved|
|28|Partial failures, retries, no duplicate onboarding|Partial A; post-OTP update failure/recovery Untested, A02 decision required|
| [29](https://github.com/redwan-cse/redwan.work/issues/29) | Active/inactive/changed-role access | Partial D account-db.py/account-state-db.py and A; every callable entry point inventory incomplete |
|29|Application/direct database agreement and owner/cross-client access|Partial D RLS plus A real sessions; full manifest V01 pending|
|29|Forward schema and verified recovery, immutable applied migrations|No schema in this wave; production ledger/backup/restore Externally blocked|
| [30](https://github.com/redwan-cse/redwan.work/issues/30) | Refused cleanup preserves data and archive | Partial D/A archive-mark-db.py/archive-storage.acceptance.mjs; full retained-object policy Decision required |
|30|Financial dependencies, interruptions, retries, backup integrity|Partial D/A verified archive and real local storage; production backup/isolated restore Externally blocked|
|30|Verifiable manifest and no implicit retention/migration change|Partial verified-archive.test.mjs/A; retention choices unapproved, no new cleanup authorized|
| [31](https://github.com/redwan-cse/redwan.work/issues/31) | Actual staging upload/submission valid bytes and metadata | A contact-pipeline.acceptance.mjs actual POST/parser/store/DB/MinIO; hosted/browser-presign-provider chain Untested |
|31|Missing objects, mismatch, invalid scope, stable denials|Verified named A direct-route negatives; full hosted chain Untested|
|31|Attachment-free behavior and actual-route coverage|Verified named A direct-route assertions; browser-to-DB NDA/budget coverage pending I01/I02|
| [32](https://github.com/redwan-cse/redwan.work/issues/32) | Locked build without unknown config warnings | Partial R/F integrated-framework.test.mjs; refresh on changed candidate |
|32|Representative/exact-boundary uploads and clear oversize/type denials|Partial A/C/storage.test.mjs/public-assets.test.mjs; hosted exact limits Untested|
|32|Hosting constraints verified separately|Externally blocked: Vercel/R2 CORS and env parity not established|
| [33](https://github.com/redwan-cse/redwan.work/issues/33) | No partial ticket/message/attachment transaction | Partial D database.py and A; real full-browser confirmation T02 pending |
|33|Concurrent quotas and idempotent retries|Partial D transactional tests; lost response/reopen UI identity Untested|
|33|Notifications correspond to commits; service-only writes|Partial D outbox-db.py/A; all action-manifest callers Untested; no migration authorization|
| [34](https://github.com/redwan-cse/redwan.work/issues/34) | Count/read/write failures and fixed action responses | Verified named Q tests/audit-claim-challenges.mjs with synthetic adapters |
|34|Stable UI failure propagation|Untested in full; source finding: thread failure maps to404, T01|
|34|No internal sentinels, useful validation and safe categories|Partial Q/R; remaining diagnostic sinks R01 still Source findings|
| [35](https://github.com/redwan-cse/redwan.work/issues/35) | Missing config/dependency failure, no persistence, stable messages | Partial R contact.test.mjs and A direct-route configuration denial |
|35|Multi-instance quota|Untested full HTTP deployment; A20 concurrent actual shared RPC requests accepted exactly5|
|35|Bot/replay independently verified, dev override isolated|Partial R/A replay guard; Cloudflare siteverify mocked, hosted bot assumptions Untested|
| [36](https://github.com/redwan-cse/redwan.work/issues/36) | Mixed/missing storage outcomes and retry | Partial R file-deletion.test.mjs/file-deletion-order.test.mjs and A individual-storage.acceptance.mjs |
|36|Failed items retain authoritative tracking|Partial D individual-deletion-db.py/A; production not exercised|
|36|Accurate counts and idempotent repeated success|Partial R/D/A; abandoned unbound-key lifecycle S01 remains Decision required|
| [37](https://github.com/redwan-cse/redwan.work/issues/37) | Actual creation/reply workflows | Untested full browser upload-confirm-thread journey; T02 |
|37|Existence/size/scope/duplicates/invalid batches without side effects|Partial R storage.test.mjs, D deliverable-confirm-db.py and A; contact route is not every ticket path|
|37|Positive upload/download preserved|Partial A storage/browser fixtures; full sharing/cancel/reload matrix pending|
| [38](https://github.com/redwan-cse/redwan.work/issues/38) | Durable renderer/dispatch/audit-store failure tracking | Partial R outbox.test.mjs/email-diagnostics.test.mjs and D outbox-db.py |
|38|No duplicate sends and available business actions|Partial D/A idempotency/fencing; actual provider acceptance/live delivery Externally blocked|
|38|Six local renderers separate from invitation mail|Partial local tests vs A actual disposable invitation mailbox; hosted invitation not established|
|38|Timeout ambiguity/reconciliation|Partial tested frozen-envelope rules; paid/void freshness F02 Decision required; monitoring Untested|
| [39](https://github.com/redwan-cse/redwan.work/issues/39) | Locked dependencies/scanner inventories/branch controls | R/F/S evidence partial; classic protection403 means Unknown, signature constraints retained |
|39|Failures visible and artifacts retained|Q failed criterion remains red; no continue-on-error or skipped-as-pass; current AI cause Unknown|
|39|Exact commands/version/exit/environment, current execution|Prior evidence links above; new tests require new exact-head results; independent approval absent|
| [40](https://github.com/redwan-cse/redwan.work/issues/40) | Privileged accounts protected in both stores | Verified named Q synthetic mismatch/admin-deactivation refusal; A protected administrator case |
|40|Final active admin explicit validated policy|Decision required/Untested arbitrary SQL/concurrent global invariant|
|40|Invite/role-change separation, existing/unclaimed/partial failure|Partial A lifecycle plus inspected clients.ts; every intentional role transition Untested|
| [41](https://github.com/redwan-cse/redwan.work/issues/41) | Current integration/env ownership/test matrices/residual risks | Partial docs/contact/README.md; stale root/security/runbook instructions identified below |
|41|Source/isolated/live/historical/unavailable separated|This ledger records boundaries; full semantic doc audit incomplete|
|41|Local renderer vs external invitation, exact pass artifacts|Prior R/D/A/C/F/Q/S links exact to351b9dbb; no new verified pass claimed|
| [42](https://github.com/redwan-cse/redwan.work/issues/42) | Imports and built action manifests before removal | Untested complete inventory, V01; no removal in this wave |
|42|Retained entry size/MIME/scope/abuse coverage|Partial shared upload tests only; latent export does not prove public exploit|
|42|Existing upload UI unchanged|C/A baseline partial; rerun after approved changes|
| [43](https://github.com/redwan-cse/redwan.work/issues/43) | Above-page reference inventory and protection | Partial R inventory.test.mjs/D retention-db.py with large fixtures |
|43|Missing/incomplete pages fail non-destructively|Partial R/D; complete namespace lifecycle and production inventory Untested|
|43|Chunk/checkpoint within runtime|Source support; actual sweep capacity/backlog S03 Untested|
| [44](https://github.com/redwan-cse/redwan.work/issues/44) | Scope before hydration and bounded stable pagination/concurrency | Partial D admin-reads-db.py/portal-reads-db.py; thread history remains Source finding T01 |
|44|Traverse above one API page completely|Partial D large fixtures; thread history and all legacy consumers Untested|
|44|Query counts and p50/p95; no shared private cache|Measurements Untested V02; no latency/SLO approval inferred|
| [45](https://github.com/redwan-cse/redwan.work/issues/45) | Explicit/omitted/declined consent distinct | Verified named Q synthetic parser and A actual-route consent denials |
|45|Affirmative policy/version/time|Failed policy-version Q; explicit timestamp passes; I03 not authorized|
|45|Submitted frontend contract|Partial C interception plus separate A route; actual browser-to-persistence NDA/budget pending|
|45|Historical meaning without fabricated consent|Decision required; no backfill or policy wording change authorized|
| [46](https://github.com/redwan-cse/redwan.work/issues/46) | Categories/safe context before storage/output | Partial Q/R; presign/email-log/Blogger/revalidate remain Source findings |
|46|Recipient/filename/message/financial sentinels absent|Untested across all sinks; named Q ticket sentinel cases only|
|46|Useful correlation, no truncation-as-redaction|Source finding email-log truncation; R01 deferred, no actual production disclosure claimed|
| [47](https://github.com/redwan-cse/redwan.work/issues/47) | Upload/local-remove/cancel/reload/thread visibility match copy | Untested complete real browser matrix T02; backend/source coverage is not UI acceptance |
|47|Existing sharing model clear or separately approved undo|Decision required for changed undo semantics; no broader deletion permitted|

## Initial entry-point and test inventory (discovery explicitly incomplete)

Observed API groups: app/api/auth, contact, cron, files, revalidate, uploads. Known active boundaries: POST /api/contact; uploads/presign, uploads/ticket-presign; auth/logout; cron/email-outbox and cron/r2-retention. Both cron GETs have side effects, never read-only probes. Complete route/export/build-manifest enumeration remains V01/M01 follow-up, not a completed security audit.

Observed action modules: lib/auth/actions.ts; lib/crm/admin-actions.ts, client-actions.ts, ticket-upload-actions.ts, workflow-actions.ts, public-asset-actions.ts. Active intake producer components/enhanced-contact-form.tsx -> app/api/contact/route.ts -> lib/contact/lead-schema.ts -> lead-store.ts. Sign-in consumer lib/auth/actions.ts -> Next redirect; downstream session/role gates are preserved. Service inventory includes clients/tickets/projects/invoices/attachments/files/retention/verified-archive/email-log, plus transaction/read/financial helpers. SQL development additions through0035; actual production ledger unverified. Test inventory includes reliability unit/source-adapter cases, disposable SQL scripts, product/account browser tests, real local storage/archive/restore, contact direct-route pipeline, and intentionally failed policy challenge.

## Documentation corrections governing this checkpoint

AGENTS.md correctly requires npm, strict TS, Tailwind3 and no main push without confirmation. Its Google Forms and graceful contact degradation descriptions are stale: actual intake is Supabase-only and fails closed on required configuration/rate-control failures. docs/contact/README.md is the newer contract.

Historical docs/security/README.md statements saying all phases shipped, deactivation calls an admin sign-out API, raw original errors belong in logs, or live probes are routine are not current authority. Inspected clients.ts disables the profile and applies/removes an Auth ban; current-account/cutoff enforcement is distinct from claiming global session invalidation. Candidate is not deployed. Raw diagnostics remain prohibited.

Historical AUDIT-PLAN.md linked-project prerequisites and destructive/live-mail probes are retired guidance, not runnable instructions. Use only credential-free builds and explicit disposable local Supabase/mailbox/storage fixtures. Never link/reset production, invoke maintenance GETs as diagnostics, replay migrations, restore old credentials, or infer production ledger0001-0017 parity from this old text. A verified backup AND isolated restoration plus separate approval are required before production DB rollout; clone Cron must not target production. Required checks/reviews are Unknown where access was denied, not absent.

These corrections are authoritative here; complete semantic replacement of all historical docs remains incomplete. Preserve historical records rather than relabeling old probes as new acceptance.

## Test-first execution checkpoint

Added tests/wave-one.test.mjs and .github/workflows/wave-one.yml as a bounded red-phase slice. Actual action/parser modules are imported, with explicit synthetic Supabase/Next/storage adapters. This is not browser, SQL, hosted or production acceptance. The job installs the committed lockfile without provider credentials, then runs tests in a network-disabled container. No test transport targets production. Expected desired-contract failures are not suppressed; every test must pass after repair. Existing consent-version challenge remains separately failed.

M00 status: all20 original issues accounted for at criterion level; inventory and documentation sweep explicitly incomplete. A01/I01/I02 implementation NOT YET performed by this test-only commit. Verification pending exact execution. Self-review only; independent review absent. Deployed: no. Monitored: no. Next: inspect meaningful red evidence, implement minimal fixes, then actual built-browser and disposable DB verification.
