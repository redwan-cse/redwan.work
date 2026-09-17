# Release readiness: 2026-09-09

## Implemented this continuation

Individual file deletion now prepares an authorized database transaction before any R2 deletion. The durable storage_deletions queue records file snapshot/actor identity and removes the visible file row atomically. Failure before commit preserves bytes; physical or acknowledgement failure retains retry tracking. Current profile/Auth/ban, client ownership/uploader/24-hour window and unarchived project checks apply. Existing storage worker drains individual jobs. The exact storage-first regression is tested against old commit afe82188a0e4ae7d5936ce9a448be7ea492f6551 and current implementation. See ../r2/INDIVIDUAL-FILE-DELETION.md.

Legacy project/invoice collection readers now use complete SQL snapshots with a declared 1000-row compatibility limit: they return complete scoped results or explicitly refuse in favor of existing paginated views. No REST cap silently drops rows, no JS filtering after global invoice hydration, and no per-row Auth HTTP calls remain in these list paths. Outstanding invoice counts are SQL aggregates unaffected by the collection limit. Legacy deliverable/orphan enumeration has a 10000-row bound and stalled-cursor refusal. Invoice detail's existing 10000-item/payment refusal remains unchanged; higher-volume export is not invented here.

This is a targeted review of the previously named project, invoice and file compatibility APIs, not a claim of exhaustive review of every future/third-party consumer. Application callers retain session checks; service-only APIs remain denied to anon/authenticated. Empty or oversized/error responses do not become false successful counts.

Exact three-file integration diff inspected: 0d681baa5f2edabcd40fc2dec3f13aa9799ea8f1. Temporary integration and evidence-reporting write permissions were retired before final verification. No main, production data, account, mailbox or R2 object was changed.

## Actual GitHub evidence

At evidence head 19ae5e5fe62624a3c8abab328f36e390c8e216d5, the active rules endpoint for main returned rule types deletion, non_fast_forward and required_signatures. Classic /branches/main/protection returned HTTP403; classic required-check/review configuration remains unknown. Do not infer that classic protection is absent. The PR review list returned zero APPROVED records, with only scanner comments present. This assistant's implementation review is not independent approval.

The AI scanner remains a failed advisory service, not an application test pass or a verified mandatory status. Read actual protection settings before attributing blocked merge status to it. Do not change rules to force a merge. Verify signatures on the actual final integration and confirm the merge method with the owner.

## Production readiness: not verified

Available connections do not provide Vercel, Supabase or Cloudflare administrative access. Source inspection and disposable CI cannot verify a real production backup, restore test, applied migration ledger, hosting plan, environment values, SMTP configuration or bucket CORS. No production credentials are requested in chat and no substitute test data is labeled production evidence.

Current vercel.json schedules only /api/cron/r2-retention at 0 3 * * *. It does NOT declare /api/cron/email-outbox. An external scheduler may exist but has not been verified. Durable email retries need an actual schedule compatible with the hosting plan, expected latency, lease duration and provider retry horizon. Daily request wakeup is not sufficient proof. Obtain hosting plan/cadence choice or evidence of an existing scheduler before configuring deployment.

Needed from an authorized owner/operator: (1) classic main protection required checks/reviews; (2) an independent review of the final financial/auth/deletion/recovery changes; (3) a recent production backup plus successful isolated restore evidence; (4) production applied-migration ledger; (5) hosted R2 CORS/CDN and Auth SMTP/template/environment verification; (6) hosting plan and chosen/existing outbox schedule. Share sanitized status/evidence, not secret values or raw customer backups in public issues.

## Migration and release sequence

1. Keep production writes stopped until backup restoration and actual schema history are verified. Never reset or overwrite production.
2. Compare the production migration ledger to the immutable 0001-0017 baseline. Only apply missing reviewed migrations in order, not blanket replay. Development additions now extend through 0035.
3. Test the upgrade on an isolated restore of the real schema/history before production. A fresh disposable schema pass alone is not an upgrade/production restore pass. Migration0034 preserves existing queue rows, adds nullable metadata and expands its source constraint; 0035 adds service-only readers. Plan locks/timeouts and inspect schema privileges.
4. Deploy required schema before application code referring to prepare_file_deletion or the new reader RPCs. Source rollback must not restore storage-first deletion or remove retry tombstones. Prefer additive forward repair.
5. Verify scheduler and hosted settings, then obtain exact-head merge/deployment confirmation for one reconciled PR56 candidate. Main auto-deploys, so merging is not isolated from release.
6. Recheck CI, signatures, required checks and review state immediately before merge. After deployment verify auth, deletion retry, read counts, mail backlog and monitor failures without logging secrets.
7. Reconcile superseded PRs only with applicable confirmation and preserved evidence. Revisit PR27 afterward; do not mutate it before the integrated release step.

Remaining business policy decisions about account erasure and archive/email-audit retention remain separate. No new destructive defaults were chosen to make progress checkboxes green.
