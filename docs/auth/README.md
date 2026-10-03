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

Both exist because neither alone is enough: the claim travels with every request without a DB hit but can go stale relative to the table; the column is authoritative and policy-enforceable but requires a lookup. The bootstrap script writes both together so they never diverge.

## Probe matrix

Executed on `feat/auth-foundation` against a local dev server (all rows pass). Browser rows ran through a scripted Playwright (chromium headless shell); header-level rows via curl; row 10 via a REST-level equivalent of the SQL-editor cross-client check (see note below).

| # | Probe | Expected | Observed |
|---|---|---|---|
| 1 | Logged out visits `/admin` and `/portal` | `307` → `/login?next=…` | Both returned `HTTP/1.1 307 Temporary Redirect`, `location: /login?next=%2Fadmin` / `%2Fportal`; browser landed on `/login?next=…` |
| 2 | Admin session visits `/portal` | bounced to `/admin` | Final URL `http://localhost:3000/admin` |
| 3 | Client session visits `/admin` | bounced to `/portal` | Final URL `http://localhost:3000/portal` |
| 4 | Admin session visits `/login` | bounced to `/admin` | Final URL `http://localhost:3000/admin` |
| 5 | Active client opens `/portal` | dashboard renders, sidebar shows email | `h1` = "Dashboard"; sidebar contains client email; 3 inert nav items (`aria-disabled`, Tickets/Files/Invoices); 1 `sb-*` session cookie present |
| 6 | Client deactivated (`profiles.is_active=false`), then reloads `/portal` with live cookies | forced logout → `/login?reason=deactivated` + notice; cookies cleared | Landed on `/login?reason=deactivated`; "Your account has been deactivated…" notice rendered; 0 `sb-*` session cookies remaining; reloading `/portal` again behaved as logged out (`→ /login?next=%2Fportal`); `/login` rendered signed-out form. Deactivation was applied via service-key REST `PATCH /rest/v1/profiles?id=eq.<client-id>` (`is_active=false`, re-read to confirm) — equivalent of the brief's SQL update |
| 7 | Restore `is_active=true`, client signs in again | works | Service-key PATCH restored `is_active=true` (re-read confirmed); fresh sign-in landed on `/portal`, `h1` = "Dashboard" |
| 8 | Any session presses Sign out | cookies cleared, `/login` renders signed-out | Clicked sidebar Sign out → final URL `/login`, sign-in form rendered, 0 `sb-*` session cookies remaining |
| 9 | `curl -X POST /api/auth/logout -H "Origin: https://evil.example"` | `403` | HTTP `403` |
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
2. **Supabase URL configuration** — Site URL must be `https://redwan.work`; configure it before the first deployment (see dashboard checklist above).

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
