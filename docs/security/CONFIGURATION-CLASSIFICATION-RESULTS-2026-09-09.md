# Classified production and merge findings, 2026-09-09

Shared phase: verify the already-approved remediation, not a new feature/design cycle. Superpowers approval boundaries, Ralph bounded execution and GSD exact-version tracking share PR56. Application acceptance at a5cac1a5b5031b963dc8232a52c3fcca24999d0b was fully green except the separate AI service; newer diagnostic/retirement commits need their own final checks.

Evidence: https://github.com/redwan-cse/redwan.work/actions/runs/34311919306/job/102340166907 at workflow head bc6b8c39bffc6c45fa592c912f84548fc9e6e673, pinned script/tests485d3565af68647faf148a60d7b317dee3640406. All12 fixed result statuses were received. Seven synthetic confidentiality/request-boundary tests precede the provider step. Raw responses and credentials were not output. Status success denotes collection only, not release approval.

## Findings

- R2 endpoint: JURISDICTION, matching a documented eu/fedramp S3 hostname. The earlier canonical-only probe incorrectly rejected a supported endpoint form. Do not replace the configured endpoint based on that old result. No R2 key was mapped/transmitted and hosted access/CORS remain unverified. Reference: https://developers.cloudflare.com/r2/api/tokens/ and https://developers.cloudflare.com/r2/reference/data-location/.
- Auth site: OTHER_ORIGIN. It is neither the expected https://redwan.work origin nor a recognized local development origin. Actual hostname remains private. Read the owner's intended site configuration before changing it.
- Recovery HTML: ConfirmationURL placeholder present; TokenHash, SiteURL and /reset-password? indicators absent. This is a substantive mismatch with the app's tested direct-token-hash reset flow, not merely extra-link/HTML formatting rejection. Indicators alone do not prove what every rendered link does. No email was sent and no live token was created or consumed.
- Outbox REST: TABLE_NOT_IN_CACHE, based only on recognized PGRST205 code. The table is unavailable in the exposed schema cache. Missing migration versus exposure/cache issue still requires the actual ledger/schema; no migrations inferred or executed.
- Exact PR49 commit b2919343d146adfdff92ed4471436aabe495fdd9: GitHub verification.verified=false, reported UNVERIFIED. Active main rules include required_signatures. This prevents calling the currently proposed history-preserving merge ready. The probe did not publish verification.reason, so do not claim to distinguish missing versus invalid signatures.
- Classic protection: DENIED. PR49 state: BLOCKED. Other classic checks/reviews remain unknown; signatures are not asserted to be the sole blocker. No independent APPROVED review has been established.

## Next actions and separate approvals

1. Privately review and obtain approval for the production Auth Site URL and recovery template change. Intended target remains https://redwan.work and the tested {{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery link. Preserve unrelated SMTP/templates/redirect settings and prepare private rollback metadata. No production patch is authorized merely by this read-only result.
2. Obtain verified backup/isolated restore and actual applied-migration ledger before resolving outbox/schema or deploying migrations0018-0035. No reset/replay or invented migration history.
3. Inspect hosted R2 access/CORS using the correct documented jurisdiction endpoint, without changing it. Vercel environment parity, actual mail acceptance, scheduler activation and retention decisions remain open.
4. Agree a signature-compliant integration method and inspect actual remaining protection/review gates. GitHub documents signed-commit requirements and author constraints for squash merges: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets . Do not force-push/rewrite the existing stack, weaken rules, or assume a squash/rebase is authorized or mergeable. A new signed tip alone does not retroactively sign its ancestors. No merge was attempted.

The one-shot production/GitHub network entry points and all workflow environment/secret/status-write mappings were retired immediately after evidence capture. Pure, no-network classification functions and five retirement/classification tests remain. Historical exact executable/tests are preserved in Git history; no casual privileged rerun. No app source/migration, production configuration/data/mail/storage, main branch, PR state or branch rules changed. PR27 remains deferred.
