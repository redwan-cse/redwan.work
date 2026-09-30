# Approved backup and local restore delivery

## Current verification checkpoint: 29 September 2026

See the [canonical PR57 readiness record](../security/PR57-READINESS-2026-09-29.md). The scaffold-only checkpoint below is historical: the development branch now implements the backup catalog, local import preview, explicit no-overwrite restore, immutable upload proofs and resumable checkpoints.

At exact candidate `b4430c187cb3b46c953cd6660b59146fa5d2204e`, AGY reported all eight ordered suites passing (61/61 runtime tests), including real-backup-restore, interruptions, session authorization, staging replay and browser A-E. This is accepted operator-reported non-production evidence, not direct host observation or production recovery proof.

Independent review subsequently found that completed POST replay needed the same current unbanned-Auth gate as GET/layout. The accompanying bounded repair and 19 actual-route/helper regressions address that gap; the old runtime result does not certify the changed source. Existing backup-hold policy, no-overwrite semantics, retained resources and migration bytes are unchanged. No purge, policy change, production operation or new host execution is authorized.

---

Owner approved the backup/restore contract on 2026-09-17 through ClickUp. Starting head ff8b627f864d1f11d7b59056bcf3d037252cd250, shared tracker PR57 with existing issues30/36/43/47. Merge, production, scheduler changes and consent activation remain separately gated.

Scope: verified private R2 backup before individual application deletion of ticket attachments/project deliverables; admin direct signed backup download; admin local-backup upload, preview and explicit confirmed restore without overwrite; reuse project recovery packages. Backup copies held with no automatic expiry until owner approves disposal. Automatic contact/pending expiry and public assets excluded.

States are separate: designed, implemented, tested, self-reviewed, browser-verified, released. No present completion claim.

## Dependency order

1. Bounded strict ZIP encoding/decoding, legacy safe entry compatibility and hostile upload tests.
2. Forward SQL backup registration/snapshot guard and individual deletion integration. Prevent workers draining individual jobs without valid backup proof; legacy jobs require review.
3. Admin catalog and signed download; direct local upload to private staging, stable byte verification, restore preview.
4. Atomic no-overwrite restore and idempotency with new identifiers/object keys and current-parent/owner checks. No recreated Auth accounts/financial history or implicit notifications.
5. Exact-head regression, types, lint, build, disposable SQL/storage and AGY browser handover. Uploaded archive integrity is not proof of trust/authorization; no customer data in CI.

## Current checkpoint

Initial test-first scaffold and standalone archive contracts only. Live deletion behavior NOT changed; no new recovery interface or migration yet. ZIP parser must bound compressed/expanded bytes and entries; reject traversal, duplicates, symlinks, encryption, ambiguous layouts, corruption and unsupported features. Existing archives use recovery.json and files/<UUID>; optional project.json/milestones.json/files.json remain metadata.

Do not claim the previous immediate-delete implementation provides a restore window. Do not delete or reclassify existing backup copies or queue data to make tests pass. AGY must not modify this branch concurrently; its later assignment is bounded browser verification.
