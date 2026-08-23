# Phase 1 — Supabase Leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Forms leads sink with Supabase Postgres (`leads` table), server-generated ticket refs, DB-backed rate limiting, and a `LEADS_SINK` dual-write cutover flag.

**Architecture:** `/api/contact` keeps its same-origin + Turnstile front door unchanged; behind it a feature flag routes validated submissions to Google Forms (`forms`), Supabase (`supabase`), or both (`both`). All Supabase writes go through a service-role admin client in server-only modules. RLS is enabled with zero policies on `leads`/`rate_limits` — only the service role can touch them. Rate limiting moves from per-instance memory to an atomic Postgres function `consume_rate_limit()` keyed by salted IP hash, plus a Turnstile-token reuse guard.

**Tech Stack:** Next.js 16 App Router route handler · `@supabase/supabase-js` v2 · Postgres (enum, sequence, plpgsql RPC) · existing Turnstile flow untouched.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§3 data model, §8 phase 1) and `docs/plan/next-stage-plan.md` (Phase 1 items 12–15).

## Global Constraints

- TypeScript strict must stay clean: `npx tsc --noEmit`.
- Repo verification loop (no test framework installed by design — approved plan defers Vitest): `npm run lint` → `npx tsc --noEmit` → `npm run build` → curl probes against `npm run dev`.
- Supabase keys are the NEW formats only: `sb_publishable_…` / `sb_secret_…`. Never legacy anon JWTs.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `LEAD_IP_HASH_SALT`) never appear in client bundles, logs, or commits.
- Contact API degrades gracefully: missing Supabase env + sink≠`forms` → fall back to Google Forms path with console error.
- One branch for this phase: `feat/supabase-leads`. Commits per task. No push/merge without explicit user confirmation.
- Never log PII values (name/email/whatsapp); log at most presence/shape.
- Existing behaviors preserved exactly in `forms` mode: same-origin check, 429 wording, Turnstile errors, Google status verification.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0001_leads_and_rate_limits.sql` | Schema: enum, sequence, `leads`, `rate_limits`, RLS, atomic rate-limit RPC |
| `lib/supabase/admin.ts` | Lazy singleton service-role client factory (server-only) |
| `lib/contact/lead-schema.ts` | Pure functions: parse FormData → typed lead, validate, hash IP/token |
| `lib/contact/lead-store.ts` | Insert lead via admin client; return `ticketRef` |
| `app/api/contact/route.ts` | Modified: flag-based sink dispatch, DB rate limiting |
| `components/enhanced-contact-form.tsx` | Modified: display server-returned `ticketRef` |
| `.env.example` | Add `LEADS_SINK`, `LEAD_IP_HASH_SALT` (+ Supabase vars already present) |
| `docs/contact/README.md`, `app/privacy/page.tsx` | Data-flow + retention copy updates |

---

### Task 1: Migration — leads & rate limits schema

**Files:**
- Create: `supabase/migrations/0001_leads_and_rate_limits.sql`

**Interfaces:**
- Produces: tables `public.leads`, `public.rate_limits`; sequence `entity_number_seq`; callable RPC `consume_rate_limit(kind text, key_hash text, window_seconds int, max_count int) → boolean`.

- [ ] **Step 1: Write the migration**

```sql
-- 0001_leads_and_rate_limits.sql
create extension if not exists pgcrypto;

create sequence entity_number_seq start 1000;

create type lead_status as enum ('new', 'contacted', 'won', 'lost');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  ticket_number int not null default nextval('entity_number_seq'),
  name text not null,
  email text not null,
  country text,
  whatsapp_e164 text,
  preferred_contact_method text,
  timezone text,
  preferred_contact_date date,
  best_time_to_contact text,
  services jsonb not null default '[]'::jsonb,
  company text,
  project_url text,
  project_summary text not null,
  nda_required boolean not null default false,
  urgency text,
  budget_min int,
  budget_max int,
  how_found text,
  source_page text,
  device_type text,
  user_agent text,
  ip_hash text,
  consent_at timestamptz not null,
  status lead_status not null default 'new',
  email_verified_at timestamptz,
  marketing_opt_in boolean,
  converted_client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_email_idx on public.leads (email);
