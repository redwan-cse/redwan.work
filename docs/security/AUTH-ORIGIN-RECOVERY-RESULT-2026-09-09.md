# Production Auth correction attempt: NOT completed

User approved only Auth origin and recovery template September9 at11:37 Asia/Dhaka. Subsequent11:54 approval was read-only investigation, explicitly no write retry. Latest investigation: [AUTH-READONLY-DIAGNOSIS.md](AUTH-READONLY-DIAGNOSIS.md). It confirms the legacy origin/link still present in two stable reads, proves the original outcome logging is ambiguous, and leaves the historical provider cause unknown. No production write occurred during that investigation.

## Historical correction evidence

Pinned executable/tests296ed616abdb0d43e81d32fa0ff2caed472862a6 passed eight synthetic tests before credential access. Initial workflow15d2ef1be0dff274e68901331b656f3560795211 had a YAML plain-scalar colon issue; corrected folded condition ran in workflowf078edb9327695370531b53291fa424a44541d80: https://github.com/redwan-cse/redwan.work/actions/runs/34315930729/job/102352027559 . Outcome ROLLED_BACK at05:42:15UTC, job failed rather than claiming success.

The original config was fetched privately, one recovery href transformation prepared, original two values saved mode0600 temporarily, second baseline read passed, and a two-field PATCH attempted. The success condition (HTTP200, exact desired targets, all unrelated returned config values unchanged) was not established. A subsequent read observed the original site_url and mailer_templates_recovery_content, either unchanged or after guarded restoration. The saved outcome does not distinguish those paths or preserve the precise failed stage. Do not claim the provider denied it, the settings actually changed and were reverted, or the correction completed.

The latest local synthetic reproductions show403 denial, metadata drift and unchanged immediate readback all produce ROLLED_BACK. Later production GETs show the legacy settings still present, but the historical response/rollback path remains unknown. No permission escalation or production retry followed.

Only site_url and mailer_templates_recovery_content were permitted in PATCHes. No SMTP, redirect rule, other template, user, schema, email, R2 or Cron field was included. This does not independently certify no concurrent/provider-side metadata changes. No main push, merge or app deployment occurred.

Temporary original-two-field and finite-result files were subject to always-cleanup; no artifact upload. The mutation network entry point and credential/environment/status-write mappings were retired. Synthetic-only transformation/rollback code remains. Separate completed GET diagnostic also retired its network/credential capability. Historical source remains in Git history, not permission for casual reruns.

Next: improve diagnostic stage distinctions and delayed-readback tests without credentials before considering any separately authorized production retry. Existing schema/backup/restore/CORS/env/signature/review release blockers are unchanged.
