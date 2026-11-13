import { NextRequest, NextResponse } from 'next/server';
import { requireBearer } from '@/lib/auth/bearer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  CONTACT_RETENTION_DAYS,
  deletePrivateObjects,
  isR2Configured,
  listPrivateContactObjects,
  listPrivateVaultObjects,
  staleObjectKeys,
} from '@/lib/r2';

export const dynamic = 'force-dynamic';

async function handleStorageRetentionCron(request: NextRequest) {
  if (!requireBearer(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // 1. Run auto-accept deliverables past their review window
  const { data: autoAcceptedCount, error: autoErr } = await admin.rpc(
    'run_auto_accept_deliverables'
  );
  if (autoErr) {
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  // 1b. Transition overdue invoices and expired proposals
  try {
    const todayDate = new Date().toISOString().slice(0, 10);
    await admin
      .from('invoices')
      .update({ status: 'overdue' })
      .in('status', ['issued', 'partially_paid'])
      .lt('due_at', todayDate);

    await admin
      .from('proposals')
      .update({ status: 'expired' })
      .in('status', ['sent', 'viewed'])
      .lt('valid_until', todayDate);
  } catch {
    // Non-fatal in isolated storage unit tests
  }

  let deletedVaultFiles = 0;
  let deletedInquiryAttachments = 0;
  let deletedOrphanContactObjects = 0;
  let deletedOrphanPrivateObjects = 0;

  // 2. Purge expired vault files & unretained >90d inquiry attachments from private storage
  if (isR2Configured()) {
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: expiredFiles, error: vaultQueryErr } = await admin
      .from('vault_files')
      .select('id, r2_key, owner_client_id, order_id')
      .is('archived_at', null)
      .not('retention_until', 'is', null)
      .lt('retention_until', nowIso)
      .limit(100);

    if (vaultQueryErr) {
      return NextResponse.json({ error: vaultQueryErr.message }, { status: 500 });
    }

    if (expiredFiles && expiredFiles.length > 0) {
      const keys = expiredFiles.map((f) => f.r2_key);
      try {
        deletedVaultFiles = await deletePrivateObjects(keys);
      } catch {
        return NextResponse.json(
          { error: 'Failed to delete expired vault objects from storage.' },
          { status: 503 }
        );
      }
      const { error: archiveErr } = await admin
        .from('vault_files')
        .update({ archived_at: nowIso })
        .in(
          'id',
          expiredFiles.map((f) => f.id)
        );
      if (archiveErr) {
        return NextResponse.json({ error: archiveErr.message }, { status: 500 });
      }

      await admin.from('audit_logs').insert({
        actor_role: 'system',
        action: 'storage.retention_purged',
        entity_type: 'vault_file',
        summary: `Archived and purged ${deletedVaultFiles} expired vault file(s)`,
        metadata: { count: deletedVaultFiles },
      });
    }

    // Purge unretained contact attachments older than 90 days
    const cutoffDate = new Date(now.getTime() - CONTACT_RETENTION_DAYS * 86_400_000);
    const cutoffIso = cutoffDate.toISOString();

    const { data: expiredInquiryAtts, error: attErr } = await admin
      .from('inquiry_attachments')
      .select('id, r2_key')
      .eq('retained', false)
      .lt('created_at', cutoffIso)
      .limit(100);

    if (attErr) {
      return NextResponse.json({ error: attErr.message }, { status: 500 });
    }

    if (expiredInquiryAtts && expiredInquiryAtts.length > 0) {
      try {
        deletedInquiryAttachments = await deletePrivateObjects(
          expiredInquiryAtts.map((a) => a.r2_key)
        );
      } catch {
        return NextResponse.json(
          { error: 'Failed to delete expired inquiry attachments from storage.' },
          { status: 503 }
        );
      }
      const { error: delAttErr } = await admin
        .from('inquiry_attachments')
        .delete()
        .in(
          'id',
          expiredInquiryAtts.map((a) => a.id)
        );
      if (delAttErr) {
        return NextResponse.json({ error: delAttErr.message }, { status: 500 });
      }
    }

    // Sweep stale orphan contact/* objects older than 90 days not tracked in inquiry_attachments
    let contactObjects: Awaited<ReturnType<typeof listPrivateContactObjects>> = [];
    try {
      contactObjects = await listPrivateContactObjects();
    } catch {
      return NextResponse.json(
        { error: 'Failed to list contact storage objects.' },
        { status: 503 }
      );
    }

    // Filter candidate stale objects first (capped at 100 per batch) so we query only those keys
    // and never truncate retained attachments at PostgREST's 1,000-row limit.
    const candidateStaleObjects = contactObjects
      .filter(
        (obj) =>
          obj.key.startsWith('contact/') &&
          obj.lastModified instanceof Date &&
          obj.lastModified.getTime() < cutoffDate.getTime()
      )
      .slice(0, 100);

    if (candidateStaleObjects.length > 0) {
      const candidateKeys = candidateStaleObjects.map((obj) => obj.key);
      const { data: trackedAtts, error: trackedErr } = await admin
        .from('inquiry_attachments')
        .select('r2_key')
        .in('r2_key', candidateKeys);

      if (trackedErr || !trackedAtts) {
        return NextResponse.json(
          { error: trackedErr?.message ?? 'Could not verify retained contact attachments.' },
          { status: 503 }
        );
      }

      const retainedSet = new Set(trackedAtts.map((row) => row.r2_key));
      const staleKeys = staleObjectKeys(candidateStaleObjects, cutoffDate, retainedSet);
      if (staleKeys.length > 0) {
        try {
          deletedOrphanContactObjects = await deletePrivateObjects(staleKeys.slice(0, 100));
        } catch {
          return NextResponse.json(
            { error: 'Failed to delete orphan contact objects.' },
            { status: 503 }
          );
        }
      }
    }

    // Sweep unreferenced private/* vault uploads older than 24 hours not tracked in vault_files
    const vaultOrphanCutoff = new Date(now.getTime() - 86_400_000);
    let privateObjects: Awaited<ReturnType<typeof listPrivateVaultObjects>> = [];
    try {
      privateObjects = await listPrivateVaultObjects();
    } catch {
      return NextResponse.json(
        { error: 'Failed to list private vault storage objects.' },
        { status: 503 }
      );
    }

    const candidateOrphanPrivate = privateObjects
      .filter(
        (obj) =>
          obj.key.startsWith('private/') &&
          obj.lastModified instanceof Date &&
          obj.lastModified.getTime() < vaultOrphanCutoff.getTime()
      )
      .slice(0, 100);

    if (candidateOrphanPrivate.length > 0) {
      const candidatePrivateKeys = candidateOrphanPrivate.map((obj) => obj.key);
      const { data: trackedVaultFiles, error: trackedVaultErr } = await admin
        .from('vault_files')
        .select('r2_key')
        .in('r2_key', candidatePrivateKeys);

      if (trackedVaultErr || !trackedVaultFiles) {
        return NextResponse.json(
          { error: trackedVaultErr?.message ?? 'Could not verify retained vault files.' },
          { status: 503 }
        );
      }

      const trackedVaultSet = new Set(trackedVaultFiles.map((row) => row.r2_key));
      const orphanPrivateKeys = staleObjectKeys(
        candidateOrphanPrivate,
        vaultOrphanCutoff,
        trackedVaultSet
      );
      if (orphanPrivateKeys.length > 0) {
        try {
          deletedOrphanPrivateObjects = await deletePrivateObjects(orphanPrivateKeys.slice(0, 100));
        } catch {
          return NextResponse.json(
            { error: 'Failed to delete orphan private objects.' },
            { status: 503 }
          );
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    autoAcceptedDeliverables: autoAcceptedCount ?? 0,
    deletedVaultFiles,
    deletedInquiryAttachments,
    deletedOrphanContactObjects,
    deletedOrphanPrivateObjects,
  });
}

export async function GET(request: NextRequest) {
  return handleStorageRetentionCron(request);
}

export async function POST(request: NextRequest) {
  return handleStorageRetentionCron(request);
}
