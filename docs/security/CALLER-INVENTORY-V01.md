# Caller Inventory & Action Manifest Audit (Issue #42 / V01)

Branch verification for issues #42, #29, and #40. Not a production release or an issue-closure claim.

## Overview

This document establishes the exhaustive inventory of all callable HTTP entry points (API route handlers and Next.js App Router Server Actions) across `redwan.work`. It verifies authorization mechanisms, role cutoffs, input validation constraints, abuse controls, anti-enumeration mappings, and build manifest agreement with `.next/server/server-reference-manifest.json`.

---

## 1. API Route Handlers (8 Routes)

| Path | Methods | Auth Gate | Rate Control / Abuse Guard | Description / Response Policy |
|---|---|---|---|---|
| `/api/contact` | `POST` | Public | IP rate limit (`contact-ip`, 3600s/5), Turnstile token verification, replay guard | Contact intake form; creates `leads` row. Rejects cross-origin with 403; Turnstile/replay with 400; quota with 429; DB fail-closed with 503. |
| `/api/auth/logout` | `GET`, `POST` | Public / Session | Same-origin required on `POST` (403); `GET` open for proxy bounce | Clears Supabase Auth session cookies and redirects to `/login`. |
| `/api/cron/email-outbox` | `GET` | Bearer (`CRON_SECRET`) | Strict Bearer header token match via `requireBearer` | Email outbox worker; claims pending emails, dispatches via Resend. Rejects invalid credentials with 401. `no-store` cache control. |
| `/api/cron/r2-retention` | `GET` | Bearer (`CRON_SECRET`) | Strict Bearer header token match via `requireBearer` | Retention sweep; claims expired storage, sweeps R2 via S3 client, advances cursors, drains deletions. 401 on bad credentials. `no-store`. |
| `/api/files/[id]/download` | `GET` | Session (`getCurrentSession`) | Session role & ownership check via `getOwnedFileUrl` | Issues signed download URL and 302 redirects. Anonymous -> 401; unauthorized/foreign/inactive -> opaque 404 (`File not found.`). |
| `/api/revalidate` | `POST` | Bearer (`REVALIDATION_SECRET`) | Strict Bearer header match; path allowlist (`ALLOWED_PATHS = ['/blogs']`) | On-demand ISR blog cache revalidation. Bad token -> 401; unlisted path -> 400; success -> 200 `{ revalidated: true }`. |
| `/api/uploads/presign` | `POST` | Public | Same-origin required, Turnstile token, IP rate limit (`presign-ip`, 3600s/20) | Generates presigned PUT URLs for contact attachments (`contact/...`). Validates count (1-5), MIME allowlist, and 10 MB size limits. |
| `/api/uploads/ticket-presign` | `POST` | Session (`getCurrentSession`) | Same-origin/sec-fetch-site required, active profile check, per-user rate limit (`presign-ticket`, 60s/3) | Generates presigned PUT URLs for ticket attachments (`private/{owner}/ticket_{id}/` or `private/{owner}/pending/`). Enforces 10-file cap. |

---

## 2. Server Actions (41 Actions across 6 Modules)

### 2.1 `lib/auth/actions.ts` (6 Actions)

| Action | Caller Role | Validation & Abuse Controls | Failure Mode |
|---|---|---|---|
| `signInWithPasswordAction` | Public | Sanitizes return path (`safeRelativePath`), prevents cross-panel redirection | Returns `{ error: 'Invalid email or password.' }` on auth failure. |
| `requestMagicLinkAction` | Public | IP rate-limited (`otp-ip`, 300s/5), forces `shouldCreateUser: false` | Returns uniform notice preventing account enumeration. 429 mapped. |
| `requestPasswordResetAction` | Public | IP rate-limited (`otp-ip`, 300s/5), site origin sanitization (`credentialEmailOrigin`) | Returns uniform notice preventing account enumeration. 429 mapped. |
| `setNewPasswordFromRecoveryAction` | Single-use Recovery Token | Validates password ($\ge 12$ chars, confirmation match) **before** `verifyOtp` | Preserves OTP on validation failure; safe copy on provider failure; redirects to role panel. |
| `acceptInviteAction` | Single-use Invite Token | Validates password ($\ge 12$ chars, confirmation match) **before** `verifyOtp` | Preserves invite token on validation failure; safe copy on provider failure; redirects to role panel. |
| `consumeMagicLinkTokenAction` | Single-use Magic Link Token | Short-circuits on empty token without consuming rate limit; IP rate-limited | Returns `{ ok: false, error: INVALID_LINK }` on token error; `{ ok: true, home }` on success. |

