# Redacted production preflight results, 2026-09-09

Authorized scope: use GitHub Environment Production carefully for a separate read-only metadata preflight. Execution workflow commit4bc18139cd39183622e54834fa0c76ee4c981b1e pinned reviewed code at dca7fa5459dc11f6cd2344b39c06a11778ed87c5. Six synthetic safety tests ran without production credentials before the isolated Python provider step. Actual job: https://github.com/redwan-cse/redwan.work/actions/runs/34306185698/job/102323254972 . Workflow success means inspection/reporting completed, NOT release approval.

## Confirmed passes and their limits

- Canonical Supabase project URL, new publishable/secret key prefixes and nonempty asymmetric public JWKS passed. This checks format/public key availability, not a production-user login or full token verification.
- A secret-key REST query of profiles selecting id with limit0 succeeded and returned an empty array. No customer rows were retrieved.
- Supabase Management auth-config read succeeded. SMTP host/user/sender fields were populated. No SMTP password or response payload was printed or persisted; no delivery was attempted.
- Resend GET/domains returned a verified redwan.work domain and the configured sender matched the expected address. This does not prove actual sending/delivery or Vercel environment equivalence.
- Configured public CDN base matched the expected value. No CDN object was fetched.

## Gaps requiring investigation before production changes

- Auth site configuration did not match https://redwan.work after removing a trailing slash. The actual value was not output. This is a configuration-contract mismatch, not a claim that the unseen value is malicious or definitely unusable.
- Recovery template did not have exactly one link matching the tested application SiteURL/reset-password token_hash/TokenHash/type=recovery contract. Actual HTML stayed private. The strict check can also reject harmless formatting variations or additional links; inspect it privately before deciding a repair. No template was modified or email sent.
- The limit0 email_outbox REST probe was unavailable. Its exact provider error/status was not published. This may indicate missing/unexposed schema or another service problem; it does not establish the applied migration ledger. No migration was run.
- R2 endpoint failed the canonical HTTPS account-host/root-path validator. Therefore NO R2 access key or secret was sent and both CORS reads were skipped. Causes can include missing values, formatting, bucket paths, custom hosts or jurisdiction-specific endpoints not covered by this probe. This is NOT proof the R2 credentials themselves are invalid. Verify the endpoint's intended provider format privately; do not relax the allowlist blindly.

## Not checked

Production backup contents or restore, migration ledger/upgrade rehearsal, actual Vercel deployment environment, active Cron/Vault equivalence, Google/Blogger/Turnstile credential validity, hosted R2 CORS/permissions, Resend send/delivery and independent approval. GitHub Environment secrets are not automatically Vercel deployment variables. No claim is made that adding secrets completes these gates.

## Confidentiality and retirement

Only fixed labels and finite result codes reached logs/statuses. No secret value, raw provider response, customer row, object listing, email or backup content was output. Management Auth configuration was reduced in memory to booleans and discarded. Credential mappings existed only on the provider step; no package install, application build, app test or later reporter inherited them. No CRON_SECRET was provided, and no cleanup/outbox endpoint was invoked.

Semgrep flagged the preflight's standard-library HTTPSConnection usage for manual audit (historical Python TLS defaults). The inspected implementation explicitly used ssl.create_default_context(), but the check remained failed, not suppressed. After completing this one-shot inspection, its entire network code and Production environment/secret mappings were retired. Current tests verify retirement; the original synthetic safety tests and source remain at the pinned historical commit. Latest-head scanners must report their own results before being marked passed.

No production mutation, mail sending, upload/deletion, schema change, Cron activation, PR merge, rule change or Vercel deployment occurred. GitHub environment-run metadata may be recorded; that is not an app deployment. Do not rerun the historical privileged workflow casually: a new authorized preflight should inspect/pin its exact source and preserve these limits.
