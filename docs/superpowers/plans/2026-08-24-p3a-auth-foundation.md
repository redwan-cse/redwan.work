# Phase 3a — Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth to redwan.work: a Next.js 16 `proxy.ts` gate doing session refresh + role guards, a `profiles` table with dual role storage and RLS, login / reset-password / invite-accept pages, admin bootstrap tooling, and empty `(admin)` + `(client)` panel shells.

**Architecture:** Single gate file (`proxy.ts`, the Next.js 16 successor to `middleware.ts`) runs `@supabase/ssr` `createServerClient` with cookie plumbing and calls `getClaims()` before anything else so refresh cookies survive. Role decisions come from the verified JWT claim `app_metadata.role`; the expensive `profiles.is_active` DB check runs only for client-role traffic on `/portal`. RLS is the real boundary — the proxy is UX routing. All auth mutations are server actions or route handlers; service-role key stays in server-only modules.

**Tech Stack:** Next.js 16 App Router (proxy.ts, server actions) · React 19 · `@supabase/ssr` + `@supabase/supabase-js` v2 · Postgres RLS + security-definer helpers · Tailwind + shadcn/ui primitives already in repo.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§1 locked decisions, §2 middleware contract + defense-in-depth, §3 profiles data model, §8 phase P3a). Spec deltas approved 2026-08-24: (1) file is `proxy.ts` / export `proxy` because Next 16 deprecates `middleware.ts` (behavior identical); (2) Resend SMTP for Supabase auth emails is **already configured** at the Supabase dashboard (project `cqxtmzzlywolulechcob`) — no app-side email work; P5 lifecycle-email API integration unchanged.

## Global Constraints

- TypeScript strict must stay clean: `npx tsc --noEmit`. Repo verification loop (no test framework by design): `npm run lint` → `npx tsc --noEmit` → `npm run build` → curl/dev-server probes.
- Env names are locked: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. New-format keys only (`sb_publishable_…` / `sb_secret_…`). `.env.example` must NOT change (no new vars).
- Secrets never appear in client bundles, logs, or commits. Never print env values; log presence only.
- RLS is the security boundary: publishable-key paths must never be trusted alone; every panel layout re-verifies identity/role server-side.
- No public signup ever: Supabase "Enable signups" stays disabled; users come from `scripts/bootstrap-user.mjs` until the P3b admin UI.
- One branch for this phase: `feat/auth-foundation`. Commits per task. **No push/merge to main without explicit user confirmation** (Vercel auto-deploys).
- Blogger (`lib/blogger.ts`) and the contact pipeline (`app/api/contact/**`, `lib/contact/**`, `components/enhanced-contact-form.tsx`) are untouched.
- SQL LSP reports false syntax errors on `supabase/migrations/*.sql` — ignore them; trust `npx supabase db push`.
- When killing a dev server use `pkill -f '[n]ext dev'` (bracket trick avoids killing the session shell).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0002_profiles.sql` | `profiles` table, `is_admin()` helper, RLS policies, `on_auth_user_created` trigger |
| `lib/supabase/server.ts` | Cookie-bound server client factory (`await cookies()`), server-only |
| `lib/supabase/client.ts` | Browser client factory (`createBrowserClient`) |
| `lib/auth/session.ts` | `getCurrentSession()` — claims → `{ userId, email, role } \| null` |
| `proxy.ts` | Gate: session refresh, unauth redirect, role bounce, deactivated-client bounce |
| `app/api/auth/logout/route.ts` | POST (UI logout) + GET (forced logout) → sign out, clear cookies, redirect `/login` |
| `lib/auth/actions.ts` | Server actions: password sign-in, magic link, forgot/reset password, invite accept |
| `app/(auth)/layout.tsx` | Minimal centered layout for auth pages, `noindex` |
| `app/(auth)/login/page.tsx` | Password form + magic-link fallback + inline forgot-password |
| `app/(auth)/reset-password/page.tsx` | Recovery-email landing → set new password |
| `app/(auth)/invite/accept/page.tsx` | Invite-email landing → set password → routed to panel |
| `app/(admin)/admin/layout.tsx` + `page.tsx` | Admin shell (role re-check) + Overview placeholder |
| `app/(client)/portal/layout.tsx` + `page.tsx` | Client shell (role re-check + is_active re-check) + Dashboard placeholder |
| `components/panel/panel-shell.tsx` | Shared sidebar shell: nav items, user email, logout form button |
| `scripts/bootstrap-user.mjs` | Local CLI: create/invite user, set `app_metadata.role`, upsert profile row |
| `next.config.js` | CSP `connect-src` gains the Supabase project origin |
| `docs/auth/README.md` | Flows, one-time dashboard config checklist, bootstrap runbook, probe matrix |

---

### Task 1: Migration — profiles, roles, RLS, signup trigger

**Files:**
- Create: `supabase/migrations/0002_profiles.sql`

**Interfaces:**
- Produces: table `public.profiles(id uuid PK → auth.users ON DELETE CASCADE, role text CHECK IN ('admin','client') NOT NULL DEFAULT 'client', full_name text, company text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`; function `public.is_admin() → boolean`; trigger `on_auth_user_created` auto-inserting a default profile row per new auth user.
- RLS posture (spec §3): clients SELECT own row; admins SELECT/UPDATE all rows via `is_admin()`; no INSERT policy (profile creation happens via trigger + service-role upserts only).

- [ ] **Step 1: Write the migration**

```sql
-- 0002_profiles.sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client' check (role in ('admin', 'client')),
  full_name text,
  company text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Role check against the JWT claim (dual storage: claim gates routes, column gates SQL)
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_admin_select_all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles_admin_update_all"
  on public.profiles for update
  using (public.is_admin());

-- Every new auth user gets a profile row automatically (default role 'client').
-- Bootstrap/promotion still sets app_metadata + role explicitly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`
Expected: migration applied. (If the CLI is not linked, run `npx supabase link --project-ref cqxtmzzlywolulechcob` first; credentials come from the owner's Supabase access token.)

- [ ] **Step 3: Verify in Supabase SQL editor**

```sql
-- a) table exists with expected columns
select column_name, data_type, column_default from information_schema.columns where table_name = 'profiles';
-- b) helper behaves: as anon (no JWT) this is false; as an admin-JWT user it is true
select public.is_admin();
-- c) trigger exists
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created';
```

Expected: columns listed; `is_admin()` returns false for anon context; trigger row present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_profiles.sql
git commit -m "feat(auth): add profiles table with RLS roles and signup trigger"
```

