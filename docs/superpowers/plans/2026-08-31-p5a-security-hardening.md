# Phase 5a — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four verified high-severity findings from the 2026-08-31 audit (unbounded presigned uploads, deactivated-client file access, client ticket-write bypass, admin invoice-invariant bypass) plus the supporting error-leak, rate-limit, and key-scoping gaps, before any P5 feature work begins.

**Architecture:** Enforcement moves to the narrowest chokepoint that every caller must pass: upload size becomes part of the presigned signature and is re-verified against storage at confirm time; `is_active` is checked inside `getOwnedFileUrl` rather than in one route; direct client/admin SQL write paths are removed so the service-role RPCs remain the only mutation surface; client-facing errors collapse to generic strings with detail logged server-side.

**Tech Stack:** Next.js 16 route handlers and server actions · `@aws-sdk/client-s3` presigner with signed `ContentLength` · Supabase Postgres RLS policies, triggers, and service-role RPCs · existing `consume_rate_limit` RPC. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-08-24-client-crm-design.md` (§2 defense-in-depth, §3 RLS summary, §4 storage limits) and the verified audit findings recorded in this branch's ledger. Approved 2026-08-31: P5 is split into P5a hardening (this plan), P5b lifecycle emails, P5c consolidation and assets; hardening ships first.

## Global Constraints

- Gate after every task: `npm run lint && npx tsc --noEmit && npm run build`.
- Branch: `feat/p5a-security-hardening`; commits per task; no push or merge to `main` without explicit confirmation.
- Migrations are forward-only. Never edit an applied migration; `0007`–`0013` stay byte-identical. New work lands in `0014_security_hardening.sql`.
- Service-role remains the only mutation surface for tickets, invoices, items, payments, and files. New or replaced SECURITY DEFINER functions revoke `EXECUTE` from `public`, `anon`, and `authenticated` and grant only `service_role`.
- Client-facing errors never include database, storage, or constraint text. Log detail server-side; return a generic message.
- Never log or return PII: names, emails, payment references, filenames, invoice descriptions, or message bodies.
- Fail closed. A rate-limit or verification path that cannot reach its backend denies the request rather than allowing it.
- No persistent probe fixtures: temporary users, projects, invoices, tickets, files, and R2 objects are deleted after probing, with cascade confirmation.
- Existing behavior for authenticated happy paths must not regress: contact submissions, ticket create/reply, deliverable upload/download, invoice lifecycle, and payment submit/confirm/reject all keep working.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0014_security_hardening.sql` | drop client ticket INSERT policies; narrow invoice admin policies to SELECT; guard invoice `status`; guard payment DELETE; resolve pending-attachment CHECK |
| `lib/r2.ts` | sign `ContentLength` on both presigners; expose object-size verification |
| `app/api/uploads/presign/route.ts` | pass declared size into the signature |
| `app/api/contact/route.ts` | verify stored attachment size before persisting lead attachments |
| `lib/crm/files.ts` | `is_active` enforcement in `getOwnedFileUrl`; portal-key-only deliverables; generic errors |
| `lib/crm/clients.ts` | revoke sessions on deactivation and on role change |
| `lib/crm/admin-actions.ts` | `requireAdmin` re-checks profile; deliverable key/project match; size verification at confirm |
| `lib/crm/client-actions.ts` | generic errors; size verification at attachment confirm |
| `lib/crm/tickets.ts` | generic errors |
| `app/api/uploads/ticket-presign/route.ts` | same-origin check; DB-backed fail-closed rate limit; generic errors; signed size |
| `docs/security/README.md` | audit findings, fixes, verification matrix, residual risks |

---

### Task 1: Migration 0014 — close direct SQL write bypasses

**Files:**
- Create: `supabase/migrations/0014_security_hardening.sql`

**Interfaces:**
- Removes policies `tickets_insert_own` and `ticket_messages_insert_own_in_own_ticket` so authenticated clients cannot insert tickets or messages directly.
- Replaces `invoices_admin_all`, `invoice_items_admin_all`, and `payments_admin_all` with `FOR SELECT` policies named `invoices_admin_select`, `invoice_items_admin_select`, `payments_admin_select`.
- Replaces `public.guard_invoice_lock()` so `status` is a guarded column: once an invoice leaves `draft`, direct `status` changes raise unless the controlled-transition marker `app.invoice_status_transition` is set.
- Adds `public.guard_payment_delete()` plus trigger `payment_delete_guard` rejecting payment deletion unless the parent invoice row is being deleted (cascade) — confirmed payments are never silently removable.
- Resolves the `0006` pending-attachment contradiction: the `files` attachment CHECK accepts `ticket_id IS NULL` only when `r2_key` contains `/pending/`.
- Grants: any new function revokes `EXECUTE` from `public`, `anon`, `authenticated`; grants `service_role`.

