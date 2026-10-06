# Auth & Roles

Authentication foundation for the CRM (Phase 3a): Supabase Auth with SSR cookie sessions, two roles (`admin`, `client`), and a local bootstrap script for user management until the admin UI ships in P3b.

## Overview

- **Auth provider:** Supabase Auth (`@supabase/ssr` + `@supabase/supabase-js`)
- **Session storage:** httpOnly cookies via SSR client factories in `lib/supabase/`
- **Route gate:** `proxy.ts` at the repo root (Next 16's replacement for `middleware.ts` — the spec's `middleware.ts` is implemented as `proxy.ts` because Next 16 renamed/repurposed middleware; same request-interception semantics)
- **Profiles:** `public.profiles` table, one row per auth user, maintained by a signup trigger and kept fresh by the bootstrap script

## Flows

1. **Password login** — email + password sign-in on `/login`; default flow for bootstrapped users.
2. **Magic-link fallback** — OTP/token-hash link delivered to the user's email and verified with `verifyOtp`; used when a password isn't set or is forgotten.
3. **Invite + recovery emails** — sent through the SMTP integration already configured dashboard-side (Resend). Invites point new users at `/invite/accept`; recovery links land on `/reset-password`.

## Dashboard checklist (one-time, Supabase dashboard)

1. **Authentication → Sign In / Up:** disable signups ("Allow new users to sign up" OFF).
2. **URL Configuration:** Site URL `https://redwan.work`; Redirect URLs add `https://redwan.work/**` and `http://localhost:3000/**`.
3. **Email Templates** — switch all three to token-hash style links (works with `verifyOtp`, no `/auth/v1/verify` hop):
   - Invite: `{{ .SiteURL }}/invite/accept?token_hash={{ .TokenHash }}&type=invite&email={{ .Email }}`
   - Reset: `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`
   - Magic Link: `{{ .SiteURL }}/login?token_hash={{ .TokenHash }}&type=magiclink`

   (The invite template carries `email` purely for a friendlier greeting on the accept page.)

## Bootstrap script

Local-only CLI for creating/updating users until the P3b admin UI exists. Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`. Never logs key material — only user ids and actions taken.

```bash
# Create/update a confirmed password user
node --env-file=.env.local scripts/bootstrap-user.mjs \
  --email user@example.com --password 's3cret' \
  --role admin|client [--full-name "Full Name"] [--company "Co"]

