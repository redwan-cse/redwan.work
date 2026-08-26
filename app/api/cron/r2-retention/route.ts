// app/api/cron/r2-retention/route.ts
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  CONTACT_RETENTION_DAYS,
  deletePrivateObjects,
  isR2Configured,
  listPrivateContactObjects,
  staleObjectKeys,
} from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Daily retention sweep for contact-form attachments.
 *
 * Usage:
 * GET /api/cron/r2-retention
 * Authorization: Bearer CRON_SECRET
 *
 * Vercel Cron invokes this daily (see vercel.json) and automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
 *
 * Deletes objects under `contact/` in the private bucket older than
 * CONTACT_RETENTION_DAYS unless their key is flagged `retained: true` on the
 * owning lead. Every failure path aborts before any deletion runs.
 */

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  const provided = Buffer.from(match[1], 'utf-8');
  const secret = Buffer.from(expected, 'utf-8');

  // timingSafeEqual requires equal-length buffers; lengths alone leak
  // nothing useful here, and unequal length short-circuits safely
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: 'Invalid or missing credentials' },
      { status: 401 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { message: 'Attachment storage is not configured.' },
      { status: 503 }
    );
  }

  try {
    const cutoff = new Date(
      Date.now() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const { data, error } = await getSupabaseAdmin()
      .from('leads')
      .select('attachments')
      .filter('attachments', 'cs', JSON.stringify([{ retained: true }]));
    if (error) throw new Error(error.message);

    const retainedKeys = new Set<string>();
    for (const row of data ?? []) {
      const entries = Array.isArray(row.attachments)
        ? (row.attachments as { key?: unknown; retained?: unknown }[])
        : [];
      for (const entry of entries) {
        if (entry.retained === true && typeof entry.key === 'string') {
          retainedKeys.add(entry.key);
        }
      }
    }

    const objects = await listPrivateContactObjects();
    const stale = staleObjectKeys(objects, cutoff, retainedKeys);
    const deleted = await deletePrivateObjects(stale);

    return NextResponse.json({ deleted, examined: objects.length });
  } catch (err) {
    return NextResponse.json(
      { message: 'Retention sweep failed', error: String(err) },
      { status: 500 }
    );
  }
}
