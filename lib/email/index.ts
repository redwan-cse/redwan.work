import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  renderDeliverableUploaded,
  renderInvite,
  renderInvoiceIssued,
  renderNewTicket,
  renderPaymentConfirmed,
  renderReplyPosted,
  renderStatusChanged,
  type EmailTemplate,
  type RenderedEmail,
} from '@/lib/email/templates';

/**
 * Lifecycle email send path (Phase 5b).
 *
 * Every lifecycle event is recorded in `email_log` — one row per event, `status`
 * either `sent` or `failed`, including events that never reached the provider
 * (see `recordUnsent`). Sends are fail-soft: a provider outage or missing
 * configuration never breaks the action that triggered the email. Callers get a
 * result they may ignore.
 *
 * Logged fields are deliberately narrow: recipient, template, entity pointer,
 * provider id, and a truncated error. Subjects, bodies, filenames, and any other
 * message content never reach the log.
 */

export type EmailSendResult = { ok: true; resendId: string | null } | { ok: false; error: string };

export type EmailEntityType = 'client' | 'ticket' | 'invoice' | 'deliverable';

const MAX_LOGGED_EMAIL = 320;
const MAX_LOGGED_ERROR = 500;
const SEND_TIMEOUT_MS = 10_000;
const LOG_TIMEOUT_MS = 5_000;

/**
 * Written into `email_log.error` for rows where an upstream system (Supabase
 * Auth via the Resend SMTP relay) accepted the request but this app never
 * observed a provider id. The admin viewer labels these as handed off rather
 * than confirmed delivered.
 */
export const HANDOFF_MARKER = 'handoff: upstream provider accepted; delivery not observed';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown email error';
  return truncate(raw, MAX_LOGGED_ERROR);
}

async function recordSend(input: {
  to: string;
  template: EmailTemplate;
  entityType?: EmailEntityType;
  entityId?: string;
  resendId?: string | null;
  status: 'sent' | 'failed';
  error?: string;
}): Promise<void> {
  try {
    const insert = getSupabaseAdmin().from('email_log').insert({
      to_email: truncate(input.to, MAX_LOGGED_EMAIL),
      template: input.template,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      resend_id: input.resendId ?? null,
      status: input.status,
      error: input.error ? truncate(input.error, MAX_LOGGED_ERROR) : null,
    });

    // A stalled audit insert must not stall the action being audited.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('email_log insert timeout')), LOG_TIMEOUT_MS);
    });
    try {
      const { error } = await Promise.race([insert, timeout]);
      if (error) console.error('email_log insert failed:', error.message);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    console.error('email_log insert threw:', normalizeError(err));
  }
}

let resendClient: { key: string; client: { emails: { send: (payload: { from: string; to: string; subject: string; html: string }) => Promise<{ data: { id: string } | null; error: { name?: string; message: string } | null }> } } } | null = null;

async function getResend(apiKey: string) {
  if (resendClient?.key === apiKey) return resendClient.client;
  const { Resend } = await import('resend');
  const client = new Resend(apiKey) as unknown as NonNullable<typeof resendClient>['client'];
  resendClient = { key: apiKey, client };
  return client;
}

