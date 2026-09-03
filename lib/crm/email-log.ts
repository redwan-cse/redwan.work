import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { HANDOFF_MARKER } from '@/lib/email';
import type { EmailTemplate } from '@/lib/email/templates';

/**
 * Read side of `email_log` for the admin viewer (Phase 5b).
 *
 * Reads run on the service-role client like every other CRM module; the
 * admin-only SELECT policy on `email_log` is defence in depth. The page itself
 * is gated by the admin layout.
 */

export type EmailLogStatus = 'sent' | 'failed';

/**
 * Delivery confidence, derived rather than stored.
 *
 * `email_log.error` is polymorphic: a diagnostic on failed rows, and a handoff
 * marker on rows where an upstream system (Supabase Auth via SMTP) accepted the
 * request without giving us a provider id. The viewer must not render
 * `error IS NOT NULL` as a fault, so it collapses to this instead.
 */
export type EmailDelivery = 'confirmed' | 'handoff' | 'failed';

export interface EmailLogRow {
  id: string;
  to_email: string;
  template: EmailTemplate;
  entity_type: 'client' | 'ticket' | 'invoice' | 'deliverable' | null;
  entity_id: string | null;
  resend_id: string | null;
  status: EmailLogStatus;
  error: string | null;
  created_at: string;
  delivery: EmailDelivery;
}

export interface EmailLogFilters {
  template?: string;
  status?: string;
  email?: string;
}

export interface EmailLogPage {
  rows: EmailLogRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: { sent: number; failed: number };
}

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  'invite',
  'new-ticket',
  'reply-posted',
  'status-changed',
  'deliverable-uploaded',
  'invoice-issued',
  'payment-confirmed',
] as const;

export const EMAIL_STATUSES: readonly EmailLogStatus[] = ['sent', 'failed'] as const;

const PAGE_SIZE = 25;

function isTemplate(value: unknown): value is EmailTemplate {
  return typeof value === 'string' && (EMAIL_TEMPLATES as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is EmailLogStatus {
  return value === 'sent' || value === 'failed';
}

function classify(status: EmailLogStatus, error: string | null): EmailDelivery {
  if (status === 'failed') return 'failed';
  return error === HANDOFF_MARKER ? 'handoff' : 'confirmed';
}

/** Escape PostgREST `ilike` wildcards so a filter cannot widen its own match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listEmailLogs(
  page = 1,
  filters: EmailLogFilters = {}
): Promise<EmailLogPage> {
  const admin = getSupabaseAdmin();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  let query = admin
    .from('email_log')
    .select('id, to_email, template, entity_type, entity_id, resend_id, status, error, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE - 1);

  // Unknown filter values are ignored rather than rejected, matching the ticket
  // inbox's `?status=bogus` behaviour.
  if (isTemplate(filters.template)) query = query.eq('template', filters.template);
  if (isStatus(filters.status)) query = query.eq('status', filters.status);

  const email = filters.email?.trim();
  if (email) query = query.ilike('to_email', `%${escapeLike(email.toLowerCase())}%`);

  const [{ data, error, count }, sentCount, failedCount] = await Promise.all([
    query,
    admin.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    admin.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);

  if (error) {
    console.error('email_log query failed:', error.message);
    throw new Error('Email log is unavailable.');
  }

  const rows = ((data ?? []) as Array<Omit<EmailLogRow, 'delivery'>>).map((row) => ({
    ...row,
    delivery: classify(row.status, row.error),
  }));

  const total = count ?? rows.length;
  return {
    rows,
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { sent: sentCount.count ?? 0, failed: failedCount.count ?? 0 },
  };
}

/** Count of failed sends, for the overview badge. */
export async function countFailedEmails(): Promise<number> {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
