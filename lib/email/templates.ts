import 'server-only';

/**
 * Lifecycle email templates.
 *
 * Plain HTML strings (no React Email dependency) so the send path stays a single
 * server-only module. Every template escapes interpolated values — subjects,
 * names, and filenames are user-supplied and must never reach the HTML raw.
 *
 * PII rule: templates receive only what the recipient already knows (their own
 * ticket subject, their own invoice number). Nothing here is logged; only the
 * template name and recipient land in `email_log`.
 */

export type EmailTemplate =
  | 'invite'
  | 'new-ticket'
  | 'reply-posted'
  | 'status-changed'
  | 'deliverable-uploaded'
  | 'invoice-issued'
  | 'payment-confirmed';

const BRAND = 'redwan.work';
const MAX_PREVIEW = 300;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(heading: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">',
    `<h1 style="margin:0 0 16px;font-size:19px;line-height:1.35">${escapeHtml(heading)}</h1>`,
    bodyHtml,
    button,
    `<hr style="border:none;border-top:1px solid #e6e8eb;margin:26px 0 14px">`,
    `<p style="margin:0;font-size:12px;color:#6b7280">${escapeHtml(BRAND)} — this is an automated message; replies to this address are not monitored.</p>`,
    '</div></body></html>',
  ].join('');
}

function para(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${escapeHtml(text)}</p>`;
}

function quote(text: string): string {
  const clipped = text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}…` : text;
  return `<blockquote style="margin:0 0 12px;padding:10px 14px;background:#f6f7f9;border-left:3px solid #d1d5db;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(clipped)}</blockquote>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function renderNewTicket(input: {
  ticketNumber: number;
  subject: string;
  clientName?: string | null;
  ticketLink: string;
}): RenderedEmail {
  const who = input.clientName?.trim() || 'A client';
  return {
    subject: `#TKT-${input.ticketNumber} — new ticket: ${input.subject}`,
    html: shell(
      `New ticket #TKT-${input.ticketNumber}`,
      [para(`${who} opened a ticket.`), para(`Subject: ${input.subject}`)].join(''),
      { label: 'Open ticket', url: input.ticketLink }
    ),
  };
}

export function renderReplyPosted(input: {
  ticketNumber: number;
  subject: string;
  authorName?: string | null;
  bodyPreview: string;
  ticketLink: string;
}): RenderedEmail {
  const who = input.authorName?.trim() || 'Someone';
  return {
    subject: `#TKT-${input.ticketNumber} — new reply: ${input.subject}`,
    html: shell(
      `New reply on #TKT-${input.ticketNumber}`,
      [para(`${who} replied to this ticket.`), quote(input.bodyPreview)].join(''),
      { label: 'View thread', url: input.ticketLink }
    ),
  };
}

const STATUS_COPY: Record<string, string> = {
  open: 'Open',
  answered: 'Answered',
  awaiting_client: 'Awaiting your reply',
  closed: 'Closed',
};

export function renderStatusChanged(input: {
  ticketNumber: number;
  subject: string;
  status: string;
  ticketLink: string;
}): RenderedEmail {
  const label = STATUS_COPY[input.status] ?? input.status;
  return {
    subject: `#TKT-${input.ticketNumber} — status: ${label}`,
    html: shell(
      `Ticket #TKT-${input.ticketNumber} is now ${label}`,
      [para(`Subject: ${input.subject}`), para(`The status changed to: ${label}`)].join(''),
      { label: 'View ticket', url: input.ticketLink }
    ),
  };
}

export function renderDeliverableUploaded(input: {
  projectName: string;
  filename: string;
  filesLink: string;
}): RenderedEmail {
  return {
    subject: `New file in ${input.projectName}`,
    html: shell(
      'A new file is available',
      [para(`Project: ${input.projectName}`), para(`File: ${input.filename}`)].join(''),
      { label: 'Open files', url: input.filesLink }
    ),
  };
}

export function renderInvoiceIssued(input: {
  invoiceNumber: number;
  amountLabel: string;
  dueLabel?: string | null;
  invoiceLink: string;
}): RenderedEmail {
  const lines = [para(`Invoice #INV-${input.invoiceNumber} is ready.`), para(`Amount due: ${input.amountLabel}`)];
  if (input.dueLabel) lines.push(para(`Due: ${input.dueLabel}`));
  return {
    subject: `Invoice #INV-${input.invoiceNumber} — ${input.amountLabel}`,
    html: shell(`Invoice #INV-${input.invoiceNumber}`, lines.join(''), {
      label: 'View invoice',
      url: input.invoiceLink,
    }),
  };
}

export function renderPaymentConfirmed(input: {
  invoiceNumber: number;
  amountLabel: string;
  outstandingLabel?: string | null;
  invoiceLink: string;
}): RenderedEmail {
  const lines = [
    para(`Your payment of ${input.amountLabel} for invoice #INV-${input.invoiceNumber} is confirmed.`),
  ];
  if (input.outstandingLabel) lines.push(para(`Remaining balance: ${input.outstandingLabel}`));
  else lines.push(para('This invoice is fully paid. Thank you.'));
  return {
    subject: `Payment confirmed — invoice #INV-${input.invoiceNumber}`,
    html: shell('Payment confirmed', lines.join(''), {
      label: 'View invoice',
      url: input.invoiceLink,
    }),
  };
}
