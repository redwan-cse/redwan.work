# Production Auth correction attempt: NOT completed

User explicitly approved changing only production Auth origin and recovery template on September9 at11:37 Asia/Dhaka. No broader production write, migration, mail, R2, scheduler or release permission was inferred.

Pinned executable/tests296ed616abdb0d43e81d32fa0ff2caed472862a6 passed eight synthetic tests before production access. Initial workflow15d2ef1be0dff274e68901331b656f3560795211 had a YAML plain-scalar colon issue in its condition and returned no correction job/status; it was corrected using a folded condition. Executing workflowf078edb9327695370531b53291fa424a44541d80 ran https://github.com/redwan-cse/redwan.work/actions/runs/34315930729/job/102352027559 . Its fixed outcome was ROLLED_BACK at05:42:15UTC. The job failed, appropriately, rather than claiming a verified correction.

## What is established

The original config was fetched privately, exactly one recognizable recovery href transformation was prepared, the original two values saved mode0600 temporarily, and a second baseline read passed. A two-field PATCH was attempted. The success condition (HTTP200, exact desired values and all unrelated returned config values unchanged) was NOT established. The safeguard subsequently read back the original site_url and mailer_templates_recovery_content: either the provider had left them unchanged, or the guarded two-field restoration succeeded. Both paths use the ROLLED_BACK code. Do not claim a successful correction or assume which path occurred.

The published outcome does not identify whether the PATCH was denied, readback failed, desired values differed, unrelated returned metadata changed, or another bounded request failure occurred. No specific cause is asserted. No retry was attempted after this result. A newly authorized diagnostic must distinguish finite HTTP/outcome stages without raw provider values; do not blindly relax equality or reapply production writes.

No SMTP, redirect rule, other template, customer row, schema, mail, storage or Cron field was included in any PATCH. Because the result does not expose the exact mismatch, it does not independently certify the absence of concurrent/provider-side changes to unrelated metadata. No app deployment or main/PR merge occurred.

The job's always-cleanup step removed the temporary two-field rollback JSON and fixed result JSON; no artifact upload was configured. The production credential mappings, environment binding, status-write permission and actual network/production entry points were then retired. Pure fixture-injected transformation/rollback code remains for synthetic tests only. Historical executable remains in Git history, not authorized for casual reruns. Current source does not read environment values or contact providers.

Next: investigate the precise refusal/readback stage with sanitized diagnostics before any production retry. Original Auth mismatch remains open. Existing release blockers (outbox cache/schema/ledger, backup/restore, hosted CORS/env, signatures/protection/review) are unchanged and outside this narrow request.