async function deliver(to: string, rendered: RenderedEmail): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Email is not configured');

  const resend = await getResend(apiKey);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const send = resend.emails.send({ from, to, subject: rendered.subject, html: rendered.html });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Email provider timeout')), SEND_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([send, timeout]);
    if (error) throw new Error(`${error.name ?? 'provider_error'}: ${error.message}`);
    return { id: data?.id ?? null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Send one lifecycle email and log the attempt.
 *
 * Never throws and never rejects: every failure path returns `ok: false` and
 * writes a `failed` row. Callers may ignore the result.
 */
export async function sendEmail(input: {
  to: string;
  template: EmailTemplate;
  rendered: RenderedEmail;
  entityType?: EmailEntityType;
  entityId?: string;
}): Promise<EmailSendResult> {
  // Values arrive from DB rows; a non-string here must not throw past the guard.
  const to = typeof input.to === 'string' ? input.to.trim().toLowerCase() : '';

  if (!EMAIL_RE.test(to)) {
    await recordSend({
      to: to || 'unknown',
      template: input.template,
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'failed',
      error: 'Invalid recipient address',
    });
    return { ok: false, error: 'Invalid recipient address' };
  }

  if (!isEmailConfigured()) {
    await recordSend({
      to,
      template: input.template,
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'failed',
      error: 'Email is not configured',
    });
    return { ok: false, error: 'Email is not configured' };
  }

  try {
    const { id } = await deliver(to, input.rendered);
    await recordSend({
      to,
      template: input.template,
      entityType: input.entityType,
      entityId: input.entityId,
      resendId: id,
      status: 'sent',
    });
    return { ok: true, resendId: id };
  } catch (err) {
    const message = normalizeError(err);
    console.error(`email send failed (${input.template}):`, message);
    await recordSend({
      to,
      template: input.template,
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Per-event helpers. Each renders its template and delegates to sendEmail.
// ---------------------------------------------------------------------------

export async function sendInviteEmail(input: {
  to: string;
  name?: string | null;
  inviteLink: string;
  clientId: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'invite',
    rendered: renderInvite({ name: input.name, inviteLink: input.inviteLink }),
    entityType: 'client',
    entityId: input.clientId,
  });
}

export async function sendNewTicketEmail(input: {
  to: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  clientName?: string | null;
  ticketLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'new-ticket',
    rendered: renderNewTicket({
      ticketNumber: input.ticketNumber,
      subject: input.subject,
      clientName: input.clientName,
      ticketLink: input.ticketLink,
    }),
    entityType: 'ticket',
    entityId: input.ticketId,
  });
}

export async function sendReplyPostedEmail(input: {
  to: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  authorName?: string | null;
  bodyPreview: string;
  ticketLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'reply-posted',
    rendered: renderReplyPosted({
      ticketNumber: input.ticketNumber,
      subject: input.subject,
      authorName: input.authorName,
      bodyPreview: input.bodyPreview,
      ticketLink: input.ticketLink,
    }),
    entityType: 'ticket',
    entityId: input.ticketId,
  });
}

export async function sendStatusChangedEmail(input: {
  to: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  status: string;
  ticketLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'status-changed',
    rendered: renderStatusChanged({
      ticketNumber: input.ticketNumber,
      subject: input.subject,
      status: input.status,
      ticketLink: input.ticketLink,
    }),
    entityType: 'ticket',
    entityId: input.ticketId,
  });
}

export async function sendDeliverableUploadedEmail(input: {
  to: string;
  fileId: string;
  projectName: string;
  filename: string;
  filesLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'deliverable-uploaded',
    rendered: renderDeliverableUploaded({
      projectName: input.projectName,
      filename: input.filename,
      filesLink: input.filesLink,
    }),
    entityType: 'deliverable',
    entityId: input.fileId,
  });
}

export async function sendInvoiceIssuedEmail(input: {
  to: string;
  invoiceId: string;
  invoiceNumber: number;
  amountLabel: string;
  dueLabel?: string | null;
  invoiceLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'invoice-issued',
    rendered: renderInvoiceIssued({
      invoiceNumber: input.invoiceNumber,
      amountLabel: input.amountLabel,
      dueLabel: input.dueLabel,
      invoiceLink: input.invoiceLink,
    }),
    entityType: 'invoice',
    entityId: input.invoiceId,
  });
}

export async function sendPaymentConfirmedEmail(input: {
  to: string;
  invoiceId: string;
  invoiceNumber: number;
  amountLabel: string;
  outstandingLabel?: string | null;
  invoiceLink: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'payment-confirmed',
    rendered: renderPaymentConfirmed({
      invoiceNumber: input.invoiceNumber,
      amountLabel: input.amountLabel,
      outstandingLabel: input.outstandingLabel,
      invoiceLink: input.invoiceLink,
    }),
    entityType: 'invoice',
    entityId: input.invoiceId,
  });
}

/**
 * Record a send performed by another system as an audit row.
 *
 * Supabase Auth mails its own credential-bearing messages (invite,
 * set-password, reset) through the Resend SMTP relay, so this app never renders
 * or transmits them. Logging them here keeps the admin viewer's lifecycle view
 * complete; `resend_id` is null because the id belongs to the SMTP transaction,
 * not to an API call we made.
 *
 * **What `status: 'sent'` means here:** the upstream provider accepted the
 * request — not that the message was rendered, relayed, or delivered. That is a
 * weaker claim than a `sent` row written by `sendEmail`, which has a provider id
 * to back it. The `handoff` marker is written into `error` so the admin viewer
 * can label the difference rather than implying delivery we never observed.
 *
 * Never throws.
 */
