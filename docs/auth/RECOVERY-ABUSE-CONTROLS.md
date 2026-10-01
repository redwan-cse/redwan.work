# Recovery request controls

Code review found that password-reset requests did not use the app's existing fail-closed OTP rate budget and derived credential-email redirects from forwarded headers. Recovery now shares the five-per-five-minute database budget, rejects missing/error/nonboolean outcomes, and requires an explicit configured site origin. HTTPS is required except loopback disposable development; URL credentials, path, query and fragment are rejected. Provider errors and rate-control diagnostics remain fixed text, never raw database/provider messages.

This adds no account enumeration: the success notice remains uniform for both password reset and magic link requests (`If that address has an account, a reset/sign-in link is on its way.`). The current combined mailbox test uses the explicit localhost site origin, and unit tests inject hostile forwarded headers to prove they cannot shape recovery destinations. Production `NEXT_PUBLIC_SITE_URL` must be configured before deploying this branch.

## Verified action & token lifecycle contracts: September 2026

Verification suite `tests/reliability/recovery-controls.test.mjs` and PostgreSQL acceptance suite `tests/reliability/auth-retry-claims-db.py` confirm:
- **`requestPasswordResetAction`**: validates non-empty email; checks database IP rate limiter (`consume_rate_limit`, `otp-ip`, window 300s, max 5); fails closed on RPC errors, quota exhaustion, or missing salt (`LEAD_IP_HASH_SALT`); enforces sanitized site origin (`credentialEmailOrigin`); maps upstream 429 status to `'Too many requests. Please wait a minute and try again.'`; and returns uniform anti-enumeration notice with destination `{redirectTo: origin + '/reset-password'}`.
- **`requestMagicLinkAction`**: validates non-empty email; enforces fail-closed IP rate limits; invokes `signInWithOtp` with `{shouldCreateUser: false}` to strictly prevent uninvited signups; maps upstream 429; and returns uniform anti-enumeration notice.
- **`setNewPasswordFromRecoveryAction`**:
  - Checks for non-empty `token_hash`; validates password ($\ge 12$ characters and confirmation match) **prior** to calling `verifyOtp`, ensuring client validation errors never burn the single-use OTP.
  - Maps initial `verifyOtp` failures (expired/replayed tokens) to `'This link is invalid or has expired. Ask for a new one.'`.
  - On initial password update failure after OTP consumption, issues a server-authenticated HMAC-SHA256 retry authority token bound to the active session ID (`sid`) and token hash.
  - On retry submission, validates the HMAC signature, token expiry, active session user ID, and session ID. Mismatched sessions or forged cookies fail closed with `'This link is invalid or has expired. Ask for a new one.'`.
  - Atomically claims the single-use nonce via `public.claim_auth_retry_nonce` RPC in PostgreSQL. All in-memory fail-open fallbacks are eliminated; if the database is unreachable, it fails closed.
  - Consumed authority is **never reopened** after ambiguous downstream provider failures: once claimed, the authority cookie is deleted immediately.
  - **Fresh-Link Recovery Path**: Replaces futile "Try again" copy after a spent claim with a clear fresh-link recovery path: `'Could not update your password. This reset link is no longer valid. Please request a new password reset link.'` with structured navigation `{linkHref: '/login', linkText: 'Request a new password reset link'}`.
- **`acceptInviteAction`**: checks non-empty `token_hash`; validates password before `verifyOtp` to preserve single-use invitation tokens; enforces session-bound retry authority and durable claims; on spent claim failure, returns clear fresh-link path (`'Could not save your password. This invitation link is no longer valid. Please ask an administrator to send a new invitation.'`); and redirects to role home on success.
- **`consumeMagicLinkTokenAction`**: short-circuits immediately on empty/missing `token_hash` without consuming rate-limit quota; enforces fail-closed IP rate limits; handles `verifyOtp` failures; and returns role home on success.

## Durable Single-Use Claims, Fixed Expiry & Expiry-Based Cleanup

### 1. Architectural Distinction: Durable Claims vs Resetting Rate-Limit Windows
- `consume_rate_limit` is designed for sliding rate-control counters (e.g. 5 requests per 5 minutes) and resets `count = 1` and `window_started_at = now()` when `window_started_at <= now() - window_seconds`.
- Using resetting rate-limit windows for single-use token consumption creates a critical security defect: once the window passes, an attacker could replay the spent nonce.
- Migration `0036_auth_retry_claims.sql` establishes `public.auth_retry_claims` with primary key `nonce_hash`. Once inserted via `claim_auth_retry_nonce`, the claim is permanent and non-resetting.

### 2. Runtime Access Restriction & Direct Table Privilege Revocation
- Functions in PostgreSQL grant `EXECUTE` to pseudo-role `PUBLIC` by default.
- Direct table privileges on `public.auth_retry_claims` are completely revoked from all roles, including `service_role`:
  - `revoke all on table public.auth_retry_claims from public, anon, authenticated, service_role;`
- Direct table mutations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) are denied with SQLSTATE `42501` (`insufficient_privilege`) for `anon`, `authenticated`, and `service_role`.
- Access is mediated exclusively through `SECURITY DEFINER` functions:
  - `revoke all on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) from public;`
  - `revoke all on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) from anon;`
  - `revoke all on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) from authenticated;`
  - `grant execute on function public.claim_auth_retry_nonce(text, uuid, text, timestamptz) to service_role;`
  - `grant execute on function public.cleanup_expired_auth_retry_claims() to service_role;`
- Defense-in-depth: `claim_auth_retry_nonce` and `cleanup_expired_auth_retry_claims` inspect `coalesce(current_setting('request.jwt.claim.role', true), '') in ('anon', 'authenticated')` and raise exceptions immediately if called by untrusted roles.
- Database test suite `tests/reliability/auth-retry-claims-db.py` parses psql stdout correctly across `SET` tags, confirms `service_role` and untrusted role `42501` denial SQLSTATEs, and verifies separate-worker concurrency.

### 3. Expiry-Based Cleanup Mechanism
- **Table Index**: An index `auth_retry_claims_expires_at_idx` is placed on `expires_at` for efficient range deletion.
- **Retention Grace Window**: Claims record `expires_at` (token TTL, typically 5 minutes). Claims are retained for a 7-day grace window (`expires_at < now() - interval '7 days'`) before pruning. This guarantees that delayed replay attempts within the week cannot bypass single-use verification due to clock skew or token re-submission.
- **Opportunistic Pruning**: During every invocation of `claim_auth_retry_nonce`, PostgreSQL deletes claims older than 7 days past expiry:
  ```sql
  delete from public.auth_retry_claims where expires_at < v_now - interval '7 days';
  ```
- **Scheduled Maintenance Cleanup**: Migration `0036` provides `public.cleanup_expired_auth_retry_claims() returns bigint` (executable only by `service_role`) for scheduled database retention maintenance sweeps.
- **Multi-Worker Database Verification**: `tests/reliability/auth-retry-claims-db.py` verifies privilege denials on `anon` and `authenticated` roles, high-concurrency race serialization across separate workers (10 workers, exactly 1 succeeds and 11 fail), fixed expiry semantics, and verified execution of `cleanup_expired_auth_retry_claims()`.
