# Phase 5b — Lifecycle Emails Implementation Plan

> **Goal:** Implement lifecycle email sending for 7 events (invite, new-ticket, reply-posted, status-changed, deliverable-uploaded, invoice-issued, payment-confirmed) using Resend API, with logging to `email_log` table and an admin viewer.

> **Prerequisites:** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must be set in `.env.local` and Vercel.

## Architecture

- Email sending via Resend API (`resend` npm package)
- All sends logged to `email_log` table (UUID, to_email, template, entity_type, entity_id, resend_id, status, error, created_at)
- Emails are sent asynchronously after the action completes (fire-and-forget, errors logged but don't block the main action)
- Admin viewer at `/admin/emails` with filtering and pagination

## Tasks

### Task 1: Migration 0016 — email_log table and RLS

**Files:** `supabase/migrations/0016_email_log.sql`

**Schema:**
```sql
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null, -- 'invite'|'new-ticket'|'reply-posted'|'status-changed'|'deliverable-uploaded'|'invoice-issued'|'payment-confirmed'
  entity_type text,      -- 'client'|'ticket'|'invoice'|'deliverable'
  entity_id uuid,
  resend_id text,        -- Resend response id
  status text not null,  -- 'sent'|'failed'
  error text,            -- error message if failed
  created_at timestamptz default now()
);

-- RLS: admins can select all, service-role can insert
alter table public.email_log enable row level security;
create policy "email_log_admin_select" on public.email_log for select using (public.is_admin());
```

**Probes:** Insert a log row with service-role, confirm admin can select.

### Task 2: Email sending utilities

**Files:** `lib/email/index.ts`, `lib/email/templates.ts`

**Functions:**
- `sendEmail({ to, template, data, entityType, entityId }): Promise<{ ok: true; resendId: string } | { ok: false; error: string }>`
- `sendInviteEmail(to: string, name: string, inviteLink: string)`
- `sendNewTicketEmail(to: string, ticketNumber: number, subject: string, clientName: string)`
- `sendReplyPostedEmail(to: string, ticketNumber: number, replyAuthor: string, bodyPreview: string)`
- `sendStatusChangedEmail(to: string, ticketNumber: number, newStatus: string)`
- `sendDeliverableUploadedEmail(to: string, projectName: string, filename: string)`
- `sendInvoiceIssuedEmail(to: string, invoiceNumber: number, total: number, invoiceLink: string)`
- `sendPaymentConfirmedEmail(to: string, invoiceNumber: number, amount: number)`

Templates are simple text/HTML emails using React Email or plain string templates (we'll start with plain text for simplicity, but can later move to React Email). We'll use `resend.emails.send` with `from`, `to`, `subject`, `html` (and optional text).

### Task 3: Integrate into existing actions

**Files to modify:**
- `lib/crm/clients.ts`: `inviteClient` — log invite email after Supabase auth invite (or use the existing invite flow)
- `lib/crm/tickets.ts`: `createTicket` — send new-ticket email to admin
- `lib/crm/tickets.ts`: `adminReply` / `clientReply` — send reply-posted email to the other party
- `lib/crm/tickets.ts`: `setTicketStatus` — send status-changed email to client when admin changes status (or all changes?)
- `lib/crm/admin-actions.ts`: `confirmDeliverableAction` — send deliverable-uploaded email to client
- `lib/crm/invoices.ts`: `sendInvoice` — send invoice-issued email to client
- `lib/crm/invoices.ts`: `confirmPayment` — send payment-confirmed email to client

**Integration pattern:** After the main action succeeds, call the email function in a non-blocking way (e.g., `sendEmail(...).catch(console.error)`). The email send should not fail the action.

### Task 4: Admin email log viewer

**Files:** `app/(admin)/admin/emails/page.tsx`, `lib/crm/email-log.ts`

**Module:** `lib/crm/email-log.ts` with `listEmailLogs(page, limit, filters)`.

**UI:** Table with columns: created_at, to_email, template, entity, status, error (if failed). Pagination and basic filters (by email, template, status). Only accessible to admin users.

### Task 5: Documentation and commit

Update `docs/crm/README.md` and `docs/email/README.md` with email flow description.

## Global Constraints

- Gate after each task: `npm run lint && npx tsc --noEmit && npm run build`.
- Branch: `feat/p5b-lifecycle-emails`; commits per task; no push/merge to main without explicit confirmation.
- Migrations forward-only; new work in `0016_email_log.sql`.
- Never log PII beyond what is necessary for the log (to_email is already PII, but it's needed for audit).
- Never expose error details to client; log server-side.

## Audit Coverage

| Event | Trigger | Recipient |
|-------|---------|-----------|
| invite | `inviteClient` (after auth invite) | client |
| new-ticket | `createTicket` (client creates) | admin |
| reply-posted | any reply (admin/client) | other party (client/admin) |
| status-changed | admin changes ticket status | client |
| deliverable-uploaded | admin confirms deliverable | client |
| invoice-issued | admin sends invoice | client |
| payment-confirmed | admin confirms payment | client |

## Verification

- Ensure all 7 events send emails when actions occur.
- Check `email_log` table has rows for each send.
- Admin email log viewer shows logs with correct data.
- Failures (e.g., invalid email, Resend error) are logged with status 'failed'.