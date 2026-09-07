# Recovery links from actual disposable mailbox emails

The local Supabase job configures a test-only recovery template before service startup. It uses the documented app contract: `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery`. This is a local fixture template, not an export or attestation of hosted configuration.

The test creates a random ...@example.test account, requests password reset through the actual app's forgot-password browser UI/server action, waits for the real Auth SMTP email in Mailpit, and selects the exact recipient's message. It parses HTML with Chromium DOMParser and navigates the extracted href unchanged after normal HTML entity decoding. It does not call generateLink, read a token from SQL or rebuild a link from another response.

Acceptance: exactly one matching email, nonempty subject and strict local app URL/type/token shape, HEAD/GET/JavaScript previews without redemption, reset in an independent browser, old password rejected/new password accepted, and reuse rejected in another context. Message ids are deduplicated and deleted specifically; an empty delete-all request is never sent. Zero matching mailbox messages and fixture profiles are required after cleanup.

Initial test runs failed because an exact custom subject expectation did not match the received provider subject. A later diagnostic separated this from delivery: email receipt and recipient matching passed; subject equality failed. Subject wording is not the recovery-link contract. The test now requires a nonempty subject while retaining strict received-href and reset/replay assertions. It does not rewrite unexpected links to make tests pass.

Mailpit stays on local port 54324 with no external SMTP relay. App/Auth endpoints are loopback-only; no production or Resend credentials. Email bodies, hrefs, tokens, passwords, traces and screenshots are not logged. Only fixed phases and numeric suite totals are published on failure. Workflow teardown stops disposable services even on failure.

A pass validates actual local UI -> Auth -> SMTP -> mailbox -> extracted link -> browser reset for the configured template. It does not prove production template equivalence, Resend delivery, third-party preview behavior, invitation links or automatic browser expiry refresh.
