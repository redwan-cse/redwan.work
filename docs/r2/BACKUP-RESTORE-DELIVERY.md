# Approved backup and local restore delivery

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
