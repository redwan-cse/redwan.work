# Phase 2 — R2 Foundation (Contact Attachments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contact-form submitters can attach up to 5 files (≤10 MB each, allowlisted types) that upload browser-direct to the R2 private bucket via presigned URLs, are stored as metadata on the lead, and are auto-deleted by a daily cron after 90 days unless an admin flagged them `retained`.

**Architecture:** `lib/r2.ts` (server-only) wraps `@aws-sdk/client-s3` + `s3-request-presigner` against `R2_ENDPOINT` with per-bucket keys. `POST /api/uploads/presign` (same-origin + Turnstile + dedicated `'presign-ip'` rate budget + token replay guard) mints 10-minute PUT URLs; the browser PUTs directly to R2. The single Turnstile widget re-executes (`reset()` + promise-wrapped fresh-token helper) once for presign and again for submit, because the replay guard consumes each token. `/api/contact` validates and stores the attachment metadata as `leads.attachments` jsonb. `GET /api/cron/r2-retention` (Vercel Cron, `CRON_SECRET` bearer) deletes private objects older than 90 days except keys flagged `retained: true` in any lead.

**Tech Stack:** Next.js 16 route handlers + existing contact pipeline · `@aws-sdk/client-s3@^3` + `@aws-sdk/s3-request-presigner@^3` (new deps) · Turnstile managed widget re-execution · Postgres jsonb + CHECK extension · Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§4 R2 storage design, §8 P2) + `docs/plan/next-stage-plan.md` items 16–18. Rulings approved 2026-08-25: 90-day retention with admin `retained` escape hatch (SQL runbook now, UI later); anonymous key scheme `contact/{ulid}/{ulid}.{ext}` (no user_id pre-portal); attachments metadata as jsonb on `leads` (spec's `files` table stays portal-centric, P4a); public-bucket CDN domain deferred to P5 (`NEXT_PUBLIC_R2_PUBLIC_BASE_URL` stays empty); presign gets its own `'presign-ip'` rate budget so uploads never eat the submission budget.

## Global Constraints

- Gate per task: `npm run lint && npx tsc --noEmit && npm run build` all green.
- One branch: `feat/r2-attachments`. Commits per task. No push/merge to main without explicit user confirmation.
- `.env.example` change limited to adding `CRON_SECRET` (with comment). `R2_*` vars already mirrored there — no renames.
- Secrets (`R2_PRIVATE_*`, `TURNSTILE_SECRET_KEY`, `CRON_SECRET`, `SUPABASE_SECRET_KEY`) never printed/logged/committed. Probe tokens/values never enter reports.
- Untouched: `lib/blogger.ts`, `(auth)` pages, `proxy.ts`, logout route, ALL admin + portal surfaces (`app/(admin)/**`, `app/(client)/**`, `lib/crm/**`).
- Contact pipeline invariants preserved exactly: same-origin 403, Turnstile 400 wording, 429 wording, replay-guard behavior, server `TKT-<n>` response, raw-name parsing. Attachments are strictly ADDITIVE — a submission without attachments must behave byte-identically to today.
- SQL LSP false positives on migrations — trust `npx supabase db push`.
- Dev server: `pkill -f '[n]ext dev'`; probes localhost only. Local positive E2E uses Turnstile's OFFICIAL test pair (sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`) via env override on the dev process only — real keys stay in `.env.local` untouched.
- Residual risk accepted by owner (documented in docs/r2): presigned PUTs cannot enforce content-length — mitigated by key-scoping, 10-min expiry, `'presign-ip'` rate budget, and 90-day cron.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0005_lead_attachments.sql` | `leads.attachments` jsonb + `rate_limits.kind` CHECK gains `'presign-ip'` |
| `lib/r2.ts` | server-only R2 clients + presign/delete/list/validation helpers + pure `staleObjectKeys()` |
| `app/api/uploads/presign/route.ts` | POST: same-origin, Turnstile, budgets, batch presign |
| `lib/contact/lead-schema.ts` (modify) | `LeadAttachment` type + `attachments` parsing/validation in `parseLeadPayload` |
| `app/api/contact/route.ts` (modify) | attachments flow through to insert (additive) |
| `components/enhanced-contact-form.tsx` (modify) | file input, presign+upload flow, fresh-token submit, attachments field |
| `app/api/cron/r2-retention/route.ts` | GET: CRON_SECRET bearer, retained-skip, 90-day purge |
| `vercel.json` | daily cron schedule |
| `next.config.js` (modify) | CSP `connect-src` += R2 endpoint origin |
| `.env.example` (modify) | `CRON_SECRET` |
| `docs/r2/README.md` | flows, limits, runbook, retained-flag SQL, cron setup |
| `docs/contact/README.md`, `app/privacy/page.tsx` (modify) | attachment copy |

---

### Task 1: Foundation — deps, lib/r2.ts, migration 0005, env/CSP

**Files:**
- Create: `lib/r2.ts`
- Create: `supabase/migrations/0005_lead_attachments.sql`
- Modify: `next.config.js` (CSP), `.env.example` (CRON_SECRET)

**Interfaces:**
- Produces (`lib/r2.ts`, all server-only):
  - `export const CONTACT_MAX_FILES = 5; export const CONTACT_MAX_SIZE_BYTES = 10 * 1024 * 1024; export const CONTACT_RETENTION_DAYS = 90;`
  - `export const CONTACT_ALLOWED_EXT = ['pdf','docx','doc','xlsx','png','jpg','zip'] as const;`
  - `export function isR2Configured(): boolean`
  - `export function validateContactFile(f: { filename: string; mime: string; size: number }): { ok: true; ext: string } | { ok: false; error: string }`
  - `export function isValidContactKey(key: string): boolean` — `^contact/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$`
  - `export async function presignContactUpload(filename: string, mime: string, size: number): Promise<{ key: string; uploadUrl: string }>` — 600s PUT, `ContentType: mime`
  - `export async function deletePrivateObjects(keys: string[]): Promise<number>` — chunked `DeleteObjects`
  - `export interface R2ObjectSummary { key: string; lastModified: Date; size: number }`
  - `export async function listPrivateContactObjects(): Promise<R2ObjectSummary[]>` — paginated, prefix `contact/`
  - `export function staleObjectKeys(objects: R2ObjectSummary[], cutoff: Date, retainedKeys: Set<string>): string[]` — PURE
- Produces: `leads.attachments jsonb NOT NULL DEFAULT '[]'`; `rate_limits_kind_check` re-created with `('ip','turnstile','presign-ip')`.
- CSP: `connect-src` gains `R2_ENDPOINT` origin when set.

- [ ] **Step 1: Install deps**

Run: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

- [ ] **Step 2: Create `lib/r2.ts`**

```typescript
import 'server-only';
import { randomUUID } from 'crypto';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const CONTACT_RETENTION_DAYS = 90;
export const CONTACT_ALLOWED_EXT = ['pdf', 'docx', 'doc', 'xlsx', 'png', 'jpg', 'zip'] as const;

const KEY_RE = /^contact\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$/;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_PRIVATE_BUCKET &&
      process.env.R2_PRIVATE_ACCESS_KEY_ID &&
      process.env.R2_PRIVATE_SECRET_ACCESS_KEY
  );
}

function privateClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 private credentials missing: set R2_ENDPOINT, R2_PRIVATE_BUCKET, R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY'
    );
  }
  return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
}

export function validateContactFile(
  f: { filename: string; mime: string; size: number }
): { ok: true; ext: string } | { ok: false; error: string } {
  const parts = f.filename.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  if (!CONTACT_ALLOWED_EXT.includes(ext as (typeof CONTACT_ALLOWED_EXT)[number])) {
    return { ok: false, error: `File type .${ext || '?'} is not allowed.` };
  }
  if (!Number.isFinite(f.size) || f.size < 1 || f.size > CONTACT_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Files must be between 1 byte and 10 MB.' };
  }
  return { ok: true, ext };
}

export function isValidContactKey(key: string): boolean {
  return KEY_RE.test(key);
}

export async function presignContactUpload(
  filename: string,
  mime: string,
  size: number
): Promise<{ key: string; uploadUrl: string }> {
  const check = validateContactFile({ filename, mime, size });
  if (!check.ok) throw new Error(check.error);

  const key = `contact/${randomUUID()}/${randomUUID()}.${check.ext}`;
  const client = privateClient();
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: mime,
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { key, uploadUrl };
}

export async function deletePrivateObjects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const client = privateClient();
  const bucket = process.env.R2_PRIVATE_BUCKET;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk } })
    );
    deleted += res.Deleted?.length ?? 0;
  }
  return deleted;
}

