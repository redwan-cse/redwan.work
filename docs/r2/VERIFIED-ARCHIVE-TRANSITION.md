# Verified archive transition

The original archive action and the later recoverable purge path were separate implementations. Final review found the original archive action still used unpaginated REST child reads and customer filenames as ZIP paths, and marked the project archived without comparing a current snapshot. The original path now delegates to verified-archive.ts.

The service reads one complete SQL snapshot, writes project/milestone/file and recovery manifests, stores file bytes under immutable file IDs rather than display filenames, enforces uncompressed and compressed limits, and reads the uploaded ZIP back to verify hash and length. Additive migration 0030 then locks the project and children, compares the exact snapshot and records archived_at/archive_key only if unchanged. Failure leaves source rows and files in place. An uploaded but refused backup may remain for operator review rather than being silently deleted.

The existing project.json and milestones.json entries remain; files.json maps names and storage metadata to files/<file-id> entries. Restore tools must use the manifest, not assume display filenames are ZIP entry names. The later purge path still creates and verifies its own fresh recovery archive.

Tests verify safe ZIP paths with hostile display filenames, read-back mismatch refusal, snapshot-change refusal and service-only transition privileges. Real S3 compatibility and complete restore remain covered by the combined disposable acceptance suite. No production migration or actual customer-data operation is authorized by these source changes.
