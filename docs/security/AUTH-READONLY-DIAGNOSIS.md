# Read-only investigation: complete, historical provider cause unproven

Owner September9 at11:54 Asia/Dhaka authorized investigation only, explicitly no production write retry. No production write, permission escalation, account/mail/token operation, database access, cron call or release was performed. The historical mutation workflow remained retired throughout.

## Actual read-only results

Execution: https://github.com/redwan-cse/redwan.work/actions/runs/34316954522/job/102355068095 (completed05:57:28UTC), workflow834c9bfaa7cb14602df092a4488bc93c76240564, pinned executable/tests9f8b672c97ac545af989b4469f56f66b64992699. Exactly two GETs of Management Auth config, three seconds apart. Synthetic no-write/host/path/privacy/stability tests passed before credential use. All6 finite result statuses received:

- auth-read: AVAILABLE.
- site-origin: DIFFERENT from exact https://redwan.work.
- recovery-template: LEGACY_LINK, ConfirmationURL still present.
- repeat-targets: STABLE across those two reads.
- repeat-other-config: STABLE across those two reads.
- historical-stage: UNKNOWN.

This verifies the intended correction is still not in place and found no read-to-read instability in this short window. It does NOT prove stability during the earlier failed write or establish its HTTP response, permissions, propagation timing or rollback path. No actual values, raw config, secret hashes or field-by-field private diffs were output.

## Proven reporting defect

Exact historical correction source296ed616abdb0d43e81d32fa0ff2caed472862a6 discards the PATCH status, failed equality category and caught-error stage before publishing ROLLED_BACK. Synthetic execution of that same correct() function reproduced three distinct cases:

1. PATCH403 with values unchanged returns ROLLED_BACK after one attempted fixture write and no restoration request.
2. PATCH200 updating the two targets but changing unrelated returned metadata returns ROLLED_BACK after a second fixture restoration request.
3. PATCH200 with immediate readback still unchanged returns ROLLED_BACK after one attempted fixture write and no restoration request.

All three simulations were local, credential-free and network-free. They prove the diagnostic ambiguity, NOT which event occurred in production. The last case also exposes an immediate-readback limitation: an unchanged read is not sufficient to prove a remotely accepted asynchronous update can never apply later. Today's later GETs still show the legacy settings, but no general eventual-consistency guarantee is claimed.

Official docs https://supabase.com/docs/reference/api/v1-update-auth-service-config confirm PATCH success200 and optional site_url/mailer_templates_recovery_content. Therefore200-only success is documented, not a demonstrated status-code bug. Read permission does not prove auth write permission. No write permission was exercised to test it.

The historical public Actions log fetch did not return content; source inspection establishes that the script only logged its final category. The discarded transport/mismatch details cannot be recovered from that saved category. Fresh stable reads do not justify assigning the old failure to permissions or provider-managed metadata. Actual historical root cause remains unresolved.

## Recommended bounded follow-up, not executed

Before considering another production correction, improve and test the writer's diagnostics in a credential-free fixture: distinguish HTTP rejection, transport uncertainty, target mismatch, unrelated returned-field drift, original-values-observed, rollback attempted and rollback verified. Record only finite status/stage/booleans. Model delayed readback explicitly with bounded GET verification rather than blind write retries, and retain the concurrent-edit refusal. Do not weaken unrelated-setting comparisons without evidence. This recommendation is not an authorization to restore a privileged workflow or retry production.

## Confidentiality and retirement

The completed probe used only the Management token and project URL in a pinned built-in-only Node GET step. Explicit TLS verification, fixed host/path, no redirects,512KiB bound,15-second timeout. Raw responses existed only in memory; mode0600 temporary file held finite categories, not config. Separate GitHub-only status reporting held no production credentials. Always-cleanup removed the finite result file; no raw artifact upload. GitHub success statuses mean collection completed, not production correction success.

After capture, all diagnostic network entry points, environment/secret bindings and status-write permissions were removed. Only pure fixture-injected classifier tests remain. Application source, production settings and data were not changed. The development-branch commits contain diagnostic tooling/docs only; broad CI is independent of this completed GET investigation and must be verified on its own head. PR56 remains the shared Superpowers/Ralph/GSD tracker, no new project/task or independent-agent claim.