### 2.2 `lib/crm/admin-actions.ts` (26 Actions)

All admin actions enforce `requireAdmin()`, verifying both JWT claims (`role === 'admin'`) and a fresh database lookup (`profiles(role='admin', is_active=true)`). Inactive accounts, client sessions, role-mismatches, or database errors fail closed with `{ error: 'Unauthorized.' }`.

| Action | Status | Target Entity | Key Safeguards |
|---|---|---|---|
| `convertLeadAction` | Active | `leads` | Checks `emailOrigin()`, calls `convertLead()`, prevents duplicate conversion |
| `replyToTicketAction` | Active | `tickets`, `ticket_messages` | Checks non-empty body, calls `adminReply()`, revalidates ticket paths |
| `setTicketStatusAction` | Active | `tickets` | Enforces valid ticket status transitions via `setTicketStatus()` |
| `inviteClientAction` | Active | `profiles` | Checks email syntax, length limits, origin, sends invite / claims account |
| `setClientActiveAction` | Active | `profiles`, Supabase Auth | Bans/unbans auth sign-in and updates `is_active` atomically |
| `createProjectAction` | Active | `projects` | Validates client UUID, project name, creates project row |
| `updateProjectAction` | Active | `projects` | Updates project details and revalidates project detail paths |
| `addMilestoneAction` | Active | `milestones` | Strictly validates whole cents via `parseMilestoneMoney()`, rejects fractions |
| `updateMilestoneAction` | Active | `milestones` | Strictly validates whole cents via `parseMilestoneMoney()`, rejects fractions |
| `setMilestoneStatusAction` | Active | `milestones` | Validates status parameter, updates milestone |
| `deleteMilestoneAction` | Active | `milestones` | Deletes milestone and revalidates invoice/project paths |
| `moveMilestoneAction` | Active | `milestones` | Reorders milestone position |
| `getDeliverablePresignAction` | Active | R2 Storage | Validates project, file metadata, MIME allowlist, 10 MB size limits |
| `confirmDeliverableAction` | Active | `files`, R2 Storage | Validates stored object bytes via `validateDeliverable()`, creates file row |
| `deleteFileAction` | Active | `files`, R2 Storage | Calls `deleteOwnedFile()`, deletes from R2 and database |
| `archiveProjectAction` | Active | `projects` | Marks project archived, advances retention status |
| `purgeArchivedProjectAction` | Active | `projects`, `files` | Requires verified recovery archive, refuses if invoices exist |
| `archiveDownloadUrlAction` | Active | Projects Archive | Issues signed archive download URL |
| `createDraftInvoiceAction` | Active | `invoices` | Creates draft invoice for project |
| `createDraftInvoiceWithItemsAction`| Active | `invoices`, `invoice_items`| Atomic draft creation with items via PostgreSQL RPC |
| `updateDraftInvoiceAction` | Active | `invoices` | Updates draft invoice parameters (draft state only) |
| `addInvoiceItemAction` | Active | `invoice_items` | Adds line item to draft invoice, validates positive integers |
| `updateInvoiceItemAction` | Active | `invoice_items` | Updates line item, validates 1-row exact update |
| `deleteInvoiceItemAction` | Active | `invoice_items` | Deletes line item, validates 1-row exact delete |
| `sendInvoiceAction` | Active | `invoices` | Transitions draft to sent via `send_invoice_atomic` |
| `voidInvoiceAction` | Active | `invoices` | Voids invoice (must not be paid) |
| `confirmPaymentAction` | Active | `payments`, `invoices` | Confirms payment via `confirm_invoice_payment_atomic`, maps conflict errors |
| `rejectPaymentAction` | Active | `payments`, `invoices` | Rejects payment via `reject_invoice_payment_atomic`, maps conflict errors |
| `deleteAssetAction` | Active | Public R2 Assets | Deletes asset from public R2 bucket, revalidates assets path |
| `uploadAssetAction` | **Latent** | Public R2 Assets | Legacy FormData asset uploader; validates extension, MIME, 5 MB cap |

### 2.3 `lib/crm/client-actions.ts` (5 Actions)

All client actions enforce `requireClient()`, verifying both JWT claims (`role === 'client'`) and a fresh database lookup (`profiles(role='client', is_active=true)`). Inactive accounts, admin sessions, or database lookup errors fail closed with `{ error: 'Unauthorized.' }` (or `{ ok: false, error: 'Unauthorized.' }`).

