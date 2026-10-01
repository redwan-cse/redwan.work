# Approved immutable upload safety extension

## Current verification checkpoint: 29 September 2026

The [canonical PR57 readiness record](../security/PR57-READINESS-2026-09-29.md) records exact b4430c1 CI and operator-reported 143/143 preparation plus 61/61 runtime tests, including staging/replay, interrupted restore and browser A-E. The sequence below is the preserved original design, not an unexecuted current handoff or a fresh approval.

The trusted-storage boundary below is unchanged: synthetic S3 acceptance does not prove hosted R2/CORS parity, bucket-credential compromise resistance or production backup/restore readiness. Do not infer safety for old mutable objects, discard retained backups, retry consumed packets or alter production. The two review repairs in the current publication carry separate local evidence and require exact-new-head verification.

---

Owner approved2026-09-17. Starting head6d57642b7c5f636f394f0d726222b2833447f046. PR57 stays draft; no production, merge, backup purge or consent activation.

Goal: separate browser-writable staging keys from server-finalized bound keys, retain byte integrity evidence, and hold unsafe legacy deletion paths. Then complete resumable restore checkpoints and compatibility tests before AGY browser handover.

Implementation sequence: test-first immutable key/proof service; block signed PUTs to reserved final keys; finalize application uploads before binding; verify object identity before backup/delete; retain legacy objects rather than infer their safety; checkpoint exact restored staging objects; test existing ZIP producer compatibility and current-admin download authority. No claim of full completion.

Trust boundary: this protects against previously issued application presigned upload URLs. Trusted storage operators or stolen bucket credentials remain outside a claim of immutable storage. Existing v4 source keys are not retroactively safe, and merely copying a source must not authorize deletion of a concurrently overwritten original.
