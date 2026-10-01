# Contact intake

This guide describes the development branch, not deployed production. [PR57](https://github.com/redwan-cse/redwan.work/pull/57) and [issue45](https://github.com/redwan-cse/redwan.work/issues/45) remain the trackers. Historical probes are retained in [the pre-remediation revision](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/contact/README.md); they do not certify this implementation.

## Request flow

The form at `/contact` uses `components/enhanced-contact-form.tsx`. Supabase Postgres is the sole lead sink; Google Forms and Apps Script are retired. No `entry.*` mirrors, `budgetRange`, posted `ticketId` or posted `userAgent` are sent. Numeric budget bounds, request context, explicit consent, attachment metadata and fresh Turnstile tokens remain. The server obtains user-agent from headers and issues the ticket reference only after persistence.

`GET /api/contact` is a read-only, uncached public policy read. A service-only database RPC supplies one consistent snapshot containing the active archive. The server verifies its canonical bytes, hash and identity before returning the public bundle, never registry internals or lead data. Missing, disabled or corrupt control returns `503 consent_unavailable`.

`POST /api/contact` validates origin, required configuration, form data and explicit version-bound consent before existing rate, Turnstile, replay, stored-object-size and persistence checks. Only one literal `gdprConsent=true` and one displayed `consentPolicyVersion` are accepted. The server authors the exact archived version/hash, capture method and timestamp. Client-supplied evidence cannot replace them. The database checks the active version again under a lock held through insertion. Neither configuration nor consent failure falls back to timestamp-only acceptance.

A known stale version or activation race returns `409 consent_stale` with the current public policy. The form keeps draft values and uploaded-file metadata in memory, clears the checkbox, displays the new policy and requires an explicit recheck and manual resubmission. It never automatically retries or reuploads attachments. Unavailable policy disables consent/submission and offers explicit reload. Closing or reloading the page can still lose this in-memory draft.

See [the versioned consent contract](CONSENT-CONTRACT.md) for exact fields, error classes, historical meaning and rollout limits.

## Files

Up to five files per enquiry, one byte to 10 MB each; PDF, Word, Excel, PNG, JPG and ZIP with extension/MIME matching. Files go directly to private R2 through short-lived presigned uploads. The server stores validated metadata, never accepts a submitter's retained flag, and performs private-bucket HEAD checks before acceptance. Contact keys do not gain portal GET access merely because the shared HEAD helper accepts them.

## Configuration and verification

Server: `TURNSTILE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `LEAD_IP_HASH_SALT` and private R2 credentials when attachments are used. Public: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and the current Supabase publishable key. Never expose a secret API key in the browser. The existing development-only missing-Turnstile bypass does not bypass database rate limits or consent.

Migration `0041_contact_consent_evidence.sql` is additive source and leaves control disabled with no real policy seeded. Existing timestamps and rows are not backfilled. New application code will refuse submissions until an independently authorized archive and active control exist. Do not deploy this branch as an uncoordinated application-only release. A verified backup and isolated restoration, exact production schema reconciliation, approved policy publication and separately approved activation/rollout are prerequisites, not operations authorized by the development approval.

Tests cover actual route/parser/reader/store behavior with synthetic transport adapters, browser-safe policy decoding, desktop/mobile stale recheck, and disposable SQL history/privilege/concurrency invariants. `tests/reliability/contact-pipeline.acceptance.mjs` verifies real local route/storage/database persistence; the candidate wave browser verifies the actual form against its local database. Synthetic activation fixtures are restricted to named disposable CI databases and are never production seeds. See the [verification checkpoint](CONSENT-CONTRACT.md#development-verification-checkpoint).

Actual hosted Turnstile/R2 compatibility, production migration and policy activation remain separate. See [storage guide](../r2/README.md), [reliability acceptance](../crm/RELIABILITY-ACCEPTANCE.md) and exact-head PR checks.

## Preserved policy and review boundaries

This work does not change `/privacy`, the existing fallback wording, marketing permission or historical consent meaning. The fallback notice's absolute third-party-sharing statement conflicts with the existing privacy page's provider disclosures. That copy needs owner review before any policy publication; version recording does not resolve or legally certify it.

PR27 cleanup remains integrated against the current parser, not an old snapshot. `LEAD_IP_HASH_SALT` is still mandatory. Browser interception tests use only synthetic local responses and a synthetic Turnstile widget; they are not hosted-provider evidence. The [canonical PR57 readiness record](../security/PR57-READINESS-2026-09-29.md) separates exact b4430c1 F20 CI from its operator-reported recovery acceptance and the subsequent review repairs. The successful consolidated AGY attempt is complete and its authority consumed; `eb53d3e` and all other historical packets cannot be reused or relabeled for another candidate. Original packet bytes and private evidence remain preserved; no new host operation, cleanup or policy action is authorized.
