# R01: reachable error redaction

Owner approved R01 repairs with test-first verification on10 September2026, following the source trace at7ea2a7fff0ed6a17283a947ff9c36ec9c5d87da3. Canonical shared tracker remains [PR56](https://github.com/redwan-cse/redwan.work/pull/56) and original audit issues. No automatic issue closure, release or production approval.

## Scope and implementation

Four application files changed in [1fe6b99d](https://github.com/redwan-cse/redwan.work/commit/1fe6b99d30a3fe2be41651b2abf99501b3011b69),17 additions/20 deletions; actual diff reviewed. Only diagnostic output changed, not auth/rate/replay/file validation/retention/schema/cache/pagination behavior.

| Reachable entry | Unsafe source replaced | Fixed diagnostic / public response |
|---|---|---|
| /contact -> enhanced-contact-form -> POST /api/uploads/presign -> consumeDbRateLimit | Error.message or whole RPC thrown value | Contact presign rate control unavailable.; existing503 unchanged |
| Same presign route, rejected origin | Raw caller Origin/Host | Contact presign origin rejected.; existing403 unchanged |
| Same route, siteverify denial | Untrusted provider error-codes | Contact presign verification rejected.; existing400 unchanged |
| Same route, fetch/JSON exception | Entire provider exception | Contact presign verification unavailable.; existing503 unchanged |
| Same route, outer/signing exception | Exception message | Contact presign submission failed.; existing500 unchanged |
| GET /blogs -> getBlogPostsPage -> fetchBlogPostsPage | Whole credential/auth/upstream error | Blogger fetch unavailable.; existing empty-post fallback unchanged |
| GET /admin/emails -> listEmailLogs | Truncated PostgREST message potentially quoting recipient filter | Email log query unavailable.; fixed thrown Email log is unavailable. unchanged |
| Bearer-protected POST /api/revalidate?path=/blogs | String(err) in500 JSON | Blog revalidation failed. server category; response retains message Error revalidating and error field becomes Revalidation unavailable. |

No arbitrary exception text, filenames, submitted recipient/filter values, tokens, request headers or provider response objects are included in these repaired diagnostics. Existing fixed timeout/configuration categories remain. Do not silence logs entirely: the fixed operation/category identifies the failing boundary. No new identifiers, middleware correlation system or request-derived log metadata introduced.

Presign's first rate RPC is before successful bot verification; public reachability of its sink does not mean public access to server logs. The email viewer remains normally admin-gated. Revalidation still fails closed on missing/mismatched bearer or denied paths; its mutation endpoint was not contacted outside synthetic tests. No production disclosure or exploit is claimed.

## Executed test-first baseline

Test-only commit e322c60acdfe1c64badb6ab23e8c895e0842a979, [red run](https://github.com/redwan-cse/redwan.work/actions/runs/34426901220):19 cases,8 PASS,11 ASSERTION_FAIL,0 EXECUTION_FAIL. Real modules loaded; sentinel leakage contradicted desired contracts. Application repair followed this execution. No test was weakened, skipped-as-pass or marked green by ignoring exit status.

Tests: tests/r01-redaction.mjs, executed by .github/workflows/r01-redaction.yml using Node22.23.1, committed npm lockfile and a network-disabled read-only container. Actual route/service modules are imported with explicit synthetic Next/Supabase/storage/Google adapters. These are module-boundary fault-injection tests, not full browser, real SQL, hosted provider or production log acceptance.

Matrix includes presign pre-siteverify RPC returned error/thrown Error, replay RPC error, siteverify fetch/JSON/denial, signing exceptions, origin context, timeout and success; Blogger upstream/credential-parse/cache-hit; email page-error/range/count-error; revalidation throw/authorization-path denial/success. Each test preserves status/side-effect controls and inspects both returned data/errors and console arguments where applicable. Logs are captured privately, only case labels and PASS/ASSERTION_FAIL/EXECUTION_FAIL outcomes published. No provider credentials enter dependency install or test loops.

The original19-case suite is reused unchanged after repair. Exact current-head green and broader regression/SQL/browser/security execution results belong in PR56; this source record does not predict outcomes. Temporary globals/console hooks/fetch are restored by test teardown; no actual users, objects or rows created by the sentinel suite. Existing disposable acceptance jobs retain their own verified fixture cleanup and service teardown.

## Scope boundaries and remaining gates

No client UI behavior was changed, so no new browser-error-boundary sanitization claim is made. Existing broad application/browser/database suites must be checked for the exact candidate. No historical email_log.error rows inspected or rewritten; rendering of such stored text remains a separate unverified concern. No complete repository-wide sink or built-action-manifest audit claimed.

Blogger pagination/cache/empty-state redesign remains B01/B02; only its raw catch output changed. No post-OTP recovery, consent-version/privacy/schema/backfill, retention/deletion, production Auth correction, real email, scheduler activation, main push or merge. SQL migrations0001-0017 immutable; production ledger and backup/restore readiness remain unverified. Both maintenance GET endpoints are mutations, never read-only probes.

Independent review absent; this is self-review. Policy-version acceptance and separate AI failure remain visible and out of R01 scope. No release readiness follows from named tests passing. Current PR56 state supersedes historical M00 documents describing these four sinks as still unmodified.
