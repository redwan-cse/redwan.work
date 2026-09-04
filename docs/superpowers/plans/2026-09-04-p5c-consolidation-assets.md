# P5c Consolidation & Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate P5a/P5b deferred duplication and dead code, ship the admin public-asset uploader, and close remaining hardening gaps in one branch.

**Architecture:** Extract shared helpers into single-ownership modules first so later tasks delete rather than duplicate; add the DB-free public asset uploader on top of `lib/r2.ts` public-client helpers; fix N+1 with batched reads; derive CSP origins from env; harden cookies and OTP with existing `consume_rate_limit` RPC. No new migrations.

**Tech Stack:** Next.js 16 App Router + React 19 + TypeScript strict, Tailwind 3 + shadcn/ui, Supabase Postgres + Auth (`sb_publishable_`/`sb_secret_` keys only), Cloudflare R2 (`@aws-sdk/client-s3`), Resend 6.25.0 (pinned exact).

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§4 R2 storage design, §5 Admin Assets scope, §8 P5 Polish) plus audit deferral list in `docs/superpowers/plans/2026-08-31-p5a-security-hardening.md:279` and `docs/security/README.md:67-71`.

## Global Constraints

- Gate after every task: `npm run lint && npx tsc --noEmit && npm run build`.
- Branch: `feat/p5c-consolidation-assets`; commits per task; no push or merge to `main` without explicit user confirmation.
- Migrations are forward-only. `0001`–`0016` stay byte-identical. P5c adds zero migrations (asset uploader is DB-free).
- Service-role remains the only mutation surface for tickets, invoices, items, payments, files. RLS is the real boundary.
- Client-facing errors never include database, storage, or constraint text. Log detail server-side; return generic copy.
- Never log or return PII: names, emails, payment references, filenames, invoice descriptions, message bodies.
- Fail closed. Any rate-limit or verification path that cannot reach its backend denies rather than allows.
- No persistent probe fixtures: delete temp users, projects, invoices, tickets, files, R2 objects after probing with cascade confirmation.
- Existing happy paths must not regress: contact submit, ticket create/reply, deliverable upload/download, invoice lifecycle, payment submit/confirm, lifecycle emails, `/admin/emails` viewer.
- Use npm only (package-lock.json committed). Pin exact versions for any new dep (none expected).
- `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` must be set in `.env.local` and Vercel for asset URLs to resolve.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/format.ts` | `formatBytes`, `formatMoney` re-export, `formatDateUTC`, canonical money/date entry points |
| `lib/mime.ts` | `CONTACT_ALLOWED_EXT`, `ASSET_ALLOWED` maps, `extFromFilename`, `isAllowedMime(ext, mime)` |
| `components/ui/status-badges.tsx` | `TicketStatusBadge`, `ProjectStatusBadge`, `LeadStatusBadge`, `DeliveryBadge` shared components |
| `lib/site.ts` | `siteOrigin()` (env-first origin for non-email contexts), re-export `emailOrigin` contract note |
| `lib/auth/bearer.ts` | `requireBearer(secret, header)` timing-safe compare shared by cron + revalidate routes |
| `lib/r2.ts` | add `publicClient()`, `putPublicObject()`, `makeAssetKey()`, `ASSET_ALLOWED_EXT`, `ASSET_MAX_BYTES` |
| `app/(admin)/admin/assets/page.tsx` | Admin-only asset uploader UI (force-dynamic, server component + client form island) |
| `lib/crm/admin-actions.ts` | add `uploadAssetAction`, `deleteAssetAction`; extend `requireAdmin` unchanged |
| `app/(admin)/admin/layout.tsx` | enable `Assets` nav entry |
| `next.config.js` | derive Supabase origin from `NEXT_PUBLIC_SUPABASE_URL`, keep R2 derivation, drop hardcoded project ref |
| `lib/auth/actions.ts` | OTP throttling via `consume_rate_limit` on magic-link request/consume |
| `lib/supabase/*.ts` | cookie attribute hardening (`secure`, `sameSite`, `httpOnly` where applicable) |

---

### Task 1: Shared helpers extraction

**Files:**
- Create: `lib/format.ts`
- Create: `lib/mime.ts`
- Create: `components/ui/status-badges.tsx`
- Create: `lib/site.ts`
- Create: `lib/auth/bearer.ts`
- Modify: `components/enhanced-contact-form.tsx`, `components/admin/project-forms.tsx`, `components/portal/reply-form.tsx`, `components/portal/new-ticket-button.tsx`, `app/(client)/portal/files/page.tsx`, `app/(client)/portal/tickets/[id]/page.tsx`, `app/(admin)/admin/projects/[id]/page.tsx`, `app/(admin)/admin/tickets/[id]/page.tsx`
- Modify: `app/api/uploads/presign/route.ts`, `app/api/uploads/ticket-presign/route.ts`
- Modify: `app/api/cron/r2-retention/route.ts`, `app/api/revalidate/route.ts`

**Interfaces:**
- `formatBytes(bytes: number): string` — `bytes < 0` throws `RangeError`; `0` → `"0 B"`; otherwise base-1024 with units `B,KB,MB,GB`, one decimal, trims trailing `.0`.
- `extFromFilename(filename: string): string` — lowercases, takes substring after last `.`, returns `""` when no dot.
- `isAllowedMime(ext: string, mime: string): boolean` — true only when `mime` (trimmed, lowercased, split on `;`, first segment) is in the allowlist for `ext`.
- `siteOrigin(): string` — returns `NEXT_PUBLIC_SITE_URL` stripped of trailing `/` when set, else `https://redwan.work`. Pure, no `headers()` call.
- `requireBearer(secret: string | undefined, header: string | null): boolean` — false when secret missing; parses `Bearer <token>`; `timingSafeEqual` length-guarded compare.

- [ ] **Step 1: Create `lib/format.ts` with `formatBytes`**

```ts
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('Invalid byte count.');
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 2: Create `lib/mime.ts` consolidating both route maps**

```ts
export const CONTACT_ALLOWED: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};
export function extFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}
export function isAllowedMime(ext: string, mime: string): boolean {
  const normalized = mime.trim().toLowerCase().split(';')[0].trim();
  return (CONTACT_ALLOWED[ext] ?? []).includes(normalized);
}
```

- [ ] **Step 3: Replace all 8 `formatBytes` copies with the shared import**

In each of the 8 files listed above, delete the local `function formatBytes` block and add `import { formatBytes } from '@/lib/format';`. Verify no local definition remains:

Run: `grep -rn "function formatBytes" components/ app/ | wc -l`
Expected: `0`

- [ ] **Step 4: Replace both `EXT_ALLOWED_MIMES` maps with the shared module**

In `app/api/uploads/presign/route.ts` and `app/api/uploads/ticket-presign/route.ts`, delete the local const map and replace the mime check with `isAllowedMime(check.ext, candidate.mime)`. Keep `validateContactFile` call unchanged.

Run: `grep -rn "EXT_ALLOWED_MIMES" app/api/ | wc -l`
Expected: `0`

- [ ] **Step 5: Gates + probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: lint clean, tsc clean, build shows all routes including `ƒ /admin/emails`.

Probe: submit contact presign with a `.pdf` + `application/pdf` (expect 200 with uploads array) and with `.pdf` + `image/png` (expect 400 `File type does not match its extension.`).

- [ ] **Step 6: Commit**

```bash
git add lib/format.ts lib/mime.ts components/enhanced-contact-form.tsx components/admin/project-forms.tsx components/portal/reply-form.tsx components/portal/new-ticket-button.tsx "app/(client)/portal/files/page.tsx" "app/(client)/portal/tickets/[id]/page.tsx" "app/(admin)/admin/projects/[id]/page.tsx" "app/(admin)/admin/tickets/[id]/page.tsx" app/api/uploads/presign/route.ts app/api/uploads/ticket-presign/route.ts
git commit -m "refactor: extract shared format and mime helpers"
```

---

### Task 2: Dead-export audit and deletion

**Files:**
- Modify: `lib/email/index.ts`, `lib/email/templates.ts`, `lib/crm/email-log.ts`, plus any file the audit proves unreferenced
- Test: `grep` reachability audit (no new test file; repo has no test runner)

**Interfaces:**
- Deletion rule (binding): an export is deleted only when `rg -n "<name>" --glob '!lib/email/index.ts'` (or defining file) returns zero hits outside its defining file and its type declaration file. Type-only exports (`type`, `interface`) are excluded from deletion.
- Known candidates to verify (do not delete without proving zero hits): `sendInviteEmail`, `renderInvite`, `countFailedEmails`, `isEmailConfigured`, `escapeHtml`, `sendEmail` (check internal-only), `getPrivateObjectBytes` (check callers), `listPrivateContactObjects`, `staleObjectKeys`, `putPrivateObject` (check callers), `isValidContactKey` (check callers outside lead-schema), `ARCHIVE_MAX_BYTES`/`ARCHIVE_PREFIX`/`PENDING_PREFIX` (check callers).

- [ ] **Step 1: Produce the verified dead list**

Run: `for name in sendInviteEmail renderInvite countFailedEmails isEmailConfigured escapeHtml getPrivateObjectBytes listPrivateContactObjects staleObjectKeys putPrivateObject isValidContactKey; do echo "== $name =="; rg -n "$name" lib/ app/ components/ --glob '!**/node_modules/**' | grep -v "lib/email/index.ts\|lib/email/templates.ts\|lib/r2.ts" | head -5; done`
Expected: each name shows either zero hits (deletable) or a short caller list (keep). Record the deletable set in the commit message body.

- [ ] **Step 2: Delete only the proven-zero-hit exports**

Remove each dead export and its now-unused import. Keep `sendEmail` if any non-email module imports it; otherwise keep it (it is the module primitive). Do not delete type exports.

Run: `npx tsc --noEmit`
Expected: clean (proves no caller was missed).

- [ ] **Step 3: Gates + probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all clean. No behavior probe needed (deletion-only); the build passing plus `tsc` clean is the verification.

- [ ] **Step 4: Commit**

```bash
git add lib/email/index.ts lib/email/templates.ts lib/crm/email-log.ts lib/r2.ts
git commit -m "refactor: remove dead exports proven unreferenced by rg audit"
```

Commit body must list each deleted name and the `rg` evidence (e.g. `sendInviteEmail: 0 hits outside lib/email/index.ts`).

---

### Task 3: Public asset uploader (DB-free)

**Files:**
- Modify: `lib/r2.ts`
- Create: `app/(admin)/admin/assets/page.tsx`
- Modify: `lib/crm/admin-actions.ts`
- Modify: `app/(admin)/admin/layout.tsx`

**Interfaces:**
- `ASSET_ALLOWED_EXT = ['png','jpg','webp','svg','avif','pdf']`, `ASSET_MAX_BYTES = 5*1024*1024`, `makeAssetKey(ext: string): string` → `assets/{yyyy}/{ulid}.{ext}` (use `randomUUID()` stripped of dashes, lowercase alphanumerics only).
- `putPublicObject(key: string, body: Buffer, contentType: string): Promise<void>` — direct S3 put to `R2_PUBLIC_BUCKET` via public credentials. Throws on missing env.
- `assetUrl(key: string): string` — `${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${key}` with trailing-slash handling. Throws when base URL unset.
- `uploadAssetAction(_prev, formData): Promise<{ error?: string; notice?: string; url?: string }>` — requireAdmin; validate ext/size/mime via shared `lib/mime.ts`; `putPublicObject`; return `{ notice: 'Asset uploaded.', url }`.
- `deleteAssetAction(key: string)` — requireAdmin; validate key prefix `assets/` + no `..`; delete from public bucket; return `{}`.

- [ ] **Step 1: Add public-bucket helpers to `lib/r2.ts`**

```ts
export const ASSET_ALLOWED_EXT = ['png','jpg','webp','svg','avif','pdf'] as const;
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export function makeAssetKey(ext: string): string {
  const clean = ext.replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!((ASSET_ALLOWED_EXT as readonly string[]).includes(clean))) throw new Error('Invalid asset extension.');
  const year = new Date().getUTCFullYear();
  return `assets/${year}/${randomUUID().replace(/-/g, '')}.${clean}`;
}
export function assetUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('Public asset base URL is not configured.');
  if (!key.startsWith('assets/') || key.includes('..')) throw new Error('Invalid asset key.');
  return `${base}/${key}`;
}
```

Plus `publicClient()` mirroring `privateClient()` with `R2_PUBLIC_ACCESS_KEY_ID`/`R2_PUBLIC_SECRET_ACCESS_KEY`, and `putPublicObject` / `deletePublicObject` using it.

- [ ] **Step 2: Add `uploadAssetAction` + `deleteAssetAction` to `lib/crm/admin-actions.ts`**

Validate with shared `isAllowedMime` + size check against `ASSET_MAX_BYTES`; on success return the CDN URL. No `files` row is written (DB-free per design).

- [ ] **Step 3: Create `app/(admin)/admin/assets/page.tsx` (force-dynamic)**

Server component with a client form island: file input (accept from `ASSET_ALLOWED_EXT`), size guard at `ASSET_MAX_BYTES` using shared `formatBytes` for the message, upload progress, result shows clickable CDN URL + copy button, delete button per uploaded key in-session. Enable nav: change `Assets` entry `enabled: false` → `true` in `app/(admin)/admin/layout.tsx`.

- [ ] **Step 4: Gates + probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: route table contains `ƒ /admin/assets`.

Probe with temp admin session: upload 100KB png → 200 + URL starts with `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` + `GET <url>` returns 200 with matching bytes; upload 6MB file → 400; upload `.exe` → 400; delete uploaded key → `GET` returns 404. Delete R2 object after probing.

- [ ] **Step 5: Commit**

```bash
git add lib/r2.ts lib/crm/admin-actions.ts "app/(admin)/admin/assets/page.tsx" "app/(admin)/admin/layout.tsx"
git commit -m "feat(assets): add admin public-bucket uploader with CDN URLs"
```

---

### Task 4: N+1 hydration fixes

**Files:**
- Modify: `lib/crm/clients.ts` (`listClients`)
- Modify: `lib/crm/tickets.ts` (`listTickets`)
- Modify: `lib/crm/invoices.ts` (`hydrate`, `listInvoices`)

**Interfaces:**
- `listClients(): Promise<ClientRow[]>` — same return shape, one batched auth lookup instead of per-row `getUserById`. Implementation: collect profile ids, fetch in chunks (Supabase Admin has no bulk get-by-ids; use `Promise.all` over `getUserById` with concurrency limit 10 — still N calls but concurrent, documented as interim; the true single-query path is unavailable via Admin API).
- `listTickets` — same: concurrent `getUserById` via `Promise.all` instead of serial `for` loop.
- `hydrate` — concurrent `Promise.all` for project/profile/user/amounts already exists; fix `listInvoices` serial `for (const raw ...)` loop to `Promise.all` mapped hydrations.

- [ ] **Step 1: Convert serial loops to concurrent batches**

In `listClients`, replace the serial `for (const row of rows)` + `await getUserById` with `await Promise.all(rows.map(...))`. Same in `listTickets`. In `listInvoices`, replace `for (const raw of data)` + `await hydrate` with `await Promise.all(data.map((raw) => hydrate(...)))` preserving order via index mapping and the existing client-side filter (filter after all resolve).

- [ ] **Step 2: Gates + probes**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

Probe: `/admin/clients` renders same rows/count as before (compare row count via service-role `select count(*) from profiles where role='client'`); `/admin/tickets` same; `/admin/invoices` same totals. No fixture changes needed (read-only verification).

- [ ] **Step 3: Commit**

```bash
git add lib/crm/clients.ts lib/crm/tickets.ts lib/crm/invoices.ts
git commit -m "perf: batch N+1 auth and hydration lookups"
```

---

### Task 5: Hardening leftovers + docs + close-out

**Files:**
- Modify: `next.config.js`
- Modify: `lib/supabase/*.ts` (cookie attributes)
- Modify: `lib/auth/actions.ts`
- Modify: `docs/crm/README.md`, `docs/security/README.md`, `docs/r2/README.md`

**Interfaces:**
- CSP `connect-src` derives Supabase origin from `NEXT_PUBLIC_SUPABASE_URL` via `new URL(...).origin` with try/catch fallback to `[]`; R2 derivation unchanged. No hardcoded project ref string remains in the file.
- Cookies: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'` on every `cookies().set` / SSR cookie setter in `lib/supabase/`.
- OTP: `requestMagicLinkAction` and `consumeMagicLinkTokenAction` call `consume_rate_limit('otp-ip', saltedIpHash, 300, 5)` fail-closed (missing salt or RPC error → deny with generic message).

- [ ] **Step 1: Derive CSP Supabase origin from env**

In `next.config.js`, replace the hardcoded `https://cqxtmzzlywolulechcob.supabase.co` with:

```js
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try { return new URL(raw).origin; } catch { return null; }
})();
```

and interpolate `${supabaseOrigin ? ` ${supabaseOrigin}` : ''}` into `connect-src`. Verify no `cqxtmzzlywolulechcob` string remains:

Run: `grep -rn "cqxtmzzlywolulechcob" next.config.js | wc -l`
Expected: `0`

- [ ] **Step 2: Harden cookies + throttle OTP**

Set explicit attributes on every server-side cookie write. Wrap both OTP actions with the DB rate limiter (kind `otp-ip`, window 300s, max 5) using the existing `LEAD_IP_HASH_SALT` salt pattern; fail closed with `Too many requests. Please try again later.`

- [ ] **Step 3: Docs + final gates**

Update `docs/crm/README.md` (assets section now live, remove P5c pointer), `docs/security/README.md` (move CSP/cookie/OTP items from residual to shipped), `docs/r2/README.md` (public reads now live via CDN base URL). Run `npm run lint && npx tsc --noEmit && npm run build` plus `git diff main --stat`. Scan tracked files for secrets/PII. Confirm no fixtures remain.

- [ ] **Step 4: Commit**

```bash
git add next.config.js lib/supabase lib/auth/actions.ts docs/crm/README.md docs/security/README.md docs/r2/README.md
git commit -m "fix(security): env-derived CSP, hardened cookies, OTP throttling"
```
