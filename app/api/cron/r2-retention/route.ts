// app/api/cron/r2-retention/route.ts
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  CONTACT_RETENTION_DAYS,
  ARCHIVE_PREFIX,
  deletePrivateObjects,
  isR2Configured,
  listPrivateContactObjects,
  listPrivateObjects,
  staleObjectKeys,
} from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Daily retention sweep for private-bucket objects.
 *
 * Usage:
 * GET /api/cron/r2-retention
 * Authorization: Bearer CRON_SECRET
 *
 * Vercel Cron invokes this daily (see vercel.json) and automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
 *
 * Stages (each isolated; one failure does not skip the rest):
 *  0. Contact purge: objects under `contact/` older than CONTACT_RETENTION_DAYS
 *     unless the owning lead flags the key `retained: true`.
 *  1. Archive purge: objects under `archive/` older than 30 days.
 *  2. Project purge: archived projects (archived_at < now - 30 days) — collect
 *     their deliverable r2_keys + archive_key, delete those objects, then delete
 *     the project row (cascades milestones/files).
 *  3. Pending-attachment cleanup: rows (kind attachment, ticket_id null, created_at
 *     > 24h) delete objects + rows; plus `pending/`-prefix objects older than 24h
 *     with no files row are deleted.
 *
 * Responds { deleted, examined, ...stage counts } with 200.
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

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    return NextResponse.json(
      { message: 'Retention sweep failed', error: String(err) },
      { status: 500 }
    );
  }

  const result: {
    deleted: number;
    examined: number;
    archivePurged?: number;
    projectsPurged?: number;
    pendingCleaned?: number;
    errors?: string[];
  } = { deleted: 0, examined: 0, errors: [] };

  const day = 24 * 60 * 60 * 1000;

  // Stage 0 — contact purge (unchanged)
  try {
    const cutoff = new Date(Date.now() - CONTACT_RETENTION_DAYS * day);

    const { data, error } = await admin
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

    result.deleted = deleted;
    result.examined = objects.length;
  } catch (err) {
    result.errors?.push(`contact: ${String(err)}`);
  }

  // Stage 1 — archive purge: archive/ objects older than 30 days
  try {
    const cutoff = new Date(Date.now() - 30 * day);
    const objects = await listPrivateObjects(ARCHIVE_PREFIX);
    const stale = objects
      .filter((o) => o.lastModified < cutoff)
      .map((o) => o.key);
    result.archivePurged = await deletePrivateObjects(stale);
  } catch (err) {
    result.errors?.push(`archive: ${String(err)}`);
  }

  // Stage 2 — project purge: archived_at < now - 30 days
  try {
    const cutoffIso = new Date(Date.now() - 30 * day).toISOString();
    const { data: projects, error: projError } = await admin
      .from('projects')
      .select('id, archive_key')
      .lt('archived_at', cutoffIso)
      .not('archived_at', 'is', null);
    if (projError) throw new Error(projError.message);

    let purged = 0;
    for (const project of (projects ?? []) as Array<{ id: string; archive_key: string | null }>) {
      const keys: string[] = [];

      const { data: files, error: filesError } = await admin
        .from('files')
        .select('r2_key')
        .eq('project_id', project.id)
        .eq('kind', 'deliverable');
      if (filesError) throw new Error(filesError.message);
      for (const f of (files ?? []) as Array<{ r2_key: string }>) {
        if (f.r2_key) keys.push(f.r2_key);
      }
      if (project.archive_key) keys.push(project.archive_key);

      if (keys.length > 0) {
        await deletePrivateObjects(keys);
      }

      const { error: delError } = await admin.from('projects').delete().eq('id', project.id);
      if (delError) throw new Error(delError.message);
      purged += 1;
    }
    result.projectsPurged = purged;
  } catch (err) {
    result.errors?.push(`project: ${String(err)}`);
  }

  // Stage 3 — pending-attachment cleanup: orphan rows + pending/ objects
  try {
    let cleaned = 0;

    // (a) orphan rows: kind attachment, ticket_id null, created_at < 24h ago
    const cutoff = new Date(Date.now() - day).toISOString();
    const { data: orphanRows, error: rowError } = await admin
      .from('files')
      .select('id, r2_key')
      .eq('kind', 'attachment')
      .is('ticket_id', null)
      .lt('created_at', cutoff);
    if (rowError) throw new Error(rowError.message);

    for (const row of (orphanRows ?? []) as Array<{ id: string; r2_key: string }>) {
      if (row.r2_key) {
        await deletePrivateObjects([row.r2_key]);
      }
      const { error: delError } = await admin.from('files').delete().eq('id', row.id);
      if (delError) throw new Error(delError.message);
      cleaned += 1;
    }

    // (b) pending/ objects older than 24h with no files row.
    // Pending keys live under `private/{userId}/pending/...`, so list the
    // whole private prefix and filter for the /pending/ segment.
    const privateObjects = await listPrivateObjects('private/');
    const pendingCutoff = new Date(Date.now() - day);
    const stalePending = privateObjects
      .filter((o) => o.key.includes('/pending/') && o.lastModified < pendingCutoff)
      .map((o) => o.key);

    if (stalePending.length > 0) {
      const { data: matched, error: matchError } = await admin
        .from('files')
        .select('r2_key')
        .in('r2_key', stalePending);
      if (matchError) throw new Error(matchError.message);

      const referenced = new Set<string>((matched ?? [] as Array<{ r2_key: string }>).map((r) => r.r2_key));
      const orphans = stalePending.filter((key) => !referenced.has(key));
      cleaned += await deletePrivateObjects(orphans);
    }

    result.pendingCleaned = cleaned;
  } catch (err) {
    result.errors?.push(`pending: ${String(err)}`);
  }

  return NextResponse.json(result);
}