- [ ] **Step 1: Write the migration**

Write `supabase/migrations/0014_security_hardening.sql` implementing every interface item above. Requirements that must hold in the SQL:

1. Drop the two client ticket INSERT policies by name.
2. Drop the three `FOR ALL` invoice policies and create `FOR SELECT` replacements using `public.is_admin()`.
3. `CREATE OR REPLACE FUNCTION public.guard_invoice_lock()` keeping the existing guarded columns (`project_id`, `number`, `currency`, `issued_at`, `due_at`, `payment_note`) and adding: if `old.status <> new.status` and `current_setting('app.invoice_status_transition', true) IS DISTINCT FROM 'on'`, raise `'Invoice status changes must use the controlled transition path'`. Keep `new.updated_at := now()`. Keep `security definer` and `set search_path = ''`.
4. Update the three status-writing RPCs (`send_invoice_atomic`, `confirm_invoice_payment_atomic`, `recompute_invoice_status`) to `set_config('app.invoice_status_transition', 'on', true)` before their invoice `UPDATE`, so controlled paths still work. Preserve their existing locking, validation, and privilege posture exactly.
5. `guard_payment_delete()` raises `'Payments cannot be deleted'` unless `current_setting('app.invoice_payment_cascade', true) = 'on'`; add a `BEFORE DELETE ON public.invoices` trigger that sets that marker so invoice deletion still cascades.
6. Replace the `files` attachment CHECK: drop the existing constraint and add one allowing `kind <> 'attachment' OR ticket_id IS NOT NULL OR r2_key LIKE '%/pending/%'`.

- [ ] **Step 2: Apply and verify metadata**

Run `npx supabase db push`, then `npx supabase migration list` and confirm `0014` local and remote. Verify with service-role SQL: the two ticket INSERT policies are gone; the three invoice admin policies report `cmd = SELECT`; `payment_delete_guard` and the invoice cascade trigger exist; the files CHECK includes the pending clause.

- [ ] **Step 3: Bypass probes (must all be denied)**

