# Contact intake

This guide describes the current development branch, not an assertion that unmerged changes are deployed. Historical phase probes are retained in [the pre-remediation revision](https://github.com/redwan-cse/redwan.work/blob/27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a/docs/contact/README.md); they do not certify the new implementation.

## Request flow

The form at /contact uses components/enhanced-contact-form.tsx and POST /api/contact. Supabase Postgres is the sole lead sink. Google Forms and Apps Script are retired. PR #27 cleanup is integrated here: no entry.* mirrors, budgetRange, posted ticketId or posted userAgent are sent. Numeric budgetMin/budgetMax, request source/device context, explicit consent, attachment metadata and fresh Turnstile tokens remain. The server obtains user-agent from HTTP headers and issues the ticket reference only after persistence; the browser never fabricates a fallback reference.

The server validates origin, mandatory configuration, form data and explicit consent, consumes the database IP rate budget, verifies Turnstile, consumes its replay guard, validates attachments against actual stored size, and inserts the lead. A server-issued TKT reference is returned only after successful persistence. Configuration, rate-control and replay-control failures do not fall back to memory-only acceptance.

The existing checkbox state is serialized as exactly one gdprConsent field. Only literal true is accepted before consent_at is generated. This is agreement to the displayed Data & Privacy policy, not marketing consent. See [consent contract](CONSENT-CONTRACT.md).

## Files

Up to five files per enquiry, one byte to 10 MB each; PDF, Word, Excel, PNG, JPG and ZIP with extension/MIME matching. Files go directly to private R2 through short-lived presigned uploads. The application stores validated metadata, never accepts a submitter's retained flag, and performs private-bucket HEAD checks before acceptance. Contact keys do not gain portal GET access merely because the shared HEAD helper accepts them.

## Configuration and verification

Server: TURNSTILE_SECRET_KEY, SUPABASE_SECRET_KEY, LEAD_IP_HASH_SALT and private R2 credentials when attachments are used. Public: NEXT_PUBLIC_TURNSTILE_SITE_KEY, NEXT_PUBLIC_SUPABASE_URL and the current Supabase publishable key. Never use a secret API key in the browser. A development-only missing-Turnstile bypass does not bypass database rate limits or consent.

Tests in tests/reliability cover missing configuration, invalid RPC results, replay-control failure, positive persistence, consent variants, storage namespaces and size checks. Actual Cloudflare Turnstile/R2 and hosted submission acceptance remain deployment checks, not implied by mocked transport tests. See [storage guide](../r2/README.md), [reliability acceptance](../crm/RELIABILITY-ACCEPTANCE.md) and the current PR check results.

## PR27 review resolution

The unused-payload and obsolete-comment findings are resolved against the current parser, not by replaying an old snapshot. LEAD_IP_HASH_SALT remains required on this integrated branch: the current route fails closed when it is missing. The older review suggestion that salt was optional described the pre-remediation route and must not weaken this contract. Browser tests mock only the local contact response and block third-party requests; actual hosted/provider acceptance remains separate.
