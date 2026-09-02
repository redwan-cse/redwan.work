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
 * Every send is recorded in `email_log` — one row per attempt, `status` either
 * `sent` or `failed`. Sends are fail-soft: a provider outage or missing
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
    const { error } = await getSupabaseAdmin().from('email_log').insert({
      to_email: truncate(input.to, MAX_LOGGED_EMAIL),
      template: input.template,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      resend_id: input.resendId ?? null,
      status: input.status,
      error: input.error ? truncate(input.error, MAX_LOGGED_ERROR) : null,
    });
    if (error) console.error('email_log insert failed:', error.message);
  } catch (err) {
    console.error('email_log insert threw:', normalizeError(err));
  }
}

async function deliver(to: string, rendered: RenderedEmail): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Email is not configured');

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const send = resend.emails.send({ from, to, subject: rendered.subject, html: rendered.html });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Email provider timeout')), SEND_TIMEOUT_MS);
  });

  const { data, error } = await Promise.race([send, timeout]);
  if (error) throw new Error(error.message);
  return { id: data?.id ?? null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Send one lifecycle email and log the attempt. Never throws.
 */
export async function sendEmail(input: {
  to: string;
  template: EmailTemplate;
  rendered: RenderedEmail;
  entityType?: EmailEntityType;
  entityId?: string;
}): Promise<EmailSendResult> {
  const to = input.to.trim().toLowerCase();

  if (!EMAIL_RE.test(to)) {
    await recordSend({ ...input, to: to || 'unknown', status: 'failed', error: 'Invalid recipient address' });
    return { ok: false, error: 'Invalid recipient address' };
  }

  if (!isEmailConfigured()) {
    await recordSend({ ...input, to, status: 'failed', error: 'Email is not configured' });
    return { ok: false, error: 'Email is not configured' };
  }

  try {
    const { id } = await deliver(to, input.rendered);
    await recordSend({ ...input, to, resendId: id, status: 'sent' });
    return { ok: true, resendId: id };
  } catch (err) {
    const message = normalizeError(err);
    console.error(`email send failed (${input.template}):`, message);
    await recordSend({ ...input, to, status: 'failed', error: message });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Per-event helpers. Each renders its template and delegates to sendEmail.
// ---------------------------------------------------------------------------

export function sendInviteEmail(input: {
  to: string;
  name?: string | null;
  inviteLink: string;
  clientId?: string;
}): Promise<EmailSendResult> {
  return sendEmail({
    to: input.to,
    template: 'invite',
    rendered: renderInvite({ name: input.name, inviteLink: input.inviteLink }),
    entityType: 'client',
    entityId: input.clientId,
  });
}

export function sendNewTicketEmail(input: {
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

export function sendReplyPostedEmail(input: {
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

export function sendStatusChangedEmail(input: {
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

export function sendDeliverableUploadedEmail(input: {
  to: string;
  fileId?: string;
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

export function sendInvoiceIssuedEmail(input: {
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

export function sendPaymentConfirmedEmail(input: {
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
 * Fire-and-forget wrapper for call sites that must not await delivery.
 * Errors are already logged inside sendEmail; this only guards the promise.
 */
export function queueEmail(send: Promise<EmailSendResult>): void {
  void send.catch((err) => console.error('email dispatch threw:', normalizeError(err)));
}