Create a temporary client and admin, then probe with the publishable key plus each JWT:
1. Client `POST /rest/v1/tickets` → denied.
2. Client `POST /rest/v1/ticket_messages` → denied.
3. Admin `PATCH /rest/v1/invoices?id=eq.<id>` with `{"status":"paid"}` → denied.
4. Admin `DELETE /rest/v1/payments?id=eq.<id>` → denied.
5. Service-role happy paths still succeed: `send_invoice_atomic` sends a valid draft; `submit_invoice_payment_atomic` then `confirm_invoice_payment_atomic` produces `paid`; deleting the parent invoice cascades items and payments.
6. Pending-attachment insert with a `/pending/` key and `ticket_id NULL` succeeds; the same insert with a non-pending key still fails.
Delete every fixture and confirm cascades.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_security_hardening.sql
git commit -m "fix(security): remove direct write bypasses for tickets invoices and payments"
```

---

### Task 2: Signed upload size and confirm-time verification

**Files:**
- Modify: `lib/r2.ts`
- Modify: `app/api/uploads/presign/route.ts`
- Modify: `app/api/contact/route.ts`
- Modify: `lib/crm/admin-actions.ts`
- Modify: `lib/crm/client-actions.ts`

**Interfaces:**
- `presignContactUpload(filename: string, mime: string, size: number)` unchanged in signature, now signs `ContentLength: size`.
- `presignPrivatePut(key: string, mime: string, size: number, expiresIn = 600): Promise<string>` — gains a required `size` parameter and signs `ContentLength`.
- `getPrivateObjectSize(key: string): Promise<number | null>` — `HeadObject`; returns `null` when the object is missing.
- `verifyStoredObjectSize(key: string, declared: number): Promise<boolean>` — true only when the stored size equals `declared` and is within `CONTACT_MAX_SIZE_BYTES`.
- All confirm paths that persist a `files` row or lead attachment call `verifyStoredObjectSize` first and reject on mismatch with a generic message.

- [ ] **Step 1: Sign ContentLength in `lib/r2.ts`**

Add `ContentLength: size` to the `PutObjectCommand` in `presignContactUpload`. Add the required `size` parameter to `presignPrivatePut` and sign it the same way. Add `getPrivateObjectSize` using `HeadObjectCommand` (return `null` on a not-found error) and `verifyStoredObjectSize` built on it. Keep the existing `isPortalKey` guards.

- [ ] **Step 2: Thread size through callers**

Update every `presignPrivatePut` call site to pass the validated size: deliverable presigning in `lib/crm/admin-actions.ts` and ticket-attachment presigning in `app/api/uploads/ticket-presign/route.ts` and `lib/crm/client-actions.ts`. The contact presign route already validates size before signing; ensure it passes that value.

- [ ] **Step 3: Verify at confirm time**

In `app/api/contact/route.ts`, before persisting attachment metadata, call `verifyStoredObjectSize` for each declared key and reject the submission with the existing generic attachment-invalid message on mismatch. Do the same in `confirmDeliverableAction` (`lib/crm/admin-actions.ts`) and in both attachment-confirm paths in `lib/crm/client-actions.ts`.

- [ ] **Step 4: Gates + probes**

Run `npm run lint && npx tsc --noEmit && npm run build`. Then probe against real R2 with temporary keys:
1. PUT exactly the declared size → succeeds.
2. PUT one byte more than declared → rejected by R2 (signature mismatch).
3. PUT smaller than declared → rejected by R2.
4. Tamper case: presign for 1 KB, PUT 1 KB, then attempt to confirm with a declared size of 10 MB → confirm rejected by `verifyStoredObjectSize`.
5. Normal contact attachment, deliverable, and ticket-attachment flows still complete end to end.
Delete all probe objects and rows.

- [ ] **Step 5: Commit**

```bash
git add lib/r2.ts app/api/uploads/presign/route.ts app/api/contact/route.ts lib/crm/admin-actions.ts lib/crm/client-actions.ts
git commit -m "fix(security): bind upload size to presigned signature and verify at confirm"
```

---

### Task 3: Deactivation enforcement and session revocation

**Files:**
- Modify: `lib/crm/files.ts`
- Modify: `lib/crm/clients.ts`
- Modify: `lib/crm/admin-actions.ts`

**Interfaces:**
- `getOwnedFileUrl(fileId, viewer)` — for `role: 'client'`, loads the viewer's profile and returns the generic not-found result unless `is_active` is true. Admin behavior unchanged.
- `deleteOwnedFile(fileId, viewer)` — same client `is_active` requirement.
- `setClientActive(clientId: string, active: boolean)` — when `active` is false, revokes the user's sessions via the auth admin API after the column update; a revocation failure returns an error so the caller learns the user may still hold a session.
- `setClaimRole(userId: string, role: 'admin' | 'client')` — revokes sessions after changing the claim so a demoted admin cannot continue on an old token.
- `requireAdmin()` in `lib/crm/admin-actions.ts` — after the claim check, loads `profiles` for the session user and returns `null` unless `role = 'admin'` and `is_active` is true.

- [ ] **Step 1: Enforce `is_active` at the file chokepoint**

In `lib/crm/files.ts`, add the client `is_active` check inside `getOwnedFileUrl` and `deleteOwnedFile` before returning any URL or performing deletion. Reuse the existing generic error text so no new information is exposed.

- [ ] **Step 2: Revoke sessions on deactivation and demotion**

In `lib/crm/clients.ts`, call the auth admin sign-out for the target user inside `setClientActive` when deactivating, and inside `setClaimRole` after the metadata write. Treat a revocation error as an operation failure with a generic message; never log the email.

- [ ] **Step 3: Harden `requireAdmin`**

In `lib/crm/admin-actions.ts`, extend `requireAdmin()` to re-check `profiles.role` and `profiles.is_active` for the session user, matching the existing `requireClient()` shape. Keep the return type so no call site changes.

- [ ] **Step 4: Gates + probes**

Run all gates. Then probe:
1. Active client downloads an own deliverable → `302`.
2. Deactivate that client, then repeat the download with the same session → generic `404`.
3. Confirm the deactivated client can no longer obtain a session (refresh/sign-in blocked by revocation plus the existing portal gate).
4. Reactivate → download works again.
5. Demote an admin to client → an admin-only action with the old session is refused.
6. Admin download of any file still works.
Delete all fixtures.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/files.ts lib/crm/clients.ts lib/crm/admin-actions.ts
git commit -m "fix(security): enforce deactivation on file access and revoke stale sessions"
```

---

### Task 4: Generic errors, fail-closed limits, and key scoping

**Files:**
- Modify: `app/api/uploads/ticket-presign/route.ts`
- Modify: `lib/crm/client-actions.ts`
- Modify: `lib/crm/tickets.ts`
- Modify: `lib/crm/files.ts`
- Modify: `lib/crm/admin-actions.ts`

**Interfaces:**
- Every client-reachable failure returns a generic message. Replace the interpolated-detail strings at `lib/crm/client-actions.ts` (`Count failed:`, `Could not save file:`, `Ticket lookup failed:`), `lib/crm/tickets.ts` (`Reply failed:`), `lib/crm/files.ts` (`Could not save file:`), and `app/api/uploads/ticket-presign/route.ts` (`Ticket lookup failed:`, `Count failed:`, raw presigner text) with fixed copy, logging `error.message` server-side only.
- `app/api/uploads/ticket-presign/route.ts` gains a same-origin check matching the contact and contact-presign routes, and replaces the module-level `Map` limiter with `consume_rate_limit` using kind `'presign-portal'`; an RPC error or missing salt denies the request.
- `createFileRow` requires `isPortalKey(r2_key)` for `kind: 'deliverable'` and `kind: 'attachment'`; contact keys are no longer accepted for portal file rows.
- `confirmDeliverableAction` rejects a key whose `project_<id>` segment does not match the target `projectId`.
- Migration addition: extend the `rate_limits.kind` CHECK to include `'presign-portal'` in a forward migration `0015_presign_portal_rate_kind.sql`.

