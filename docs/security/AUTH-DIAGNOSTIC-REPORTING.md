# AUTH-DIAG-01: structured reporting, synthetic only

Approval: September9 2026,12:02 Asia/Dhaka, fix diagnostic reporting using synthetic tests only. Shared Superpowers/Ralph/GSD plan reuses PR56 and the approved diagnosis; no new production design or access granted. The historical provider failure remains unknown.

## Reproduction and repair

Executed the old correct() with an in-memory403 response and unchanged config. It returned the string ROLLED_BACK; the new required contract UPDATE_REJECTED plus rollback_attempted=false failed for that precise semantic defect. The same denial regression passes on the new implementation. Sixteen synthetic tests passed locally against the replacement before branch publication. They are fixture tests, not live provider/browser acceptance or independent review.

correct(io, save, wait) now returns a structured finite report instead of one ambiguous string. The retired production/CLI/HTTP entry points are NOT restored. io and save are injected fixture functions; wait is an injected deterministic test scheduler, default no-op. No provider transport, credentials, environment reads, raw-config files or status publisher exist in the module. Older transport-policy helper exports with no runtime callers were removed; the current synthetic suite uses only the pure exports.

Report fields: outcome, stage, cause, update_http, read_http, rollback_http, targets, unrelated, verify_reads, rollback_reads, read_errors, first_read_error, rollback_attempted, rollback_verified. Status values are integers100-599 or null; no provider message/body/URL/credential enters the report. Stage identifies the last control-flow phase and cause retains the initiating diagnostic category. targets describes the last update/guard observation (not the final rollback state); rollback_verified separately describes observed restoration. read_http is the latest read response; first_read_error and count preserve prior read failures without raw text. Unrelated drift remains sticky and cannot be erased by a later equal sample.

## Outcomes

- UPDATE_REJECTED:4xx response and observed original targets/unrelated values. No rollback claim or write retry.
- UPDATE_UNCERTAIN: ambiguous transport/5xx/non200, unavailable verification or guard. Even desired values after lost acknowledgement are not a clean success. No speculative retry/restoration under ambiguous update transport.
- NOT_OBSERVED: accepted200 but original target values still observed after the bounded read window. Not a rollback and not a guarantee the provider cannot apply later.
- VERIFIED:200 acknowledgement, exact desired targets, no observed unrelated drift. Transient read errors remain separately recorded.
- REFUSED / ALREADY_CORRECT: pre-write failure/idempotence with zero fixture writes.
- CONFLICT: foreign targets or guard movement; no blind overwrite.
- ROLLBACK_VERIFIED: a restoration was actually attempted, acknowledged200 and original two values subsequently observed. Does not claim unrelated external drift was undone.
- ROLLBACK_UNVERIFIED: rollback attempted but acknowledgement/readback missing or rejected. Original values alone after a lost acknowledgement do not become success.

Up to3 update readbacks and3 rollback readbacks, with injected waits before attempts2/3. One update attempt only; at most one separately guarded restoration for an acknowledged update whose owned partial/changed state persists. Guard rechecks target equality to the last observation, including changes between allowed values. Read/check/write is not atomic CAS, and three observations do not prove infinite future stability. This is not production-ready transport/recovery orchestration; a future production adapter needs separately approved timeouts, pacing, persistence and privilege review.

## Verification

Sixteen cases cover denial versus rollback, success/idempotence/presentation, delayed desired visibility, unobserved update,5xx/transport ambiguity, applied-but-acknowledgement-lost, transient/persistent/malformed readback, partial mutation, unrelated drift, third-party changes, rejected/unreadable restoration, baseline/snapshot refusal, ambiguous templates, finite-schema confidentiality, lost rollback acknowledgement and delayed restoration. Assertions count fixture writes and injected waits. Both intended red and green were actually executed locally. Scratch source serialization was normalized in memory before execution; GitHub repeats actual checked-out file execution.

Credential-free Actions workflow has contents:read only, no Production environment, no secrets mapping, no writes to statuses, no package installation. It statically checks that transport/environment/filesystem entry points stay absent, then runs the fixture tests in an isolated network namespace with sudo unshare --net. If isolation is unavailable the test job fails; it does not fall back to networking. Checkout/setup are pinned and operate before the isolated test step. CI outcome must be read for the actual commit before claiming CI verification.

Only module, its fixture suite, its already-retired workflow and this document changed. App source/migrations/Auth settings/mail/R2/Cron/main/PR state remain untouched. Historical diagnosis and correction outcomes remain in AUTH-READONLY-DIAGNOSIS.md and AUTH-ORIGIN-RECOVERY-RESULT-2026-09-09.md, not rewritten as solved production incidents. Implemented and local-tested; independent review/release not claimed. No production retry authorized.
