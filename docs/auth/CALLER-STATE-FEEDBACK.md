# Caller-state feedback

Restrictive profile RLS intentionally hides inactive profiles, so a proxy cannot infer deactivation from a missing row. Migration 0026 exposes a parameterless caller_account_state() RPC to authenticated callers. It resolves only auth.uid() and returns active/inactive/reauthenticate, never profile data or another user's state. Anonymous execution is revoked.

The proxy uses this coarse state only when its normal caller-bound profile query returns no row, preserving the established deactivated-login message without reopening table access. Data queries and session authority remain governed by existing restrictive RLS and token cutoffs. An unavailable state query returns a no-store 503 rather than guessing authorization. Disposable SQL tests verify own/missing/other/inactive state; the unchanged real-browser deactivation message remains a combined acceptance requirement.
