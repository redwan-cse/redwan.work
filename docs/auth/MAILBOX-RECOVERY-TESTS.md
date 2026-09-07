# Recovery links from actual disposable mailbox emails

The local Supabase job configures a test-only recovery template before service startup. It uses the documented app contract: `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery`. This is a local fixture template, not an export or attestation of hosted configuration.

The test creates a random ...@example.test account, requests password reset through the actual app's forgot-password browser UI/server action, waits for the real Auth SMTP email in Mailpit, and selects the exact recipient's message. It parses the HTML with Chromium DOMParser and navigates the extracted href unchanged after normal HTML entity decoding. It does not call generateLink, read a token from SQL or rebuild the link from another API response.

Acceptance: exactly one matching email, expected subject and local app URL, HEAD/GET/JavaScript previews without redemption, reset completion in an independent browser, old password rejected/new password accepted, and email-link reuse rejected in another context. Captured message ids are deduplicated and deleted specifically; an empty delete-all request is never sent. Zero matching mailbox messages and fixture profiles are required after cleanup.

Mailpit remains local on port 54324 with no external SMTP relay configured. App/Auth endpoints are loopback-only; no production values or Resend credentials are used. Raw email bodies, hrefs, tokens, passwords, traces and screenshots are not logged. Errors expose only a phase name. Existing workflow teardown stops its disposable services even on failure.

A pass validates the actual local UI -> Auth -> SMTP -> mailbox -> extracted link -> browser reset path for the configured template. It does not prove production template equivalence, Resend delivery, mailbox-provider scanner behavior, invitation links or browser automatic expiry refresh. Those remain separate acceptance gates.