---

### Task 2: Supabase SSR client modules

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Produces:
  - `createSupabaseServerClient(): Promise<SupabaseClient>` — cookie-bound via `await cookies()`; usable in server components, server actions, route handlers.
  - `createSupabaseBrowserClient(): SupabaseClient` — module-level singleton memoized by `createBrowserClient`.

- [ ] **Step 1: Install dependency**

Run: `npm install @supabase/ssr`
Expected: added to `package.json` dependencies (peer-compatible with `@supabase/supabase-js@^2`).

- [ ] **Step 2: Create `lib/supabase/server.ts`**

```typescript
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase client credentials missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render — safe to ignore because the
          // proxy refreshes sessions before render for every matched route.
        }
      },
    },
  });
}
```

- [ ] **Step 3: Create `lib/supabase/client.ts`**

```typescript
'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase client credentials missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, publishableKey);
  }
  return browserClient;
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/supabase/server.ts lib/supabase/client.ts
git commit -m "feat(auth): add supabase ssr server and browser client factories"
```

---

### Task 3: Session reader + proxy gate + logout route + CSP

**Files:**
- Create: `lib/auth/session.ts`
- Create: `proxy.ts`
- Create: `app/api/auth/logout/route.ts`
- Modify: `next.config.js` (CSP `connect-src`)

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (Task 2), `parseCookieHeader` from `@supabase/ssr`, env `NEXT_PUBLIC_*`.
- Produces:
  - `type AppRole = 'admin' | 'client'`; `type SessionInfo = { userId: string; email: string; role: AppRole }`; `getCurrentSession(): Promise<SessionInfo | null>` (null when no valid claims OR role missing/unknown).
  - `proxy(request: NextRequest): Promise<NextResponse>` + `export const config.matcher = ['/admin/:path*', '/portal/:path*', '/login', '/reset-password', '/invite/:path*']`.
  - `GET/POST /api/auth/logout?reason=deactivated` → clears session cookies → redirects to `/login?reason=…`.

- [ ] **Step 1: Create `lib/auth/session.ts`**

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AppRole = 'admin' | 'client';

export interface SessionInfo {
  userId: string;
  email: string;
  role: AppRole;
}

interface ClaimsLike {
  sub?: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

export async function getCurrentSession(): Promise<SessionInfo | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as ClaimsLike | undefined;

  if (!claims?.sub || !claims.email) return null;

  const role = claims.app_metadata?.['role'];
  if (role !== 'admin' && role !== 'client') return null;

