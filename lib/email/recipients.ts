import 'server-only';

import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Recipient and link resolution for lifecycle emails (Phase 5b).
 *
 * Kept out of `lib/email/index.ts` so the send path stays free of CRM queries,
 * and out of the action modules so the 7 call sites do not each re-derive an
 * origin or re-join profiles to auth users.
 *
 * Every lookup here is best-effort: a missing recipient returns null and the
 * caller skips the send. Notification plumbing never breaks its trigger.
 */

/**
 * Absolute origin for links in emails.
 *
 * `NEXT_PUBLIC_SITE_URL` comes first, deliberately: an email link is a permanent
 * artifact in someone else's inbox, and a client-triggered request can produce an
 * admin-bound link (new-ticket, client reply). Deriving that origin from a
 * request header would let one party's request shape the other party's link.
 * Request headers remain the fallback for local development, where the env var is
 * often unset.
 */
export async function emailOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    // No request scope (cron, script) — fall through to the production host.
  }
  return 'https://redwan.work';
}

/** Email address for a profile id, or null when the auth user is gone. */
export async function recipientEmail(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    if (error) {
      console.error('email recipient lookup failed:', error.message);
      return null;
    }
    return data?.user?.email ?? null;
  } catch (err) {
    console.error('email recipient lookup threw:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Display name for a profile id; null when unset. Never throws. */
export async function recipientName(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await getSupabaseAdmin()
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    const name = (data as { full_name: string | null } | null)?.full_name;
    return name?.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Every active admin's email address. Used for admin-directed notifications
 * (new ticket, client reply) so the alert does not depend on one hardcoded
 * address. Returns [] when none resolve.
 */
export async function adminRecipients(): Promise<string[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);
    if (error) {
      console.error('admin recipient lookup failed:', error.message);
      return [];
    }
    const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    const emails: string[] = [];
    for (const id of ids) {
      const email = await recipientEmail(id);
      if (email) emails.push(email);
    }
    return emails;
  } catch (err) {
    console.error('admin recipient lookup threw:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Ticket fields needed by the three ticket templates. Null when not found. */
export async function ticketEmailContext(ticketId: string): Promise<
  { ticketId: string; ticketNumber: number; subject: string; clientId: string } | null
> {
  if (!ticketId) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('tickets')
      .select('id, number, subject, client_id')
      .eq('id', ticketId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string; number: number; subject: string; client_id: string };
    return {
      ticketId: row.id,
      ticketNumber: row.number,
      subject: row.subject,
      clientId: row.client_id,
    };
  } catch {
    return null;
  }
}

/** Money formatting for invoice emails. Falls back to a plain decimal string. */
export function formatMoney(cents: number, currency: string): string {
  const amount = Number.isFinite(cents) ? cents / 100 : 0;
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