# Or send an invite email instead of setting a password
node --env-file=.env.local scripts/bootstrap-user.mjs \
  --email user@example.com --invite \
  --role admin|client [--full-name "Full Name"] [--company "Co"] [--site-url https://redwan.work]
```

Behavior:

- **Existing email** → updates that user: sets the role claim, resets the password if provided.
- **New email + `--password`** → creates a pre-confirmed user (no verification email).
- **New email + `--invite`** → sends an invite email; redirect target is `<site-url>/invite/accept`.
- Either way it upserts the matching row into `public.profiles` (`id`, `role` always; `full_name`, `company` only when their flags are passed).

## Role storage: claim vs column

Roles are stored in **two places**, deliberately:

1. **`app_metadata.role`** (the "claim") — set server-side only; users cannot tamper with app metadata. Read at session issue time so JWTs carry the role for cheap checks.
2. **`public.profiles.role`** — queryable column enforcing RLS policies (admins can read all rows, clients only their own) and supporting joins/reporting.

Both exist because neither alone suffices: the claim travels with every request without a DB hit but can go stale relative to the table; the column is authoritative and policy-enforceable but requires a lookup. The bootstrap script writes both together so they never diverge.

## Probe matrix

Executed on `feat/auth-foundation` against a local dev server (all rows pass). Browser rows ran through a scripted Playwright (chromium headless shell); header-level rows via curl; row 10 via a REST-level equivalent of the SQL-editor cross-client check (see note below).

| # | Probe | Expected | Observed |
|---|---|---|---|
| 1 | Logged out visits `/admin` and `/portal` | `307` → `/login?next=…` | Both returned `HTTP/1.1 307 Temporary Redirect`, `location: /login?next=%2Fadmin` / `location: /login?next=%2Fportal`; browser landed on `/login?next=%2Fadmin` / `/login?next=%2Fportal` |
| 2 | Admin session visits `/portal` | bounced to `/admin` | Final URL `http://localhost:3000/admin` |
| 3 | Client session visits `/admin` | bounced to `/portal` | Final URL `http://localhost:3000/portal` |
| 4 | Admin session visits `/login` | bounced to `/admin` | Final URL `http://localhost:3000/admin` |
| 5 | Active client opens `/portal` | dashboard renders, sidebar shows email | `h1` = "Dashboard"; sidebar contains client email; 3 inert nav items (`aria-disabled`, Tickets/Files/Invoices); 1 `sb-*` session cookie present |
| 6 | Client deactivated (`profiles.is_active=false`), then reloads `/portal` with live cookies | forced logout → `/login?reason=deactivated` + notice; cookies cleared | Landed on `/login?reason=deactivated`; "Your account has been deactivated…" notice rendered; 0 `sb-*` cookies after logout; reloading `/portal` again behaved as logged out (`→ /login?next=%2Fportal`); `/login` rendered signed-out form. Deactivation was applied via service-key REST `PATCH /rest/v1/profiles?id=eq.<client-id>` (`is_active=false`, re-read to confirm) — equivalent of the brief's SQL update |
| 7 | Restore `is_active=true`, client signs in again | works | Service-key PATCH restored `is_active=true` (re-read confirmed); fresh sign-in landed on `/portal`, `h1` = "Dashboard" |
| 8 | Any session presses Sign out | cookies cleared, `/login` renders signed-out | Clicked sidebar Sign out → final URL `/login`, sign-in form rendered, 0 `sb-*` cookies remaining |
| 9 | `curl -X POST /api/auth/logout -H "Origin: https://evil.example"` | `403` | `HTTP/1.1 403 Forbidden` |
| 10 | RLS: anon reads `public.profiles` (REST equivalent of the SQL-editor anon check; real-admin account did not exist yet so the impersonation variant was skipped by ruling) | 0 rows for anon | `GET <supabase>/rest/v1/profiles` with publishable key as `apikey` only (no `Authorization`) → `200`, body exactly `[]` — RLS denies anon, no rows leak |

Notes:

- Row 6 deactivation used the service key over REST rather than the SQL editor so the exact request is reproducible from CI later; the effect on RLS/policies is identical.
- The temp admin account used for rows 2 and 4 was deleted after probing (service-key `auth.admin.deleteUser`, user looked up via `listUsers`); its `profiles` row is confirmed cascade-deleted. The probe client account remains for future verification loops.

### Owner follow-ups after deploy

1. Invite the real admin: run the bootstrap script with `--invite --role admin --site-url https://redwan.work` for the owner account (`<owner-email>`; production URL so the invite lands on the deployed site).
2. From the invite email, click through `/invite/accept` on that account and set a password.
3. Confirm the first portal login at `https://redwan.work/admin` renders the admin Overview shell.

## Deploy checklist

Merging `feat/auth-foundation` to `main` auto-deploys to Vercel. Before merging:

1. **Vercel env vars** — confirm both exist in Vercel project settings (names only, values live in Vercel, never in this repo):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - (`SUPABASE_SECRET_KEY` is already set from Phase 1 and stays untouched.)
   Without the two public vars the proxy fail-closes every protected route to `/login` and sign-in submission throws at the client factory — the site stays up but auth is dead on arrival.
2. **Supabase URL configuration** — Site URL must be `https://redwan.work` at merge time so the token-hash links in email templates resolve against production (see dashboard checklist above).

## P1-C: approved development, provider proof first (2026-10-03)

The preceding foundation records are historical, not proof of current hosted settings or permission to operate production. Policy v1 requires current-password verification, at least 12 characters for the replacement, preservation of the original session, revocation of other refresh sessions and acknowledgment of already-issued JWT lifetime. Forgotten/unset-password recovery remains available.

Owner approved the original six-file batch and the four-target compatibility checkpoint (nine distinct files total) on `feat/profile-password-change`. No dependency upgrade, provider configuration delta, migration, production operation, merge, deployment or AGY host operation is authorized.

The initial PR63 baseline `e1b07a84d54e6829162f9a3a6123c63d12eefa86` proved installed Supabase JS/Auth 2.112.3 and SSR 0.12.4 match the unchanged lockfile. It intentionally fails while the application action is missing. Do not remove that failure merely to make this experiment green.

### Source expectation versus runtime evidence

[Auth v2.196.0 user update](https://github.com/supabase/auth/blob/0204331ca41a5b49f076b6fa3dc6c0d20b996590/internal/api/user.go) conditionally enforces `current_password` and exempts recovery sessions. API/type support alone is insufficient. The no-setting-change proof does not runtime-test the enabled-setting branch. Native password update may already revoke other sessions; this is measured before a separate `scope: 'others'` call.

`run-password-provider.mjs` gates exact locked dependencies, Node 22.23.1, CLI 2.116.0, actual Auth v2.196.0 health/image identity, local origins/current keys, asymmetric JWKS, 120-second fixture tokens and allowlisted session flags. It runs only within the existing fresh `redwan-auth-ci` workflow, between recovery and product acceptance, with no provider setting changes. The receipt records actual image ID/digests and checkout/head identity, never container environment or credentials.

`password-provider.acceptance.mjs` is an experiment, not the application action. Ten acceptance groups (including cleanup) cover native wrong-current-password behavior; missing/wrong/unset credentials; subject binding; verifier-only cleanup; original password/magic-link sessions; native versus explicit other-session revocation; recovery; injected transport ambiguity; residual asymmetric JWT validity/expiry; and exact synthetic user/profile/mail absence. Temporary verification uses a separate in-memory publishable-key client without cookies. Password updates use the original client, never the privileged fixture administrator. A cleanup failure blocks mutation; a lost update response is not retried or called success. A known update with failed explicit revocation is a partial outcome.

The combined workflow publishes `p1c/password-provider` with finite counts, phase and cleanup status, plus safe version/configuration evidence in the job summary. A published checkpoint is not a passing proof: inspect the exact head's receipt. Initial runtime result is pending. Unexpected provider/configuration/version or additional-file needs stop the proof; do not weaken guards or change settings. Existing recovery/invite suites and unconditional disposable teardown remain intact.

Even a successful proof is not UI/server-action acceptance or hosted parity. Single-session policy, CAPTCHA, MFA/nonce requirements, concurrency, account suspension and hosted drift remain implementation/release concerns. No claim of immediate JWT invalidation, universal endpoint acceptance of revoked-session tokens or production readiness is made.

### Application implementation checkpoint (2026-10-03)

This section supersedes earlier pending proof status. [Provider candidate fb026a9](https://github.com/redwan-cse/redwan.work/commit/fb026a927909d13c4fc8f2b5c9797527623ed961) passed ten groups, exact cleanup and existing combined suites in [run 37089357381](https://github.com/redwan-cse/redwan.work/actions/runs/37089357381). Token-hash recovery carries signed `otp` AMR; pinned Auth classifies OTP, MagicLink and Recovery as recovery-capable. The correction changed a test assumption, not settings.

Expanded action regressions at `2468683f1747d6d0aa42315fc5dcaa82f92b453a` failed the intended missing-action assertion in [run 37094718932](https://github.com/redwan-cse/redwan.work/actions/runs/37094718932). Application code followed at `6847aeb6b3817a9882e3b7557bbb34a779e7f8d0`; browser coverage at `389486b4cdb4122ea0c577b0333a2c5cfa0e48de`. Thirty-two mocked action/component checks passed locally, excluding unavailable installed-SDK checks. Component tests were added with implementation, not claimed as a separately observed red phase. Exact installed-dependency tests, lint/types/build and browser acceptance remain pending at this documentation checkpoint.

`changePasswordAction` is client-role, own-account only. It checks active/unbanned authority before verification and again before mutation. Email comes from the original client's current provider user, never posted identity or stale email claims. Independent salted account/IP budgets each allow five attempts per 300 seconds using separate keys under existing `otp-ip`; existing OTP counters are unchanged. Missing configuration/rate control fails closed. Current password is required; replacement is 12 to 4096 characters, confirmed and different, without trimming bytes.

The temporary publishable client has no cookies, persistence, refresh timer or URL detection. Its requests time out after ten seconds and reject redirects. Verified subject matches the actor; session ID must differ. Temporary `scope: 'local'` cleanup precedes mutation. Unexpected aliasing of the original session stops without signing it out. After current authority/email/session rechecks, only the original cookie-bound client updates the password, then calls `scope: 'others'` and checks retained session identity. No privileged password update, raw provider diagnostics or automatic mutation retries.

Outcomes:
- `denied`: validation, account, rate or known credential rejection; no password mutation by this request.
- `verification-unconfirmed`: no update attempted, but verification/temporary cleanup is uncertain. Stop and contact support rather than repeatedly creating sessions.
- `update-unconfirmed`: mutation response uncertain or rejected. Do not assume unchanged state or resubmit automatically; sign out and check the new password or use recovery.
- `changed-unconfirmed`: password update acknowledged, but revocation/continuity not fully confirmed. Do not repeat the change; sign out and contact support.
- `complete`: update, explicit other-session revocation and original session identity confirmed. Already-issued JWTs can remain usable until expiry.

Profile preserves name/company editing. The new form has labels/autofill, pending and duplicate-submission guards, and persistent alert/status feedback. Fields clear after every attempt; passwords are not retained in React state/storage. Uncertain/partial outcomes stop repeat submissions. Forgotten/unset credentials use existing recovery: sign out first, then choose Forgot password on `/login`. No recovery route or provider flow changes.

Disposable lifecycle coverage exercises the real Profile action, wrong-password denial, exact 12-character replacement, keyboard submission, form widths 320/390/720/1440, retained session ID, other-refresh denial, old/new credentials and original-browser refresh after actual token expiry. Existing invite preview/activation/replay, deactivation/reactivation, partial-ban/protected-admin checks and cleanup remain. This is not WCAG certification or hosted acceptance. Provider proof/configuration is unchanged.

The UI guard is not a distributed transaction lock. Simultaneous requests across tabs/devices and hosted single-session/MFA/CAPTCHA/nonce/version behavior remain release-review concerns; globally serialized changes are not claimed. Provider failures never authorize weakening settings.

**Release blocked:** shared `braces` advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no established safe patched upgrade. The owner approved continuing the nine-file scope at 09:49 Asia/Dhaka while preserving that blocker. No dependency change, audit suppression, extra file, fourth PR, merge, deployment, production access or AGY operation. PR61/62 remain separate; integrated acceptance, hosted parity, independent/native review and release approval are not established.

### SEC-02: provider-backed continuity correction (2026-10-06)

This dated checkpoint supersedes the earlier password-change continuity/evidence description. Earlier checkpoints above remain historical records, not the current PR or release disposition. The owner approved this four-file development correction on PR63's existing `feat/profile-password-change` branch: the action, its regression suite, the provider experiment and this document. No provider configuration, migration, dependency, workflow, runner, manifest, UI, shared-client or account-lifecycle file change is included.

The independent G1 review of `387cd4c40a9d26504b4456a3fed6d2aecf7e3ade` found one Medium blocker, SEC-02: concurrent authorized password updates can remove the original session before the action reports `complete`. Pinned auth-js 2.112.3 can suppress missing-session and certain 401/403/404 errors from `scope: 'others'`; an unexpired asymmetric JWT can still pass local `getClaims()` after its server-side session is gone. This is a false-success/session-continuity defect, not evidence of unauthorized password changes.

After the one acknowledged original-client update and `scope: 'others'`, the action now calls the original client's `getUser()` once and requires the actor's user ID without a provider error. It then retains the final verified subject and exact original `session_id` checks. Missing/foreign user data, provider failure, thrown reads or invalid/mismatched final claims return existing `changed-unconfirmed` while `phase='changed'` remains set. No mutation retry, second update, new sign-in, explicit refresh, cached-user substitution or administrator user lookup is added. The other four outcomes and existing authority, rate, verifier-cleanup and recovery controls are unchanged.

This is **point-in-time provider acceptance**, not a distributed lock or a promise against later revocation. It adds one logical Auth read; the shared SSR client and its existing timeout/refresh behavior remain unchanged. No new ten-second production deadline or immediate issued-JWT invalidation is claimed.

Regression evidence is deliberately separated:

- The actual exported action uses real installed SDK `signOut`, `getUser`, `getClaims` and error normalization with finite synthetic HTTP responses and a generated ES256 JWT/JWKS. Cases cover suppressed logout errors, lost/missing/foreign continuity, service/transport/thrown failures, final identity mismatch, success ordering and exactly one update. Unexpected requests fail rather than reach a service.
- The first test-only attempt at `4b79018e467e9d529963dc381782c489f478ae5b` failed an SDK-fixture metadata assumption and is not intended-red evidence. After allowing only the SDK's null PKCE metadata and adding safe diagnostics, [run 37405287163](https://github.com/redwan-cse/redwan.work/actions/runs/37405287163) at `5cdeda63f9f3e870f1bbf46a8215fb36dc3b7fb5` reported `ERR_SESSION_FALSE_COMPLETE`: the unchanged action returned `complete` after the suppressed missing-session error.
- The real-provider `failure_outcomes` group adds an ordered equivalent postcondition: A updates once, B signs in with the new password and removes A via `others`, A's logout reports no error and local claims still verify, but provider `getUser()` rejects A and A's saved refresh token fails. B remains provider-accepted. Positive password/magic-link cases also check provider user and original claims. Exact synthetic cleanup remains mandatory.

The provider sequence has no scheduling sleeps and **does not reproduce two already-authenticated password-update transactions**. That concurrency sequence remains pinned-source evidence. The provider `candidate()` helper is an experiment, not the application action. Ten top-level provider groups remain; old 10/10 receipts do not prove the new assertions. The unchanged real Profile/lifecycle suite still supplies ordinary browser/session-refresh regression coverage.

At this implementation checkpoint, fresh fixed-head CI and independent re-review are pending. Record their exact commit/tree, provider/group and lifecycle results, cleanup and disposition separately; do not relabel old CI as new-head acceptance. G1 remains FAIL until independent re-review resolves SEC-02 and G1-A09/A10/A11/E02/E03 against the corrected candidate. No native approval, PR-ready transition, main merge, deployment, production/provider operation, AGY host work or retained-runtime access follows from this correction.