export interface R2ObjectSummary {
  key: string;
  lastModified: Date;
  size: number;
}

export async function listPrivateContactObjects(): Promise<R2ObjectSummary[]> {
  const client = privateClient();
  const bucket = process.env.R2_PRIVATE_BUCKET;
  const out: R2ObjectSummary[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: 'contact/', ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.LastModified) {
        out.push({ key: obj.Key, lastModified: obj.LastModified, size: obj.Size ?? 0 });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export function staleObjectKeys(
  objects: R2ObjectSummary[],
  cutoff: Date,
  retainedKeys: Set<string>
): string[] {
  return objects
    .filter((o) => o.lastModified < cutoff && !retainedKeys.has(o.key))
    .map((o) => o.key);
}
```

- [ ] **Step 3: Create migration `0005_lead_attachments.sql`**

```sql
-- 0005_lead_attachments.sql
alter table public.leads
  add column attachments jsonb not null default '[]'::jsonb;

-- Presign requests get their own IP budget so uploads never consume the
-- submission budget (both kinds are consumed server-side only).
alter table public.rate_limits drop constraint rate_limits_kind_check;
alter table public.rate_limits add constraint rate_limits_kind_check
  check (kind in ('ip', 'turnstile', 'presign-ip'));
```

Run: `npx supabase db push`; verify `npx supabase migration list` shows 0005 both sides. SQL-editor checks (record expected outputs for owner): `select attachments from public.leads limit 1;` → `[]`; `select public.consume_rate_limit('presign-ip', 'probe', 3600, 1);` → true then false; cleanup `delete from public.rate_limits where key_hash='probe';`

- [ ] **Step 4: CSP + env example**

In `next.config.js`, above `const csp`, add:

```javascript
const r2Origin = (() => {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
})();
```

and change the connect-src line to:

```javascript
  `connect-src 'self' https://challenges.cloudflare.com https://cqxtmzzlywolulechcob.supabase.co${r2Origin ? ` ${r2Origin}` : ''}`,
```

Append to `.env.example` R2 section:

```bash
# Bearer secret protecting GET /api/cron/r2-retention (Vercel Cron sends it)
CRON_SECRET=
```

- [ ] **Step 5: Gates + commit**

Run: `npm run lint && npx tsc --noEmit && npm run build` — green.

```bash
git add package.json package-lock.json lib/r2.ts supabase/migrations/0005_lead_attachments.sql next.config.js .env.example
git commit -m "feat(r2): add r2 helper module, lead attachments column and presign rate budget"
```

---

### Task 2: Presign endpoint

**Files:**
- Create: `app/api/uploads/presign/route.ts`

**Interfaces:**
- Consumes: `lib/r2.ts` helpers (Task 1), `sha256Hex` from `@/lib/contact/lead-schema`, the same-origin + Turnstile siteverify conventions from `app/api/contact/route.ts` (READ that file first and mirror exactly), `getSupabaseAdmin().rpc('consume_rate_limit', { p_kind, p_key_hash, p_window_seconds, p_max_count })` via a small local helper (do NOT modify the contact route).
- Produces: `POST /api/uploads/presign` — JSON `{ files: [{ filename, mime, size }], turnstileToken: string }`; `200 { uploads: [{ key, uploadUrl, filename }] }` | `403` origin | `400` validation/Turnstile/replay (wording mirrors contact) | `429` presign-ip budget | `503` R2 unconfigured or DB unavailable.

**Behavior contract (normative, in order):**
1. Same-origin check first (mirror contact route incl. allowed set with `https://redwan.work`).
2. `isR2Configured()` false → `503 { error: 'Attachments are temporarily unavailable. You can still submit the form without files.' }`.
3. Body: `files` 1..`CONTACT_MAX_FILES` each through `validateContactFile`; `turnstileToken` non-empty → else `400`.
4. Client IP (cf-connecting-ip → x-forwarded-for first hop → x-real-ip → 'unknown'); salted hash; `consume_rate_limit('presign-ip', hash, 3600, 20)` → false → `429 { error: 'Too many upload requests. Please try again later.' }`; RPC error or missing salt → `503` (fail-closed; do NOT copy contact's memory fallback).
5. Turnstile siteverify (`TURNSTILE_SECRET_KEY` + remoteip) fail → `400 { error: 'Security verification failed. Please reload the form.' }`; then `consume_rate_limit('turnstile', sha256Hex(token), 300, 1)` false → `400 { error: 'Verification token already used. Please reload the form.' }`.
6. All files `presignContactUpload` → `200`.

- [ ] **Step 1: Write the route** mirroring contact-route conventions.
- [ ] **Step 2: Gates** — `npm run lint && npx tsc --noEmit && npm run build` green.
- [ ] **Step 3: Negative probes (dev server, real keys)**

```bash
# a) no Origin → 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/uploads/presign -H 'Content-Type: application/json' -d '{"files":[],"turnstileToken":"x"}'
# b) empty files → 400
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3000/api/uploads/presign -H "Origin: http://localhost:3000" -H 'Content-Type: application/json' -d '{"files":[],"turnstileToken":"x"}'
# c) disallowed ext → 400
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3000/api/uploads/presign -H "Origin: http://localhost:3000" -H 'Content-Type: application/json' -d '{"files":[{"filename":"a.exe","mime":"application/x-msdownload","size":10}],"turnstileToken":"x"}'
# d) fake token → 400 Turnstile wording (real siteverify rejects)
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3000/api/uploads/presign -H "Origin: http://localhost:3000" -H 'Content-Type: application/json' -d '{"files":[{"filename":"a.pdf","mime":"application/pdf","size":10}],"turnstileToken":"fake"}'
```

- [ ] **Step 4: Positive E2E (Turnstile TEST secret, env override on dev process only)**

Kill dev server; start `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npm run dev` (official always-pass secret). Then:

```bash
RES=$(curl -s -X POST http://localhost:3000/api/uploads/presign -H "Origin: http://localhost:3000" -H 'Content-Type: application/json' -d '{"files":[{"filename":"probe.pdf","mime":"application/pdf","size":10240}],"turnstileToken":"test-token"}')
echo "$RES" | head -c 400
URL=$(echo "$RES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).uploads[0].uploadUrl))")
head -c 10240 /dev/urandom > /tmp/opencode/probe.pdf
curl -s -o /dev/null -w 'PUT %{http_code}\n' -X PUT "$URL" -H 'Content-Type: application/pdf' --data-binary @/tmp/opencode/probe.pdf
```

Expected: 200 with key matching `contact/…/….pdf`; PUT 200. Verify via one-off node eval (`listPrivateContactObjects()` contains key) then `deletePrivateObjects([key])`. Replay: same presign call with SAME token → 400 'Verification token already used.'

- [ ] **Step 5: Kill dev server, commit**

```bash
git add app/api/uploads/presign/route.ts
git commit -m "feat(r2): add turnstile-gated presign endpoint for contact attachments"
```

---

### Task 3: Contact pipeline — parse, store, and collect attachments

**Files:**
- Modify: `lib/contact/lead-schema.ts`
- Modify: `app/api/contact/route.ts`
- Modify: `components/enhanced-contact-form.tsx`

**Interfaces:**
- Consumes: Task 1 `lib/r2.ts` exports (`CONTACT_MAX_FILES`, `CONTACT_MAX_SIZE_BYTES`, `validateContactFile`, `isValidContactKey`); existing `parseLeadPayload`/`NormalizedLead`/`insertLead`; the form's existing Turnstile widget lifecycle (READ the whole component first).
- Produces:
  - `lib/contact/lead-schema.ts`: `export interface LeadAttachment { key: string; filename: string; mime: string; size_bytes: number; retained?: boolean }`; `NormalizedLead` gains `attachments: LeadAttachment[]`; `parseLeadPayload` reads raw form field `attachments` (JSON string; absent/empty → `[]`) and validates: JSON.parse, array ≤ `CONTACT_MAX_FILES`, each object with string key passing `isValidContactKey`, non-empty filename ≤255, string mime ≤128, integer `size_bytes` 1..`CONTACT_MAX_SIZE_BYTES`, optional `retained === true`; violations → `{ ok: false, error: 'Attachment data is invalid. Please re-attach your files.' }`.
  - `app/api/contact/route.ts`: NO behavioral change — `parseLeadPayload` handles the new field; `insertLead` persists it (column exists). Verify insert path includes the new key (lead-store spreads NormalizedLead).
  - `components/enhanced-contact-form.tsx`: attachments state + upload flow + fresh-token submit (contracts below).

**Form contracts (normative — read the component first, mirror its conventions):**
1. State: `attachedFiles: { key: string; filename: string; mime: string; size_bytes: number }[]`, `uploading: boolean`, `uploadError: string | null`.
2. `getFreshTurnstileToken(): Promise<string>` helper — `window.turnstile.reset(widgetId?)`, then poll the existing token state/callback result every 250 ms until a NEW token arrives or 15 s timeout → reject `'Security verification timed out. Please try again.'`. (The widget is managed/auto — reset re-runs it and the existing callback stores the token; the helper resolves with it.)
3. File input (multiple, `accept=".pdf,.docx,.doc,.xlsx,.png,.jpg,.zip"`, placed near the project-summary field, labeled "Attach files (optional, up to 5, max 10 MB each)"): on selection — client-side count/ext/size pre-validation against the same limits; then `uploading=true`; `getFreshTurnstileToken()` → `POST /api/uploads/presign` `{files:[...], turnstileToken}` → for each returned upload: `fetch(uploadUrl, { method:'PUT', body: file, headers:{'Content-Type': mime} })` non-2xx → abort with `uploadError`; success → append `{key, filename, mime, size_bytes}` to `attachedFiles`; `uploading=false`. Presign 503/429/4xx → surface its error message; form remains submittable without attachments.
4. Selected-files list UI: name + human size + remove button (removes from `attachedFiles` only — orphaned objects age out via cron).
5. Submit flow: before building `formFields`, `await getFreshTurnstileToken()` (presign consumed the earlier token) and use it as the `cf-turnstile-response` value; when `attachedFiles.length > 0` append `formFields.append('attachments', JSON.stringify(attachedFiles))`. Existing error/success handling unchanged; on submission FAILURE after upload, keep attachments (retry-friendly).
6. A submission WITHOUT attachments must behave exactly as today (no extra token round-trip? NO — the fresh-token helper runs on EVERY submit since the widget token may be stale; this is the same single widget interaction as today from the user's perspective).

- [ ] **Step 1: Extend `lib/contact/lead-schema.ts`** per interfaces (imports from `@/lib/r2` — note lead-schema is currently import-pure; `@/lib/r2` is server-only which is fine since lead-schema is server-consumed only; keep constants imported, NOT re-declared).
- [ ] **Step 2: Verify `app/api/contact/route.ts` needs no logic change** — trace `parseLeadPayload` → `insertLead`; if lead-store spreads NormalizedLead the column flows through; adjust lead-store ONLY if it whitelists fields.
- [ ] **Step 3: Form changes** per contracts.
- [ ] **Step 4: Gates** — `npm run lint && npx tsc --noEmit && npm run build` green.
- [ ] **Step 5: Probes (test-secret dev server: `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npm run dev`)**

Playwright-core walkthrough (recipe from P3b/P3c reports):
1. Fill required fields, attach one small PDF → uploads succeed (network tab: presign 200, PUT 200) → submit → success card with `TKT-<n>`; REST-verify lead row: `attachments` jsonb has exactly 1 entry with matching key/filename/size.
2. Attach 2 files, remove 1 before submit → lead row has exactly the kept one.
3. Attach a .exe-named file → client-side rejection message, no presign call.
4. No-attachment submission → success, `attachments: []` in DB, flow identical to today.
5. Replay-guard sanity: the submit token differs from the presign token (server consumed both without 'already used' errors).
Cleanup: delete ALL created probe lead rows via service REST — no persistent fixtures this phase.

- [ ] **Step 6: Commit**

```bash
git add lib/contact/lead-schema.ts app/api/contact/route.ts components/enhanced-contact-form.tsx
git commit -m "feat(contact): attach files to leads via r2 presigned uploads"
```

---

### Task 4: Retention cron + docs close-out

**Files:**
- Create: `app/api/cron/r2-retention/route.ts`
- Create: `vercel.json`
- Create: `docs/r2/README.md`
- Modify: `docs/contact/README.md`, `app/privacy/page.tsx`

**Interfaces:**
- Consumes: `isR2Configured`, `CONTACT_RETENTION_DAYS`, `listPrivateContactObjects`, `staleObjectKeys`, `deletePrivateObjects` (Task 1); `getSupabaseAdmin()`.
- Produces: `GET /api/cron/r2-retention` — `Authorization: Bearer <CRON_SECRET>` (timing-safe compare via `crypto.timingSafeEqual`, mirror `/api/revalidate` pattern) else `401`; loads retained set (`select attachments from leads` filtered to entries with `retained === true` — jsonb containment `attachments @> '[{"retained":true}]'`), lists objects, `staleObjectKeys(objects, cutoff, retained)` with `cutoff = now - 90d`, `deletePrivateObjects(stale)` → `200 { deleted: n, examined: m }`. R2 unconfigured → `503`.
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/r2-retention", "schedule": "0 3 * * *" }] }`.

- [ ] **Step 1: Write the cron route** per interfaces (timing-safe auth mirrors `app/api/revalidate/route.ts` — read it first).
- [ ] **Step 2: Write `vercel.json`.**
- [ ] **Step 3: Gates + probes**

Gates green. Probes:
1. Auth: `curl` without bearer and with a wrong bearer → both `401` (timing-safe compare mirrors `app/api/revalidate/route.ts`).
2. Live run with real `CRON_SECRET` from `.env.local`: `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/r2-retention` → `200 {"deleted":0,"examined":N}` where N = current `contact/` object count (leftover Task 2 probe objects if any); second run idempotent.
3. Retained-skip + cutoff logic: verified by code review of `staleObjectKeys` (pure function) plus a synthetic retained lead row inserted via service REST — the live run must NOT attempt deletion of its key (no deletion request observable for a nonexistent object; assert via response `deleted:0` and absence of errors). Delete the synthetic lead after.
4. Positive deletion path: covered by `staleObjectKeys` purity (deterministic) + production observation after 90 days; noted as owner follow-up in docs.

- [ ] **Step 4: Docs**

`docs/r2/README.md`: architecture (private bucket, key scheme, limits table, Turnstile re-execution flow diagram-in-words), runbook (env vars incl. CRON_SECRET + Vercel Cron setup steps, retained-flag SQL: `update leads set attachments = jsonb_set(attachments, '{0,retained}', 'true') where id = '<lead-uuid>';`, manual delete snippet), probe matrix (filled with ACTUAL results from Tasks 2-4), residual-risk note (presigned PUT content-length), owner follow-ups (production E2E with real Turnstile on first real submission; NEXT_PUBLIC_R2_PUBLIC_BASE_URL + custom domain at P5).
`docs/contact/README.md` + `app/privacy/page.tsx`: attachment copy — 5 files ≤10 MB, allowlisted types, stored in private object storage, FILES auto-deleted after 90 days unless flagged, metadata persists with the lead record.

- [ ] **Step 5: Final gates + close-out**

```bash
npm run lint && npx tsc --noEmit && npm run build
git diff main --stat
```

Secret spot-grep; summarize; merge only on explicit confirmation.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/r2-retention/route.ts vercel.json docs/r2 docs/contact app/privacy/page.tsx
git commit -m "feat(r2): add 90-day retention cron and document attachment flows"
```

---

## Spec coverage map (for reviewer)

| Spec item (§8 P2 + §4 + next-stage 16-18) | Task |
|---|---|
| lib/r2.ts helper module | Task 1 |
| Presigned PUT endpoint, server-only creds, limits, Turnstile-gated | Tasks 1-2 |
| Lead submission stores attachment keys | Task 3 |
| Retention cron, N-day purge | Tasks 1 (constants), 4 |
| Private bucket ext/size allowlist (spec §4) | Tasks 1-3 |
| Public bucket provisioned (exists; reads deferred P5) | env already set; no code |
| Privacy/docs updates same-PR | Task 4 |
| P3b hardening carry-over: presign-ip budget | Tasks 1 (migration), 2 |