export async function recordExternalSend(input: {
  to: string;
  template: EmailTemplate;
  entityType?: EmailEntityType;
  entityId?: string;
  status?: 'sent' | 'failed';
  error?: string;
}): Promise<void> {
  const candidate = typeof input.to === 'string' ? input.to.trim().toLowerCase() : '';
  const to = EMAIL_RE.test(candidate) ? candidate : 'unknown';
  const status = input.status ?? 'sent';
  await recordSend({
    to,
    template: input.template,
    entityType: input.entityType,
    entityId: input.entityId,
    status,
    // A handed-off success carries no provider id; mark it so the viewer does
    // not present it as confirmed delivery.
    error: input.error ?? (status === 'sent' ? HANDOFF_MARKER : undefined),
  });
}

/**
 * Record a lifecycle event that never reached the provider.
 *
 * Recipient or context resolution can fail before any send is attempted — no
 * active admin to notify, a deleted auth user, an unreadable ticket. Those
 * events still belong in the audit trail: an operator debugging "the client
 * says no email arrived" must be able to tell "resolution failed" from "never
 * triggered". Writes a `failed` row and returns the matching result so a
 * `queueEmail` thunk can hand it straight back.
 */
export async function recordUnsent(input: {
  template: EmailTemplate;
  reason: string;
  to?: string;
  entityType?: EmailEntityType;
  entityId?: string;
}): Promise<EmailSendResult> {
  const candidate = typeof input.to === 'string' ? input.to.trim().toLowerCase() : '';
  await recordSend({
    to: EMAIL_RE.test(candidate) ? candidate : 'unknown',
    template: input.template,
    entityType: input.entityType,
    entityId: input.entityId,
    status: 'failed',
    error: input.reason,
  });
  return { ok: false, error: input.reason };
}

/**
 * Fan one lifecycle email out to several recipients.
 *
 * Every recipient is attempted regardless of the others' outcomes (each already
 * writes its own `email_log` row). The aggregate result is `ok` only when every
 * recipient succeeded, so a partial failure is not reported as success.
 */
export async function sendToAll(
  recipients: string[],
  send: (to: string) => Promise<EmailSendResult>,
  /** Written as a `failed` row when there is no one to send to. */
  unsent?: { template: EmailTemplate; entityType?: EmailEntityType; entityId?: string }
): Promise<EmailSendResult> {
  if (recipients.length === 0) {
    if (unsent) {
      return recordUnsent({ ...unsent, reason: 'No active admin recipients' });
    }
    return { ok: false, error: 'No recipients' };
  }

  const settled = await Promise.allSettled(recipients.map((to) => send(to)));
  const failures: string[] = [];
  let firstId: string | null = null;

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      failures.push(normalizeError(outcome.reason));
    } else if (!outcome.value.ok) {
      failures.push(outcome.value.error);
    } else if (firstId === null) {
      firstId = outcome.value.resendId;
    }
  }

  if (failures.length > 0) {
    return { ok: false, error: `${failures.length}/${recipients.length} failed: ${failures[0]}` };
  }
  return { ok: true, resendId: firstId };
}

/**
 * Schedule a lifecycle email without blocking the response.
 *
 * Takes a thunk, not a promise: a render error thrown while building the
 * arguments is caught here instead of escaping synchronously past the caller.
 *
 * On Vercel, a bare floating promise may be dropped when the response
 * completes — which would lose both the email and its `email_log` row. `after()`
 * hands the work to the runtime so it is allowed to finish. If `after()` is
 * unavailable (outside a request scope, e.g. cron or a script), fall back to a
 * guarded floating promise.
 */
export function queueEmail(send: () => Promise<EmailSendResult>): void {
  const run = async () => {
    try {
      await send();
    } catch (err) {
      console.error('email dispatch threw:', normalizeError(err));
    }
  };

  try {
    // Imported lazily: `after` throws outside a request/response scope.
    const { after } = require('next/server') as { after: (task: () => Promise<void>) => void };
    after(run);
  } catch {
    void run();
  }
}
