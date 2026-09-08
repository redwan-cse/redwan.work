# Current account authority

Branch implementation for #29/#28/#40; no production migration or release.

Migration 0020 adds a per-profile access-token cutoff and a security-definer current_account_role() helper. The helper has no identity parameters: it resolves only auth.uid(), verifies a current active profile, matches its role to the verified JWT claim, and checks issued-at against the cutoff. Existing ownership policies remain, with a restrictive live-account gate on nine CRM tables. is_admin() now uses this live authority. Direct authenticated profile/ticket writes formerly granted through admin policies are removed; guarded server operations remain the mutation path.

Deactivation and role changes advance the cutoff to the next whole second. Reactivation never moves it backward, so pre-deactivation access tokens do not regain access. Fresh tokens issued after the cutoff can regain authorized access. This is an application/Data API authority cutoff, not a claim that every refresh token was physically deleted from Auth. Tokens may need a fresh sign-in/refresh after the next whole second; request-time profile denial remains authoritative.

Application session and proxy guards integrate PR #48's current-profile logic, caller-bound RLS, cookie forwarding and no-loop login behavior. Recovery/invitation screens remain reachable. Rejected sessions use the existing PR #48 file-route 401 behavior; final 401/404 compatibility acceptance remains open.

The invalid auth.admin.signOut(UUID) calls are removed. Deactivation first disables the profile (trigger invalidates older access tokens), then bans Auth sign-in. A failed ban returns an explicit partial-state message and retry guidance while portal/RLS access stays disabled. Reactivation removes the Auth ban before enabling the profile; a failed profile write remains fail-closed. There is no direct write to managed auth tables in application code.

Invitation/conversion check both auth claim and profile role before claiming an account; administrator profiles are never overwritten through onboarding. Profile data is updated only on client-role rows. Partial onboarding returns recovery guidance rather than raw provider errors. Existing-account handling does not send a new invite; historical UI success wording must not be treated as delivery evidence.

## Validation and rollout

Disposable policy tests exercise nine-table own/admin/foreign scopes, inactive/stale-role denial, cutoff after reactivation and direct role escalation refusal. They set synthetic PostgreSQL request claims to test RLS; they do not test JWT cryptographic verification or real Auth ban/refresh behavior. Real browser Auth, invitation/recovery mail and failure-path lifecycle acceptance still must be integrated with #48.

Migration 0020 changes access policy behavior and invalidates sessions on subsequent role/state changes. Before production use: independently review policies, back up and verify restore, test current admin/client sessions on staging, deploy in the approved dependency order, and obtain exact owner approval. Roll back application code only with a reviewed policy compatibility plan; never reset production or lower token cutoffs to revive old tokens.