create index leads_status_idx on public.leads (status);
create index leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
-- Intentionally no policies: service role bypasses RLS; anon/authenticated denied.

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'turnstile')),
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  count int not null default 0,
  unique (kind, key_hash)
);

alter table public.rate_limits enable row level security;
-- Same policy stance as leads.

create or replace function public.consume_rate_limit(
  p_kind text,
  p_key_hash text,
  p_window_seconds int,
  p_max_count int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  delete from public.rate_limits where window_started_at < v_now - interval '7 days';

  insert into public.rate_limits (kind, key_hash, window_started_at, count)
  values (p_kind, p_key_hash, v_now, 1)
  on conflict (kind, key_hash) do update
    set window_started_at = v_now, count = 1
    where public.rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
  returning * into v_row;

  if v_row is not null then
    return true;
  end if;

  update public.rate_limits
    set count = count + 1
    where kind = p_kind
      and key_hash = p_key_hash
      and window_started_at > v_now - make_interval(secs => p_window_seconds)
      and count < p_max_count
    returning * into v_row;

  return v_row is not null;
end;
$$;
```

- [ ] **Step 2: Apply it**

Run: `npx supabase link --project-ref <ref>` once, then `npx supabase db push`
(If Supabase CLI is not linked yet because the user's keys aren't in `.env.local` yet, stop after writing the file and note the pending push — Tasks 2–4 still compile.)

- [ ] **Step 3: Verify in SQL editor**

Run: `select public.consume_rate_limit('ip', 'testhash', 3600, 2);` twice → `true`, third time → `false`. Then `delete from public.rate_limits where key_hash='testhash';`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_leads_and_rate_limits.sql
git commit -m "feat(leads): add leads and rate_limits schema with atomic rate-limit RPC"
```

---

### Task 2: Service-role admin client

**Files:**
- Create: `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `getSupabaseAdmin(): SupabaseClient` — lazy singleton, no session persistence. Throws descriptive Error when env missing.

- [ ] **Step 1: Install dependency**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: Create the module**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase admin credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/supabase/admin.ts
git commit -m "feat(leads): add server-only supabase service-role client factory"
```

---

### Task 3: Lead normalization, validation & storage

**Files:**
- Create: `lib/contact/lead-schema.ts`
- Create: `lib/contact/lead-store.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` from Task 2; `parsePhoneNumberFromString` from `libphonenumber-js` (already a repo dep).
- Produces:
  - `type NormalizedLead` (fields mirroring migration columns)
  - `parseLeadPayload(formData: FormData, meta: { ipHash: string; userAgent: string | null }): { ok: true; lead: NormalizedLead } | { ok: false; error: string }`
  - `sha256Hex(input: string): Promise<string>`
  - `insertLead(lead: NormalizedLead): Promise<{ ok: true; ticketRef: string } | { ok: false; error: string }>`

- [ ] **Step 1: Create `lib/contact/lead-schema.ts`**

```typescript
import { createHash } from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface NormalizedLead {
  name: string;
  email: string;
  country: string | null;
  whatsapp_e164: string | null;
  preferred_contact_method: string | null;
  timezone: string | null;
  preferred_contact_date: string | null;
  best_time_to_contact: string | null;
  services: string[];
  company: string | null;
  project_url: string | null;
  project_summary: string;
  nda_required: boolean;
  urgency: string | null;
  budget_min: number | null;
  budget_max: number | null;
  how_found: string | null;
  source_page: string | null;
  device_type: string | null;
  user_agent: string | null;
  ip_hash: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SUMMARY = 5000;
const MAX_BUDGET = 10_000_000;

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function nullable(str_: string, max = 500): string | null {
  const trimmed = str_.slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

export async function sha256Hex(input: string): Promise<string> {
  return createHash('sha256').update(input).digest('hex');
}

export function parseLeadPayload(
  formData: FormData,
  meta: { ipHash: string; userAgent: string | null }
): { ok: true; lead: NormalizedLead } | { ok: false; error: string } {
  const name = nullable(str(formData, 'name'), 200);
  const emailRaw = str(formData, 'email').toLowerCase();
  const summary = str(formData, 'projectSummary');

  if (!name || !EMAIL_RE.test(emailRaw) || !summary) {
    return { ok: false, error: 'Missing or invalid required fields.' };
  }
  if (summary.length > MAX_SUMMARY) {
    return { ok: false, error: 'Project summary is too long.' };
  }

  let whatsappE164: string | null = null;
  const whatsappRaw = str(formData, 'whatsAppNumber'); // client sends combined "+880…"
  if (whatsappRaw.length > 0) {
    const parsed = parsePhoneNumberFromString(whatsappRaw);
    if (!parsed) return { ok: false, error: 'Invalid WhatsApp number.' };
    whatsappE164 = parsed.number;
  }

  const budgetMin = Number.parseInt(str(formData, 'budgetMin'), 10);
  const budgetMax = Number.parseInt(str(formData, 'budgetMax'), 10);

  // Client merges "Other" into a comma-joined string; store as one-element array
  const serviceType = str(formData, 'serviceType');
  const services: string[] = serviceType ? [serviceType] : [];

  const contactDate = str(formData, 'preferredContactDate');

  return {
    ok: true,
    lead: {
      name,
      email: emailRaw,
      country: nullable(str(formData, 'country')),
      whatsapp_e164: whatsappE164,
      preferred_contact_method: nullable(str(formData, 'preferredContactMethod')),
      timezone: nullable(str(formData, 'timeZone')),
      preferred_contact_date: contactDate ? new Date(contactDate).toISOString().slice(0, 10) : null,
      best_time_to_contact: nullable(str(formData, 'bestTimeToContact')),
      services,
      company: nullable(str(formData, 'company')),
      project_url: nullable(str(formData, 'projectUrlOrFiles')),
      project_summary: summary,
      nda_required: str(formData, 'ndaConfidentiality').toLowerCase() === 'yes',
      urgency: nullable(str(formData, 'urgency')),
      budget_min: Number.isFinite(budgetMin) ? Math.min(Math.max(budgetMin, 0), MAX_BUDGET) : null,
      budget_max: Number.isFinite(budgetMax) ? Math.min(Math.max(budgetMax, 0), MAX_BUDGET) : null,
      how_found: nullable(str(formData, 'howDidYouFindMe'), 300),
      source_page: nullable(str(formData, 'sourcePage'), 300),
      device_type: nullable(str(formData, 'deviceType')),
      user_agent: meta.userAgent?.slice(0, 400) ?? null,
      ip_hash: meta.ipHash,
    },
  };
}
```

- [ ] **Step 2: Create `lib/contact/lead-store.ts`**

```typescript
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { NormalizedLead } from '@/lib/contact/lead-schema';

export async function insertLead(
  lead: NormalizedLead
): Promise<{ ok: true; ticketRef: string } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from('leads')
    .insert(lead)
    .select('ticket_number')
    .single();

  if (error || !data) {
    // Log shape, never PII values
    console.error('Lead insert failed:', error?.message ?? 'no row returned');
    return { ok: false, error: 'Could not save your message.' };
  }

  return { ok: true, ticketRef: `TKT-${data.ticket_number}` };
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/contact/lead-schema.ts lib/contact/lead-store.ts
git commit -m "feat(leads): add lead normalization, validation and supabase store"
```

---

### Task 4: Rewire `/api/contact` behind `LEADS_SINK` flag

**Files:**
- Modify: `app/api/contact/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `parseLeadPayload`, `sha256Hex` (Task 3), `getSupabaseAdmin` indirectly via `insertLead`; `admin.rpc('consume_rate_limit', …)`.
- Produces: POST `/api/contact` responses gain `{ ticketRef?: string }` on success when sink includes Supabase.

- [ ] **Step 1: Add env entries to `.env.example`** (append under Site section)

```bash
# ==============================================
# Leads pipeline (Phase 1)
# ==============================================
# Where contact-form leads are written: forms | supabase | both
LEADS_SINK=forms

# Salt used to hash submitter IPs before storage (never store raw IPs)
LEAD_IP_HASH_SALT=your_long_random_salt_here
```

- [ ] **Step 2: Replace the rate-limit block and forwarding section in `app/api/contact/route.ts`**

Delete the entire "Interim in-memory rate limiting" section (`RATE_LIMIT_*` consts, `rateLimitMap`, `checkRateLimit`) and replace with:

```typescript
// ==============================================
// Rate limiting (Supabase-backed, atomic)
// Falls back to per-instance memory when Supabase is unconfigured.
// ==============================================

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 5;
const TURNSTILE_REUSE_WINDOW_SECONDS = 5 * 60;

const memoryRateMap = new Map<string, number[]>();

function checkMemoryRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const stamps = (memoryRateMap.get(clientIp) ?? []).filter(
    (t) => t > now - RATE_LIMIT_WINDOW_SECONDS * 1000
  );
  if (stamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    memoryRateMap.set(clientIp, stamps);
    return false;
  }
  stamps.push(now);
  memoryRateMap.set(clientIp, stamps);
  return true;
}