| Action | Status | Target Entity | Key Safeguards |
|---|---|---|---|
| `createTicketWithAttachmentsAction`| Active | `tickets`, `ticket_messages`| Validates client session, ticket inputs, attachment metadata, creates ticket |
| `clientReplyAction` | Active | `ticket_messages` | Validates ticket ownership (cross-client -> opaque 404 `'Ticket not found.'`) |
| `submitPaymentAction` | Active | `payments` | Submits payment review; validates positive amount and supported payment method |
| `getTicketAttachmentPresignAction` | **Latent** | R2 Storage | Presigns single attachment; validates client session and attachment bounds |
| `confirmTicketAttachmentAction` | **Latent** | `files`, `tickets` | Validates ticket ownership (foreign ticket -> 404), calls atomic RPC |

### 2.4 `lib/crm/public-asset-actions.ts` (2 Actions)

| Action | Caller Role | Key Safeguards |
|---|---|---|
| `prepareAssetUploadAction` | Admin (`workflowSession('admin')`) | Validates asset metadata (1 byte - 5 MB, MIME allowlist), rate limits (`presign-portal`, 60s/3), generates presigned PUT URL |
| `confirmAssetUploadAction` | Admin (`workflowSession('admin')`) | Confirms stored object matches declared metadata in R2; returns public URL |

### 2.5 `lib/crm/workflow-actions.ts` (2 Actions)

| Action | Caller Role | Key Safeguards |
|---|---|---|
| `editClientProfileAction` | Client (own profile) or Admin | Validates UUID; clients editing other client IDs return opaque 404 `'Client not found.'`; validates length limits ($\le 200$ chars); updates profile |
| `invoiceMilestoneAction` | Admin (`workflowSession('admin')`) | Validates milestone UUID, invokes atomic RPC `invoice_milestone_atomic` |

### 2.6 `lib/crm/ticket-upload-actions.ts` (1 Action)

| Action | Caller Role | Key Safeguards |
|---|---|---|
| `shareTicketFilesAction` | Client (own ticket) or Admin | Validates ticket ownership (foreign client ticket -> opaque 404 `'Ticket not found.'`); validates attachments; calls atomic RPC `attach_ticket_files_atomic`; revalidates admin and portal views |

---

## 3. Latent Action Governance

Three server actions remain compiled into the build manifest but are unimported in the current UI:
1. `uploadAssetAction` (`lib/crm/admin-actions.ts`): Superseded by client-direct presigned R2 uploads via `prepareAssetUploadAction`.
2. `getTicketAttachmentPresignAction` (`lib/crm/client-actions.ts`): Superseded by `POST /api/uploads/ticket-presign`.
3. `confirmTicketAttachmentAction` (`lib/crm/client-actions.ts`): Superseded by `shareTicketFilesAction`.

**Audit Finding**: Although latent, all three actions strictly enforce `requireAdmin()` or `requireClient()` prior to execution. An unauthorized caller sending synthetic Next.js Server Action requests (`Next-Action` HTTP header) cannot bypass access controls. These actions are scheduled for clean deprecation and removal in a future release wave after UI stability is confirmed across all browsers.

---

## 4. Verification Evidence

Automated test suite `tests/reliability/caller-inventory.test.mjs` (6 suites) confirms:
- **Build Manifest & Inventory Completeness**: Reads `.next/server/server-reference-manifest.json` and verifies that all registered server action entries map to real, exported functions and that all 8 API routes export valid HTTP handlers.
- **Admin Mutation Authority**: Proves that 15 representative admin actions fail closed with `{ error: 'Unauthorized.' }` when invoked anonymously, by clients, by deactivated admins (`is_active=false`), by stale-role admins (`profile.role !== 'admin'`), or when the database profile query errors.
- **Client Mutation Authority**: Proves that client actions reject unauthenticated callers, admin callers, and deactivated clients.
- **Anti-Enumeration Protection**: Proves that cross-client ticket interactions and foreign profile edits return opaque 404 errors (`'Ticket not found.'` / `'Client not found.'`) rather than 403s.
- **Bearer Route Protection**: Proves that `/api/revalidate`, `/api/cron/email-outbox`, and `/api/cron/r2-retention` enforce valid Bearer tokens and fail closed when tokens or configuration are missing.
- **Logout Route Boundary**: Proves that `/api/auth/logout` rejects cross-origin and origin-less POST requests with 403 while permitting benign browser GET bounces.
