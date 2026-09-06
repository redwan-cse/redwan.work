# Recovery token consumption and email previews

The disposable Auth Actions job now runs `tests/auth/recovery-previews.test.mjs` after the existing authenticated suite. Every scenario obtains a fresh real recovery token from local Supabase Auth via the admin generateLink API. Tokens are not mocked. The application is the actual production build and JavaScript previews use real Chromium.

## Assertions

1. Repeated HEAD requests to the application's token-hash reset page leave its token redeemable.
2. Repeated GET requests to that page leave its token redeemable.
3. A JavaScript-enabled browser preview plus reload does not POST verification or establish an Auth session; subsequent deliberate SDK verification succeeds exactly once.
4. A separate human browser can set a new password after a preview, sign into the portal, and authenticate with the changed password; another browser's reuse attempt is rejected.
5. Positive control: fetching Supabase's direct /auth/v1/verify recovery link performs redemption, returns a session redirect and prevents subsequent reuse of the token.

## Scope and interpretation

The test reconstructs the documented application email URL shape `/reset-password?token_hash=...&type=recovery` using an Auth-generated token. It does not send/read actual email, inspect hosted template configuration or emulate a named mailbox provider's link scanner. Thus a pass establishes behavior for the tested link shapes and preview actions, not proof that every production email template/provider is safe. A scanner that submits forms is outside the passive-preview scenarios.

The direct-verification control is intentional and confined to disposable services. A token being consumed there is an expected control result, not a defect introduced in this PR. Production template verification must confirm which link shape is actually sent before drawing a production conclusion.

All addresses are random ...@example.test; keys are new-format local keys. Failure messages withhold URLs/tokens/passwords and browser traces are not captured. Tests delete exact fixture Auth users and assert zero matching profiles; workflow teardown removes the local project. No production changes or external mail sends.