async function consumeDbRateLimit(
  kind: 'ip' | 'turnstile',
  keyHash: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean | null> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
      p_kind: kind,
      p_key_hash: keyHash,
      p_window_seconds: windowSeconds,
      p_max_count: maxCount,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.error('DB rate limit unavailable:', err instanceof Error ? err.message : err);
    return null; // signals fallback
  }
}
```

Then restructure `POST` after the Turnstile block (replace everything from "// Turnstile validation successful" through end of the Google Forms try/catch) with:

```typescript
    // ---- Rate limiting ----
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (!checkMemoryRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const ipSalt = process.env.LEAD_IP_HASH_SALT ?? '';
    const ipHash = ipSalt ? await sha256Hex(ipSalt + clientIp) : null;

    if (ipHash) {
      const allowed = await consumeDbRateLimit('ip', ipHash, RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_MAX_REQUESTS);
      if (allowed === false) {
        return NextResponse.json(
          { error: 'Too many submissions. Please try again later.' },
          { status: 429 }
        );
      }
    }

    // Turnstile token single-use guard (tokens live ~5 minutes)
    if (typeof turnstileToken === 'string' && ipSalt) {
      const tokenHash = await sha256Hex(turnstileToken);
      const unused = await consumeDbRateLimit('turnstile', tokenHash, TURNSTILE_REUSE_WINDOW_SECONDS, 1);
      if (unused === false) {
        return NextResponse.json({ error: 'Verification token already used. Please reload the form.' }, { status: 400 });
      }
    }

    // ---- Sink dispatch ----
    const sink = (process.env.LEADS_SINK ?? 'forms').toLowerCase();

    if ((sink === 'supabase' || sink === 'both') && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const parsed = parseLeadPayload(formData, {
        ipHash: ipHash ?? '',
        userAgent: request.headers.get('user-agent'),
      });
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      const stored = await insertLead(parsed.lead);
      if (!stored.ok) {
        return NextResponse.json(
          { error: 'We could not process your message right now. Please try again or email us directly.' },
          { status: 502 }
        );
      }

      if (sink === 'both' && process.env.GOOGLE_FORM_ACTION_URL) {
        formData.delete('cf-turnstile-response');
        formData.set('entry.233094040', stored.ticketRef); // server ref wins in Forms too
        void forwardToGoogleForms(formData).catch((err) =>
          console.error('Dual-write to Google Forms failed:', err instanceof Error ? err.message : err)
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Your message has been sent successfully!',
        ticketRef: stored.ticketRef,
      });
    }

    if (sink === 'supabase') {
      console.error('LEADS_SINK=supabase but Supabase env missing; falling back to forms.');
    }

    // ---- Legacy Google Forms sink (unchanged behavior) ----
    const googleFormUrl = process.env.GOOGLE_FORM_ACTION_URL;
    if (!googleFormUrl) {
      console.error('GOOGLE_FORM_ACTION_URL is not configured');
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    formData.delete('cf-turnstile-response');
    const forwarded = new URLSearchParams();
    formData.forEach((value, key) => {
      if (key.startsWith('entry.')) forwarded.append(key, value.toString());
    });

    const googleFormsController = new AbortController();
    const googleFormsTimeoutId = setTimeout(() => googleFormsController.abort(), 15000);
    try {
      const googleResponse = await fetch(googleFormUrl, {
        method: 'POST',
        body: forwarded,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: googleFormsController.signal,
      });
      clearTimeout(googleFormsTimeoutId);

      if (!googleResponse.ok) {
        console.error('Google Forms rejected the submission:', { status: googleResponse.status });
        return NextResponse.json(
          { error: 'We could not process your message right now. Please try again or email us directly.' },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, message: 'Your message has been sent successfully!' });
    } catch (error) {
      clearTimeout(googleFormsTimeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: 'Form submission timeout. Please try again.' }, { status: 408 });
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Contact form submission error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'An error occurred while processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

async function forwardToGoogleForms(formData: FormData): Promise<void> {
  const url = process.env.GOOGLE_FORM_ACTION_URL;
  if (!url) throw new Error('GOOGLE_FORM_ACTION_URL missing');
  const body = new URLSearchParams();
  formData.forEach((value, key) => {
    if (key.startsWith('entry.')) body.append(key, value.toString());
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Also update imports at top of file:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex, parseLeadPayload } from '@/lib/contact/lead-schema';
import { insertLead } from '@/lib/contact/lead-store';
```

Note: the original early rate-limit call inside POST (lines using `checkRateLimit`) is removed — limiting now happens post-Turnstile as shown above; keep the same-origin block untouched at the very top of POST.

- [ ] **Step 3: Lint + typecheck + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 4: Runtime probes (requires `.env.local` filled by user)**

With `LEADS_SINK=forms`: submit via dev site → Google Forms receives, response has no `ticketRef`.
Switch `LEADS_SINK=supabase`: submit → response contains `ticketRef` like `"TKT-1000"`; row visible in Supabase Table Editor; replaying the exact same Turnstile token via curl → 400 "already used"; 6th rapid submit from same IP → 429.

```bash
curl -s -X POST http://localhost:3000/api/contact \
  -H "Origin: http://localhost:3000" \
  -F "name=Probe" -F "email=probe@example.com" -F "projectSummary=probe" \
  -F "cf-turnstile-response=XXXX" | head -c 300
```

- [ ] **Step 5: Commit**

```bash
git add app/api/contact/route.ts .env.example
git commit -m "feat(leads): route contact submissions via LEADS_SINK flag with DB rate limiting"
```

---

> ⚠️ Field-mapping fact (verified at components/enhanced-contact-form.tsx:677-700): the browser posts **Google entry-ID keys** (`entry.1040615996`, …) plus `cf-turnstile-response` — NOT raw field names. Task 5 makes the client ALSO mirror every value under its raw name so the Supabase parser stays decoupled from Google IDs; the Google-forward paths filter back down to `entry.*` keys so the upstream payload stays byte-compatible with today.

### Task 5: Client mirrors raw field names + displays server ticket ref

**Files:**
- Modify: `components/enhanced-contact-form.tsx:700-725` area

**Interfaces:**
- Produces: POST body contains each submission value twice — under its `entry.*` id (legacy sink) and under its raw name (Supabase parser).
- Consumes: `ticketRef` field on successful API response (Task 4).

- [ ] **Step 1: Mirror raw names into `formFields`** (insert right before the Turnstile append at line ~702)

```typescript
      // Raw-named mirrors for the Supabase sink (Google ignores unknown params,
      // and our forward paths strip non-entry.* keys anyway)
      formFields.append('name', submissionData.name);
      formFields.append('email', submissionData.email);
      formFields.append('country', submissionData.country);
      formFields.append('whatsAppNumber', submissionData.whatsAppNumber);
      formFields.append('preferredContactMethod', submissionData.preferredContactMethod);
      formFields.append('timeZone', submissionData.timeZone);
      formFields.append('preferredContactDate', submissionData.preferredContactDate);
      formFields.append('bestTimeToContact', submissionData.bestTimeToContact);
      formFields.append('serviceType', submissionData.serviceType);
      formFields.append('company', submissionData.company);
      formFields.append('projectUrlOrFiles', submissionData.projectUrlOrFiles);
      formFields.append('projectSummary', submissionData.projectSummary);
      formFields.append('ndaConfidentiality', submissionData.ndaConfidentiality);
      formFields.append('urgency', submissionData.urgency);
      formFields.append('budgetRange', submissionData.budgetRange);
      formFields.append('budgetMin', formData.budgetMin || '');
      formFields.append('budgetMax', formData.budgetMax || '');
      formFields.append('howDidYouFindMe', submissionData.howDidYouFindMe);
      formFields.append('ticketId', submissionData.ticketId);
      formFields.append('sourcePage', submissionData.sourcePage);
      formFields.append('userAgent', submissionData.userAgent);
      formFields.append('deviceType', submissionData.deviceType);
```

- [ ] **Step 2: After `const result = await response.json();` insert**

```typescript
      // Prefer the server-generated ticket reference over the local placeholder
      if (typeof result.ticketRef === 'string' && result.ticketRef.length > 0) {
        setSubmittedTicketId(result.ticketRef);
      }
```

(Keep the earlier local `generateTicketId()` call — it remains the optimistic display value for the legacy `forms` sink; the server value overwrites it when present.)

- [ ] **Step 3: Verify**

Run: `npm run lint && npx tsc --noEmit && npm run build` then manual submit with `LEADS_SINK=supabase` → success card shows `TKT-####` matching the DB row.

- [ ] **Step 4: Commit**

```bash
git add components/enhanced-contact-form.tsx
git commit -m "feat(leads): mirror raw field names and display server-issued ticket ref"
```

---

### Task 6: Docs & privacy copy

**Files:**
- Modify: `docs/contact/README.md` (add "Phase 1: Supabase sink" section describing `LEADS_SINK`, new columns, `consume_rate_limit`, dual-write semantics)
- Modify: `app/privacy/page.tsx` (data-flow table row for contact submissions: processor becomes "Supabase Postgres (EU region)" per actual region; retention section gains: lead records deleted after 24 months of inactivity, IP hashes are salted one-way hashes, raw IPs never stored)

- [ ] **Step 1: Update both files** with the copy above (keep existing tone/format of each file).

- [ ] **Step 2: Verify build + commit**

```bash
npm run build
git add docs/contact/README.md app/privacy/page.tsx
git commit -m "docs(contact): document supabase leads sink and retention policy"
```

---

### Task 7: Phase close-out

- [ ] Run full loop: `npm run lint && npx tsc --noEmit && npm run build`
- [ ] Playwright/manual walkthrough: happy path, replay guard, 429 path, cross-origin rejection (curl without Origin header → 403)
- [ ] Confirm no PII in any console output during probes
- [ ] Summarize diff for user review; PR only on explicit confirmation (Vercel deploys on merge)