  return { userId: claims.sub, email: claims.email, role };
}
```

- [ ] **Step 2: Create `proxy.ts`**

Behavior contract (spec §2):
- Always call `getClaims()` first so refresh cookies are written onto the outgoing response.
- Unauthenticated hit on any matched non-auth path → redirect `/login?next=<path+query>`.
- Authenticated hit on `/login` → redirect to their panel home.
- `/admin/*`: requires claim role `admin`; anyone else signed-in → their panel home if they have one, else forced logout.
- `/portal/*`: requires claim role `client`; `admin` → `/admin`; claimed clients get ONE profiles query (RLS: own row readable with publishable key) — `is_active = false` → forced logout via `/api/auth/logout?reason=deactivated`.
- Claimed user with neither role → forced logout.
- Missing env vars → fail closed for protected paths (treat as unauthenticated), pass through auth pages so the error is visible there.

```typescript
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_PAGES = new Set(['/login', '/reset-password']);
const LOGOUT_ROUTE = '/api/auth/logout';

function panelHome(role: string | undefined): string | null {
  if (role === 'admin') return '/admin';
  if (role === 'client') return '/portal';
  return null;
}

function readClaimRole(claims: unknown): string | undefined {
  const c = claims as { app_metadata?: Record<string, unknown> } | null | undefined;
  const role = c?.app_metadata?.['role'];
  return typeof role === 'string' ? role : undefined;
}

function readClaimSub(claims: unknown): string | undefined {
  const sub = (claims as { sub?: unknown } | null | undefined)?.sub;
  return typeof sub === 'string' ? sub : undefined;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname, search } = request.nextUrl;

  // Fail closed for protected paths when Supabase env is absent.
  if (!url || !publishableKey) {
    const isAuthPage =
      AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
    if (isAuthPage) return NextResponse.next();
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.cookies.toString());
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Must happen before any response is committed so refreshed cookies survive.
  const { data } = await supabase.auth.getClaims();
  const role = readClaimRole(data?.claims);
  const authenticated = Boolean(readClaimSub(data?.claims));

  const isAuthPage = AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
  const loginUrl = new URL('/login', request.url);

  if (!authenticated) {
    if (isAuthPage) return response;
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login') {
    const home = panelHome(role);
    if (home) return NextResponse.redirect(new URL(home, request.url));
    return response; // reset-password/invite pages stay reachable while signed in
  }

  if (pathname.startsWith('/admin')) {
    if (role === 'admin') return response;
    const home = panelHome(role);
    if (home) return NextResponse.redirect(new URL(home, request.url));
    await supabase.auth.signOut();
    return redirectWithCookies(loginUrl, response);
  }

  if (pathname.startsWith('/portal')) {
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (role === 'client') {
      const userId = readClaimSub(data?.claims)!;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.is_active === true) return response;
    }
    // The logout route performs the actual sign-out with proper cookie context;
    // the proxy only bounces there.
    const bye = new URL(LOGOUT_ROUTE, request.url);
    bye.searchParams.set('reason', 'deactivated');
    return NextResponse.redirect(bye);
  }

  return response;
}

function redirectWithCookies(target: URL, base: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(target);
  // signOut() wrote cleared cookie values into `base`; carry them over so the
  // browser actually drops the session cookies on this same response.
  base.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  return redirect;
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/login', '/reset-password', '/invite/:path*'],
};
```

- [ ] **Step 3: Create `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Same-origin check (mirrors the contact API convention). POST must carry an
  // Origin (browsers always send one on form posts); GET is exempt because it
  // only serves the proxy's own deactivated-client bounce.
  const origin = request.headers.get('origin');
  const allowed = new Set([request.nextUrl.origin, 'https://redwan.work']);
  const originOk =
    origin !== null &&
    (() => {
      try {
        return allowed.has(new URL(origin).origin);
      } catch {
        return false;
      }
    })();
  if (!originOk) {
    return NextResponse.json({ error: 'Request origin not allowed' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const reason = request.nextUrl.searchParams.get('reason');
  const loginUrl = new URL('/login', request.url);
  if (reason === 'deactivated') {
    loginUrl.searchParams.set('reason', 'deactivated');
  }
  return NextResponse.redirect(loginUrl, { status: reason ? 302 : 303 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
```

Note: GET exists solely for the proxy's deactivated-client bounce (the browser follows the redirect itself, so it is effectively same-origin); POST is what the UI logout form uses.

- [ ] **Step 4: Update CSP in `next.config.js`**

In the `csp` array change:

```javascript
  "connect-src 'self' https://challenges.cloudflare.com",
```

to:

```javascript
  "connect-src 'self' https://challenges.cloudflare.com https://cqxtmzzlywolulechcob.supabase.co",
```

(Browser auth calls go to `<project-ref>.supabase.co`; without this the login page silently fails under CSP.)

- [ ] **Step 5: Verify gates + curl probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all green.

Start dev server (`npm run dev`), then probe:

```bash
# a) unauthenticated /admin → redirected to /login?next=%2Fadmin
curl -s -o /dev/null -D - http://localhost:3000/admin | grep -i -E 'HTTP/|location'
# b) unauthenticated /portal → same pattern
curl -s -o /dev/null -D - http://localhost:3000/portal | grep -i -E 'HTTP/|location'
# c) /login renders 200 (page may be a stub error-free shell until Task 5)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
```

Expected: (a)/(b) `307` + `location: /login?next=…`; (c) `200`.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/session.ts proxy.ts app/api/auth/logout/route.ts next.config.js
git commit -m "feat(auth): add proxy gate with role guards, session reader, logout route, CSP allowlist"
```

---

### Task 4: Admin bootstrap script + dashboard config runbook

**Files:**
- Create: `scripts/bootstrap-user.mjs`
- Create: `docs/auth/README.md` (flows + dashboard checklist + script usage; probe-matrix section appended in Task 7)

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (loaded from `.env.local` via `node --env-file`), Supabase Auth admin API (`createUser`, `inviteUserByEmail`, `getUserByEmail`, `updateUserById`).
- Produces: CLI `node --env-file=.env.local scripts/bootstrap-user.mjs --email <addr> (--password <pw> | --invite) --role <admin|client> [--full-name "<name>"]`. Exit 0 on success; prints user id + actions taken, never key material.

- [ ] **Step 1: Write `scripts/bootstrap-user.mjs`**

```javascript
#!/usr/bin/env node
// Local-only bootstrap for auth users until the P3b admin UI exists.
// Usage:
//   node --env-file=.env.local scripts/bootstrap-user.mjs \
//     --email user@example.com (--password 's3cret' | --invite) \
//     --role admin|client [--full-name "Full Name"] [--company "Co"]
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const email = argOf('--email');
const password = argOf('--password');
const invite = args.includes('--invite');
const role = argOf('--role');
const fullName = argOf('--full-name') ?? null;
const company = argOf('--company') ?? null;

if (!email || !role || (!password && !invite)) {
  console.error('usage: --email <addr> (--password <pw> | --invite) --role admin|client [--full-name n] [--company c]');
  process.exit(1);
}
if (!['admin', 'client'].includes(role)) {
  console.error('--role must be admin or client');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in environment');
  process.exit(1);
}

const siteUrl = process.argv.includes('--site-url')
  ? argOf('--site-url')
  : 'http://localhost:3000';

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureProfile(userId) {
  const { error } = await admin.from('profiles').upsert(
    { id: userId, role, full_name: fullName, company },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`profile upsert failed: ${error.message}`);
}

async function main() {
  const existing = await admin.auth.getUserByEmail(email);

  let userId;
  if (existing.data?.user) {
    userId = existing.data.user.id;
    const updates = { app_metadata: { ...existing.data.user.app_metadata, role } };
    if (password) updates.password = password;
    const { error } = await admin.auth.updateUserById(userId, updates);
    if (error) throw new Error(`update failed: ${error.message}`);
    console.log(`updated existing user ${userId} (role=${role}${password ? ', password reset' : ''})`);
  } else if (invite) {
    const { data, error } = await admin.auth.inviteUserByEmail(email, {
      options: { redirectTo: `${siteUrl}/invite/accept` },
    });
    if (error) throw new Error(`invite failed: ${error.message}`);
    userId = data.user.id;
    const { error: metaErr } = await admin.auth.updateUserById(userId, {
      app_metadata: { ...data.user.app_metadata, role },
    });
    if (metaErr) throw new Error(`setting app_metadata failed: ${metaErr.message}`);
    console.log(`invited ${userId} (role=${role}) — invite email sent via configured SMTP`);
  } else {
    const { data, error } = await admin.auth.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
    });
    if (error) throw new Error(`create failed: ${error.message}`);
    userId = data.user.id;
    console.log(`created user ${userId} (role=${role}, confirmed)`);
  }

  await ensureProfile(userId);
  console.log(`profile upserted (role=${role})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it — create the real admin**

Dashboard pre-step (one-time, documented in README Step below but done now):
1. Supabase dashboard → Authentication → Sign In / Up: **disable signups** ("Allow new users to sign up" OFF).
2. URL Configuration: Site URL `https://redwan.work`; Redirect URLs add `https://redwan.work/**` and `http://localhost:3000/**`.
3. Email Templates — switch all three to token-hash style links (works with `verifyOtp`, no `/auth/v1/verify` hop):
   - Invite: `{{ .SiteURL }}/invite/accept?token_hash={{ .TokenHash }}&type=invite&email={{ .Email }}`
   - Reset: `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`
   - Magic Link: `{{ .SiteURL }}/login?token_hash={{ .TokenHash }}&type=magiclink`

(The invite template carries `email` purely for a friendlier greeting on the accept page.)

Then:

```bash
node --env-file=.env.local scripts/bootstrap-user.mjs --email <redwan@redwan.work> --password '<chosen>' --role admin --full-name "Md Redwan Ahmed"
```

Expected: `created user <uuid> (role=admin, confirmed)` + `profile upserted (role=admin)`.

SQL editor cross-check:

```sql
select id, email, raw_app_meta_data ->> 'role' as claim_role from auth.users;
select id, role, is_active from public.profiles;
```

Expected: one admin row in each, matching ids.

Also create one test client for later probes:

```bash
node --env-file=.env.local scripts/bootstrap-user.mjs --email probe.client@example.com --password '<test-pw>' --role client --full-name "Probe Client"
```

- [ ] **Step 3: Write `docs/auth/README.md`**

Document (concise, matching docs/ tone elsewhere): the three flows (password login, magic-link fallback, invite + recovery emails via Resend SMTP already configured dashboard-side); the dashboard checklist from Step 2 verbatim; bootstrap script usage incl. both modes; role dual-storage explanation (claim vs column) and why both exist; note that spec's `middleware.ts` is implemented as `proxy.ts` per Next 16. Leave a stub section `## Probe matrix` to fill in Task 7.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-user.mjs docs/auth/README.md
git commit -m "feat(auth): add local bootstrap-user script and auth runbook"
```

---

### Task 5: Login page + auth server actions

**Files:**
- Create: `lib/auth/actions.ts`
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `components/auth/auth-form.tsx` (shared field/error styling used by all three auth pages)

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (Task 2), `getCurrentSession()` (Task 3).
- Produces (all exported from `lib/auth/actions.ts`, each `"use server"`, each returning `{ error: string } | { ok: true }` — never throwing to the UI, never logging credentials):
  - `signInWithPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState>` — fields `email`, `password`, `next`; on success `redirect(next)` where next validated to start with `/` and not `//`.
  - `requestMagicLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState>` — `signInWithOtp({ email })`; always reports success (no account enumeration).
  - `requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState>` — `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`; always reports success.
  - `type ActionState = { error?: string; notice?: string }`.
- Post-login target: admin → `/admin`, client → `/portal`, resolved from fresh claims after sign-in.

- [ ] **Step 1: Write `lib/auth/actions.ts`**

```typescript
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionState = { error?: string; notice?: string };

function safeNext(raw: FormDataEntryValue | null, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

async function panelHomeForCurrentUser(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims as { app_metadata?: Record<string, unknown> } | null | undefined)
    ?.app_metadata?.['role'];
  return role === 'admin' ? '/admin' : '/portal';
}

export async function signInWithPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email || !password) return { error: 'Email and password are required.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Invalid email or password.' };

  redirect(safeNext(next, await panelHomeForCurrentUser()));
}

export async function requestMagicLinkAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  // Uniform message regardless of account existence.
  if (error && error.status !== 429) {
    return { notice: 'If that address has an account, a sign-in link is on its way.' };
  }
  if (error && error.status === 429) {
    return { error: 'Too many requests. Please wait a minute and try again.' };
  }
  return { notice: 'If that address has an account, a sign-in link is on its way.' };
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };

  // Build redirectTo from request headers so localhost probes receive
  // links that land locally and production links land on the deployed origin.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const redirectTo = `${proto}://${host}/reset-password`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error && error.status === 429) {
    return { error: 'Too many requests. Please wait a minute and try again.' };
  }
  return { notice: 'If that address has an account, a reset link is on its way.' };
}
```

Implementation note: `redirectTo` comes from request headers only — never from client-supplied form fields.

- [ ] **Step 2: Write `app/(auth)/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in · redwan.work',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/auth/auth-form.tsx`**

Shared presentational bits (Card, Input, Label, Button all exist under `components/ui/`):

```tsx
'use client';

import { cn } from '@/lib/utils';

export function FormMessage({ state }: { state: { error?: string; notice?: string } }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        state.error
          ? 'border-destructive/50 text-destructive'
          : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
      )}
    >
      {state.error ?? state.notice}
    </p>
  );
}
```

- [ ] **Step 4: Write `app/(auth)/login/page.tsx`**

Client component using React 19 `useActionState`:

```tsx
'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FormMessage } from '@/components/auth/auth-form';
import {
  signInWithPasswordAction,
  requestMagicLinkAction,
  requestPasswordResetAction,
  type ActionState,
} from '@/lib/auth/actions';

const initial: ActionState = {};

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');

  const [signInState, signIn, signInPending] = useActionState(signInWithPasswordAction, initial);
  const [magicState, magic, magicPending] = useActionState(requestMagicLinkAction, initial);
  const [resetState, reset, resetPending] = useActionState(requestPasswordResetAction, initial);

  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const nextPath = searchParams?.get('next') ?? '/';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          {mode === 'signin'
            ? 'Admin and client access. Accounts are created by invitation only.'
            : 'We will email you a password reset link if the address has an account.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'signin' ? (
          <>
            <form action={signIn} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <FormMessage state={signInState} />
              <Button type="submit" className="w-full" disabled={signInPending}>
                {signInPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="text-center text-xs">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Separator />

            <form action={magic} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">Or get a one-time sign-in link</Label>
                <Input id="magic-email" name="email" type="email" required />
              </div>
              <FormMessage state={magicState} />
              <Button type="submit" variant="outline" className="w-full" disabled={magicPending}>
                {magicPending ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <form action={reset} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" name="email" type="email" required />
              </div>
              <FormMessage state={resetState} />
              <Button type="submit" className="w-full" disabled={resetPending}>
                {resetPending ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <div className="text-center text-xs">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Need an account?{' '}
          <Link href="/contact" className="underline-offset-4 hover:underline">
            Become a client
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

(The magic-link template points back at `/login?token_hash=…&type=magiclink`; consuming that param lands in Task 6 together with the other two token flows.)

- [ ] **Step 5: Verify gates + manual probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: green.

Dev-server probes (browser):
- Wrong password → `Invalid email or password.` message, no navigation.
- Correct admin credentials → lands on `/admin` (shell arrives in Task 7; a 404 there is expected mid-phase).
- Magic link: submit → uniform notice; inbox receives email via Resend SMTP; clicking it lands on `/login?token_hash=…&type=magiclink` (not yet consumable — fine).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/actions.ts "app/(auth)" components/auth/auth-form.tsx
git commit -m "feat(auth): add login page with password, magic link and forgot flows"
```

---

### Task 6: Token-consumption actions + reset-password & invite-accept pages

**Files:**
- Modify: `lib/auth/actions.ts` (append two actions)
- Modify: `app/(auth)/login/page.tsx` (consume magic-link token params)
- Create: `app/(auth)/reset-password/page.tsx`
- Create: `app/(auth)/invite/accept/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient()`; `panelHomeForCurrentUser()` behavior (re-implemented locally inside the new actions to keep them self-contained).
- Produces (added to `lib/auth/actions.ts`):
  - `setNewPasswordFromRecoveryAction(_prev: ActionState, formData: FormData): Promise<ActionState>` — fields `token_hash`, `password`, `confirm`; flow: `verifyOtp({ type: 'recovery', token_hash })` → `updateUser({ password })` → `redirect(panelHome)`.
  - `acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState>` — fields `token_hash`, `password`, `confirm`; flow: `verifyOtp({ type: 'invite', token_hash })` → `updateUser({ password })` → `redirect(panelHome)`.
  - Shared validation: password ≥ 12 chars, must equal confirm; invalid/expired token → `{ error: 'This link is invalid or has expired. Ask for a new one.' }`.
  - `consumeMagicLinkTokenAction(tokenHash: string): Promise<{ ok: true } | { error: string }>` — plain async fn (called from an effect, not a form): `verifyOtp({ type: 'magiclink', token_hash })`; caller redirects based on result.

- [ ] **Step 1: Append the three actions to `lib/auth/actions.ts`**

```typescript
const MIN_PASSWORD = 12;
const INVALID_LINK = 'This link is invalid or has expired. Ask for a new one.';

function validatePasswordPair(formData: FormData): { error: string } | { password: string } {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) return { error: 'Passwords do not match.' };
  return { password };
}

export async function setNewPasswordFromRecoveryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tokenHash = String(formData.get('token_hash') ?? '');
  if (!tokenHash) return { error: INVALID_LINK };

  const checked = validatePasswordPair(formData);
  if ('error' in checked) return { error: checked.error };

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token_hash: tokenHash,
  });
  if (verifyError) return { error: INVALID_LINK };

  const { error: updateError } = await supabase.auth.updateUser({
    password: checked.password,
  });
  if (updateError) return { error: 'Could not update your password. Try again.' };

  redirect(await panelHomeForCurrentUser());
}

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tokenHash = String(formData.get('token_hash') ?? '');
  if (!tokenHash) return { error: INVALID_LINK };

  const checked = validatePasswordPair(formData);
  if ('error' in checked) return { error: checked.error };

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'invite',
    token_hash: tokenHash,
  });
  if (verifyError) return { error: INVALID_LINK };

  const { error: updateError } = await supabase.auth.updateUser({
    password: checked.password,
  });
  if (updateError) return { error: 'Could not save your password. Try again.' };

  redirect(await panelHomeForCurrentUser());
}

export async function consumeMagicLinkTokenAction(
  tokenHash: string
): Promise<{ ok: true; home: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (error) return { ok: false, error: INVALID_LINK };
  return { ok: true, home: await panelHomeForCurrentUser() };
}
```

- [ ] **Step 2: Consume magic-link params on the login page**

In `app/(auth)/login/page.tsx` add:

```tsx
  const tokenHash = searchParams?.get('token_hash') ?? '';
  const tokenType = searchParams?.get('type');

  const [tokenState, setTokenState] = useState<'idle' | 'working' | 'failed'>(
    tokenHash && tokenType === 'magiclink' ? 'working' : 'idle'
  );

  useEffect(() => {
    if (tokenState !== 'working') return;
    let cancelled = false;
    consumeMagicLinkTokenAction(tokenHash).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        window.location.assign(result.home);
      } else {
        setTokenState('failed');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenState, tokenHash]);
```

with imports updated to include `useEffect` and `consumeMagicLinkTokenAction`, plus a banner above the card content:

```tsx
  {tokenState === 'working' && <p className="text-sm text-muted-foreground">Signing you in…</p>}
  {tokenState === 'failed' && (
    <FormMessage state={{ error: 'That sign-in link is invalid or has expired.' }} />
  )}
```

- [ ] **Step 3: Write `app/(auth)/reset-password/page.tsx`**

```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormMessage } from '@/components/auth/auth-form';
import { setNewPasswordFromRecoveryAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function searchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

export default function ResetPasswordPage() {
  const tokenHash = searchParam('token_hash');
  const [state, submit, pending] = useActionState(setNewPasswordFromRecoveryAction, initial);

  if (!tokenHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid link</CardTitle>
          <CardDescription>
            This password-reset link is missing its token. Request a new one from the sign-in page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>Pick something long and unique — at least 12 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <FormMessage state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `app/(auth)/invite/accept/page.tsx`**

Same shape as reset-password but: title "Set your password", description mentions the invitation, form posts to `acceptInviteAction`, and it shows the invited email (read from the `email` search param, display-only):

```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormMessage } from '@/components/auth/auth-form';
import { acceptInviteAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function searchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

export default function InviteAcceptPage() {
  const tokenHash = searchParam('token_hash');
  const email = searchParam('email');
  const [state, submit, pending] = useActionState(acceptInviteAction, initial);

  if (!tokenHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid invitation</CardTitle>
          <CardDescription>
            This invite link is missing its token. Ask the administrator to resend it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome{email ? `, ${email}` : ''}</CardTitle>
        <CardDescription>Set a password to activate your account — at least 12 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} />
          </div>
          <FormMessage state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Verify gates + real-email walkthroughs**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: green.

Dev-server probes (real emails — Resend SMTP is live):
1. Forgot password → email arrives → click → `/reset-password?token_hash=…` renders form → set new password → lands signed-in on panel home.
2. Reuse the SAME link → invalid-link error (tokens single-use).
3. Bootstrap an invite-mode client (`node --env-file=.env.local scripts/bootstrap-user.mjs --email probe.invite@example.com --invite --role client`) → click invite email → set password → lands on `/portal` (Task 7 adds the shell; 404 acceptable mid-phase).
4. Tamper test: `/reset-password?token_hash=deadbeef` + submit → invalid-link error.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/actions.ts "app/(auth)" 
git commit -m "feat(auth): add recovery, invite acceptance and magic-link token consumption"
```

---

### Task 7: Panel shells + defense-in-depth checks + close-out docs

**Files:**
- Create: `components/panel/panel-shell.tsx`
- Create: `app/(admin)/admin/layout.tsx`
- Create: `app/(admin)/admin/page.tsx`
- Create: `app/(client)/portal/layout.tsx`
- Create: `app/(client)/portal/page.tsx`
- Modify: `docs/auth/README.md` (fill probe matrix + verification results)

**Interfaces:**
- Consumes: `getCurrentSession()` (Task 3), `supabase.from('profiles').select('is_active')` for client layouts, logout route POST (Task 3).
- Produces: rendered shells at `/admin` (Overview placeholders: Open tickets, Unpaid invoices, Recent leads — static zeros with "P3b/P4b" captions) and `/portal` (Active projects, Tickets, Outstanding invoice — same treatment). Nav items present but inert (`aria-disabled`, tooltip "coming soon"): admin — Clients, Tickets, Projects, Invoices, Assets; client — Tickets, Files, Invoices.

- [ ] **Step 1: Write `components/panel/panel-shell.tsx`**

```tsx
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PanelNavItem {
  label: string;
  href: string;
  enabled?: boolean;
}

export function PanelShell({
  title,
  userEmail,
  navItems,
  activeHref,
  children,
}: {
  title: string;
  userEmail: string;
  navItems: PanelNavItem[];
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="border-b px-5 py-4">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) =>
            item.enabled === false ? (
              <span
                key={item.href}
                aria-disabled="true"
                title="Coming soon"
                className="block cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm hover:bg-accent',
                  activeHref === item.href && 'bg-accent font-medium'
                )}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="border-t p-3">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-5 py-3 md:hidden">
          <p className="text-sm font-semibold">{title}</p>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" size="sm" className="gap-2">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Admin layout + page**

`app/(admin)/admin/layout.tsx` — defense-in-depth: even though the proxy gated the request, the layout independently verifies (RLS-first philosophy):

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { PanelShell } from '@/components/panel/panel-shell';

export const metadata: Metadata = {
  title: 'Admin · redwan.work',
  robots: { index: false, follow: false },
};

const NAV = [
  { label: 'Overview', href: '/admin', enabled: true },
  { label: 'Clients', href: '/admin/clients', enabled: false },
  { label: 'Tickets', href: '/admin/tickets', enabled: false },
  { label: 'Projects', href: '/admin/projects', enabled: false },
  { label: 'Invoices', href: '/admin/invoices', enabled: false },
  { label: 'Assets', href: '/admin/assets', enabled: false },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/admin');
  if (session.role !== 'admin') redirect('/portal');

  return (
    <PanelShell
      title="redwan.work admin"
      userEmail={session.email}
      navItems={NAV}
      activeHref="/admin"
    >
      {children}
    </PanelShell>
  );
}
```

`app/(admin)/admin/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const OVERVIEW = [
  { title: 'Open tickets', value: '0', caption: 'Ticketing arrives in P3b' },
  { title: 'Unpaid invoices', value: '0', caption: 'Invoicing arrives in P4b' },
  { title: 'Recent leads', value: '—', caption: 'Lead inbox arrives in P3b' },
];

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {OVERVIEW.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Client layout + page**

`app/(client)/portal/layout.tsx` — re-verifies role AND `is_active` (fresh read, not trusting the proxy's earlier check):

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PanelShell } from '@/components/panel/panel-shell';

export const metadata: Metadata = {
  title: 'Client portal · redwan.work',
  robots: { index: false, follow: false },
};

const NAV = [
  { label: 'Dashboard', href: '/portal', enabled: true },
  { label: 'Tickets', href: '/portal/tickets', enabled: false },
  { label: 'Files', href: '/portal/files', enabled: false },
  { label: 'Invoices', href: '/portal/invoices', enabled: false },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');
  if (session.role === 'admin') redirect('/admin');
  if (session.role !== 'client') {
    redirect('/api/auth/logout?reason=deactivated');
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', session.userId)
    .maybeSingle();
  if (profile?.is_active !== true) {
    redirect('/api/auth/logout?reason=deactivated');
  }

  return (
    <PanelShell
      title="Client portal"
      userEmail={session.email}
      navItems={NAV}
      activeHref="/portal"
    >
      {children}
    </PanelShell>
  );
}
```

`app/(client)/portal/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DASHBOARD = [
  { title: 'Active projects', value: '0', caption: 'Projects arrive in P4a' },
  { title: 'Open tickets', value: '0', caption: 'Tickets arrive in P3c' },
  { title: 'Outstanding invoice', value: '—', caption: 'Invoicing arrives in P4b' },
];

export default function PortalDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {DASHBOARD.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Add a small "account deactivated" notice to the login page (reads `?reason=deactivated`): render `<FormMessage state={{ error: 'Your account has been deactivated. Contact the administrator.' }} />` above the form when the param is present.

- [ ] **Step 4: Verify gates + full probe walkthrough (browser)**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: green.

Probe matrix (execute ALL, record results into `docs/auth/README.md`):

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | logged out | visit `/admin`, `/portal` | 307 → `/login?next=…` |
| 2 | admin session | visit `/portal` | bounced to `/admin` |
| 3 | client session | visit `/admin` | bounced to `/portal` |
| 4 | admin session | visit `/login` | bounced to `/admin` |
| 5 | client session, active | visit `/portal` | dashboard renders, sidebar shows email |
| 6 | SQL: `update public.profiles set is_active=false where role='client';` | client reloads `/portal` | forced logout → `/login?reason=deactivated` + notice; session cookies cleared |
| 7 | restore `is_active=true` | client signs in again | works |
| 8 | any session | press Sign out | cookies cleared, `/login` renders signed-out |
| 9 | logged out | `curl -s -o /dev/null -D - -H "Origin: https://evil.example" -X POST http://localhost:3000/api/auth/logout` | `403` |
| 10 | RLS (SQL editor, anon key context) | `select * from public.profiles;` | 0 rows (anon denied) |

RLS cross-client check in SQL editor:

```sql
-- impersonate client A reading client B's row through the API path:
-- set local role authenticated; set local request.jwt.claims to A's JWT payload;
select * from public.profiles;  -- expect ONLY A's row
```

- [ ] **Step 5: Finish docs + phase close-out**

Fill `docs/auth/README.md` probe matrix with actual results. Then final loop:

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Confirm zero secrets in diffs (`git diff main --stat` review + spot-grep for key prefixes `sb_`). Summarize the branch diff for user review. PR/merge only on explicit confirmation — Vercel auto-deploys.

- [ ] **Step 6: Commit**

```bash
git add components/panel "app/(admin)" "app/(client)" "app/(auth)/login" docs/auth/README.md
git commit -m "feat(auth): add admin and client panel shells with defense-in-depth checks"
```

---

## Spec coverage map (for reviewer)

| Spec item (§8 P3a + §2 contract) | Task |
|---|---|
| `middleware.ts` session refresh via `getClaims()` early | Task 3 (as `proxy.ts`, approved delta) |
| Matcher: admin/portal/login/reset/invite | Task 3 |
| Unauth → `/login?next=`; wrong role → own panel; inactive → forced logout | Tasks 3, 6 (notice), 7 (probe 6) |
| `profiles` table + dual roles + `is_admin()` + RLS summary row | Task 1 |
| Admin bootstrap | Tasks 1 (trigger), 4 (script) |
| login / reset-password / invite-accept pages | Tasks 5, 6 |
| Empty `(admin)` + `(client)` shells | Task 7 |
| Defense-in-depth (layouts re-verify; RLS real boundary) | Tasks 3, 7 + Task 1 policies |
| Verification loop + docs under `docs/<feature>/` | Tasks 4, 7 |