- [ ] **Step 1: Add the rate-limit kind**

Create `supabase/migrations/0015_presign_portal_rate_kind.sql` replacing the `rate_limits_kind_check` constraint so it accepts `'ip'`, `'turnstile'`, `'presign-ip'`, and `'presign-portal'`. Apply it and confirm `migration list` shows `0015` local and remote.

- [ ] **Step 2: Harden the ticket-presign route**

Add the same-origin check, swap the in-memory limiter for `consume_rate_limit('presign-portal', <salted session hash>, 60, 3)` with fail-closed handling, and replace all leaking error strings with generic copy plus server-side logging.

- [ ] **Step 3: Collapse remaining error leaks**

Apply the same generic-message treatment to the listed sites in `lib/crm/client-actions.ts`, `lib/crm/tickets.ts`, and `lib/crm/files.ts`.

- [ ] **Step 4: Scope portal file keys**

Require `isPortalKey` for portal file rows in `createFileRow`, and verify the `project_<id>` segment in `confirmDeliverableAction`.

- [ ] **Step 5: Gates + probes**

Run all gates. Then probe:
1. Cross-origin `POST /api/uploads/ticket-presign` → `403`.
2. Four presign calls in one minute for one client → fourth denied by the DB limiter; verify the `rate_limits` row exists with kind `'presign-portal'`.
3. Force a DB failure path (invalid salt configuration in a scratch run) → request denied, not allowed.
4. Trigger each former leak path and confirm the response body contains no database or storage text.
5. `confirmDeliverableAction` with a key presigned for a different project → rejected.
6. A `contact/…` key rejected for a deliverable row.
7. Normal ticket attachment and deliverable flows still succeed.
Delete all fixtures.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_presign_portal_rate_kind.sql app/api/uploads/ticket-presign/route.ts lib/crm/client-actions.ts lib/crm/tickets.ts lib/crm/files.ts lib/crm/admin-actions.ts
git commit -m "fix(security): generic errors fail-closed limits and portal key scoping"
```

---

### Task 5: Security documentation and close-out

**Files:**
- Create: `docs/security/README.md`
- Modify: `docs/crm/README.md`

- [ ] **Step 1: Document the hardening**

Write `docs/security/README.md` covering: the four verified findings and their fixes; the enforcement model (signed size, `is_active` chokepoint, service-role-only mutations, controlled invoice transitions, fail-closed limits); the probe matrix with actual results from Tasks 1–4, marking any probe that could not run and why; residual risks; and an operator note that deactivating a client now revokes sessions. Use placeholders only — no real emails, keys, references, or full UUIDs. Add a short pointer from `docs/crm/README.md` to the new document.

- [ ] **Step 2: Final gates and review inputs**

```bash
npm run lint && npx tsc --noEmit && npm run build
git diff main --stat
```

Scan tracked files for secrets and PII. Confirm no temporary fixtures remain in Supabase or R2. Summarize residual minor findings for the whole-branch reviewer.

- [ ] **Step 3: Commit**

```bash
git add docs/security/README.md docs/crm/README.md
git commit -m "docs(security): document p5a hardening and verification"
```

---

## Audit Coverage Map

| Finding | Severity | Task |
|---|---|---|
| Presigned PUT signs no length; declared size advisory | Critical | Task 2 |
| Download route and `getOwnedFileUrl` skip `is_active`; no session revocation | Critical | Task 3 |
| Client ticket/message INSERT policies bypass app limits | Important | Task 1 |
| Admin `FOR ALL` invoice policies plus unguarded `status` and payment DELETE | Important | Task 1 |
| `requireAdmin` claim-only, no revocation path | Important | Task 3 |
| Client-facing errors leak database and storage text | Important | Task 4 |
| Ticket-presign in-memory limiter ineffective and not fail-closed | Important | Task 4 |
| Pending-attachment CHECK contradicts pending code path | Important | Task 1 |
| `createFileRow` accepts contact keys for deliverables; no key/project match | Important | Task 4 |
| Missing same-origin check on ticket-presign | Minor | Task 4 |
| Deferred to P5c: helper duplication, dead exports, N+1 hydration, CSP hardcoded ref, cookie attribute copying, OTP throttling | Minor | Not in P5a |
