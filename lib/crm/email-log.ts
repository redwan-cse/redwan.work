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
 *
 * `unconfirmed` covers a `sent` row carrying an unrecognised diagnostic — the
 * viewer surfaces the text rather than swallowing it.
 */
export type EmailDelivery = 'confirmed' | 'handoff' | 'unconfirmed' | 'failed';

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
  template?: unknown;
  status?: unknown;
  email?: unknown;
}

export interface EmailLogPage {
  rows: EmailLogRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Counts for the active filter set, so header and pagination agree. */
  counts: { sent: number; failed: number };
  /** The filter values actually applied, after validation. */
  applied: { template?: EmailTemplate; status?: EmailLogStatus; email?: string };
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
const MAX_PAGE = 100_000;
const MAX_EMAIL_FILTER = 320;

/**
 * Query params arrive as `string | string[] | undefined`. A duplicated param
 * (`?email=a&email=b`) must be ignored, not crash the page.
 */
export function isTemplateFilter(value: unknown): value is EmailTemplate {
  return typeof value === 'string' && (EMAIL_TEMPLATES as readonly string[]).includes(value);
}

export function isStatusFilter(value: unknown): value is EmailLogStatus {
  return value === 'sent' || value === 'failed';
}

/** Narrow a raw query param to a usable single string, or undefined. */
export function emailFilterValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_EMAIL_FILTER);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Coerce a raw `page` param to a sane 1-based page number. */
export function pageNumber(value: unknown): number {
  const raw = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isSafeInteger(raw) || raw < 1) return 1;
  return Math.min(raw, MAX_PAGE);
}

function classify(status: EmailLogStatus, error: string | null): EmailDelivery {
  if (status === 'failed') return 'failed';
  if (error === HANDOFF_MARKER) return 'handoff';
  // A `sent` row with an unrecognised diagnostic: surface it, never swallow it.
  return error ? 'unconfirmed' : 'confirmed';
}

/**
 * Escape every PostgREST `ilike` metacharacter.
 *
 * PostgREST additionally rewrites `*` to `%` before parameterising the pattern,
 * so `*` must be escaped alongside SQL's own `%` and `_` or a filter widens its
 * own match.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_*]/g, (ch) => `\\${ch}`);
}

export async function listEmailLogs(
  page: unknown = 1,
  filters: EmailLogFilters = {}
): Promise<EmailLogPage> {
  const admin = getSupabaseAdmin();
  const safePage = pageNumber(page);

  // Unknown or duplicated filter values are ignored rather than rejected,
  // matching the ticket inbox's `?status=bogus` behaviour.
  const template = isTemplateFilter(filters.template) ? filters.template : undefined;
  const status = isStatusFilter(filters.status) ? filters.status : undefined;
  const email = emailFilterValue(filters.email);
  const applied = { template, status, email };
  const emailPattern = email ? `%${escapeLike(email.toLowerCase())}%` : undefined;

  let pageQuery = admin
    .from('email_log')
    .select('id, to_email, template, entity_type, entity_id, resend_id, status, error, created_at', {
      count: 'exact',
    });
  if (template) pageQuery = pageQuery.eq('template', template);
  if (status) pageQuery = pageQuery.eq('status', status);
  if (emailPattern) pageQuery = pageQuery.ilike('to_email', emailPattern);

  // Counts share the active filters so the header and the pagination line agree.
  let sentQuery = admin.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'sent');
  if (template) sentQuery = sentQuery.eq('template', template);
  if (emailPattern) sentQuery = sentQuery.ilike('to_email', emailPattern);

  let failedQuery = admin.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'failed');
  if (template) failedQuery = failedQuery.eq('template', template);
  if (emailPattern) failedQuery = failedQuery.ilike('to_email', emailPattern);

  const [{ data, error, count }, sentCount, failedCount] = await Promise.all([
    // `created_at` alone is not unique; the id tiebreaker keeps paging stable.
    pageQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE - 1),
    sentQuery,
    failedQuery,
  ]);

  if (error) {
    // A page past the end is not a fault — PostgREST reports it as an
    // unsatisfiable range. Show an empty page instead of a 500.
    if (error.code === 'PGRST103') {
      const total = failedCount.count !== null && sentCount.count !== null
        ? (sentCount.count ?? 0) + (failedCount.count ?? 0)
        : 0;
      return {
        rows: [],
        total,
        page: safePage,
        pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        counts: { sent: sentCount.count ?? 0, failed: failedCount.count ?? 0 },
        applied,
      };
    }
    // Never echo the operator's search term into the logs.
    console.error('email_log query failed:', error.message.slice(0, 200));
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
    applied,
  };
}

/** Count of failed sends, for the overview badge. Null when the count fails. */
export async function countFailedEmails(): Promise<number | null> {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');
    if (error) {
      console.error('email_log failed-count query failed:', error.message.slice(0, 200));
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error('email_log failed-count threw:', err instanceof Error ? err.message : err);
    return null;
  }
}
