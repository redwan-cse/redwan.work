# Full account lifecycle acceptance

The combined job now sets a 120-second access-token lifetime only on the newly created disposable Auth stack. A synthetic invitation template is readable by Kong and points directly to the application's invite acceptance screen using the Auth-generated token hash.

The added test calls the actual inviteClient and setClientActive implementation against the real disposable Supabase service. Only provider failure injection and nonessential email audit callbacks are adapted. It extracts the actual invitation href from the local SMTP mailbox, verifies preview non-consumption, accepts in Chromium, rejects replay, waits for the browser's actual signed access token expiry, and requires protected navigation to refresh the session without an explicit SDK refresh call.

Account-state tests require actual Auth sign-in/refresh denial after deactivation and fresh sign-in after reactivation. Injected provider failures verify profile-first deactivation remains fail-closed and a failed unban never activates the profile. Both Auth role and profile role protect an existing administrator from onboarding. Messages/users are exact synthetic fixtures, with verified cleanup. No actual tokens, URLs, mail bodies or provider errors are published.

This tests local Auth behavior and the real application code, not production SMTP, CORS, scheduler deployment or a chosen legal retention policy. Acceptance is recorded only after the exact branch-head combined job passes.
