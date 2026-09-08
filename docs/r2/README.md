# R2 storage and recovery

This guide describes the unmerged remediation branch. Historical implementation/probe evidence remains in [the pre-remediation guide](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/r2/README.md), not as a current production guarantee.

Private contact files use contact/<folder UUID>/<file UUID>.<ext>; portal uploads use private/<client UUID>/{pending|ticket_<id>|project_<id>}/<file UUID>.<ext>. Recovery ZIPs use archive/project_<id>/recovery_<UUID>.zip. Public assets use a separate bucket and assets/<year>/<UUID>.<ext>.

The browser uploads private files directly through short-lived presigned PUT URLs. Server confirmation validates namespace/ownership, extension/MIME and integer size, then verifies the actual stored length. Content signatures/malware are not scanned; metadata and size checks are not a malware guarantee. Private download links require current account authority and ownership, then expire after 60 seconds.

## Cleanup

Contact/pending candidate references are checked by complete SQL EXISTS queries under per-key locks. Reference triggers share those locks and reject tombstoned keys, preventing late confirmation after deletion authorization. Retention reads bounded object/project pages and records durable progress cursors so retained objects do not starve later pages. See [bounded maintenance](BOUNDED-MAINTENANCE.md).

Project removal requires a freshly constructed recovery ZIP containing a complete row manifest and every file's bytes. Its storage read-back must match SHA-256 and length. SQL locks the project/children, rechecks the snapshot and invoice references, and atomically persists recovery/deletion tracking before removing the project. A database refusal leaves source storage untouched; a subsequent storage failure leaves a recoverable snapshot, ZIP and pending deletion. Per-key provider acknowledgements are mandatory before marking completion. See [recovery contract](RECOVERABLE-CLEANUP.md).

Recovery archives are not independently age-deleted. Owner-approved retention/disposal and a demonstrated restore are required before changing that hold. Success from the project purge action means recovery preparation committed, not that all queued storage bytes already disappeared.

## Configuration

Private: R2_ENDPOINT, R2_PRIVATE_BUCKET, R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY. Public: R2_PUBLIC_BUCKET, R2_PUBLIC_ACCESS_KEY_ID, R2_PUBLIC_SECRET_ACCESS_KEY, NEXT_PUBLIC_R2_PUBLIC_BASE_URL. Keep separate least-privilege bucket credentials. Build-time private R2 origin configuration feeds CSP. Bucket CORS must permit the actual application origins, PUT and Content-Type; the app's object token cannot be assumed to manage bucket CORS.

The current public-asset action still carries file bytes through the host. Correct Next.js serverActions nesting does not remove the independent hosting request ceiling; the full advertised 5 MB asset path requires hosted acceptance or direct-public-upload redesign before release.

GET /api/cron/r2-retention remains CRON_SECRET bearer-gated. Never run it against production as a test. Use disposable storage/database fixtures and record exact cleanup results. A test pass is not proof that production backups can be restored.
