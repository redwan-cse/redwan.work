import { NextRequest, NextResponse } from 'next/server';
import { requireBearer } from '@/lib/auth/bearer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  CONTACT_RETENTION_DAYS,
  deletePrivateObjects,
  isR2Configured,
  listPrivateContactObjects,
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

  let deletedVaultFiles = 0;
  let deletedInquiryAttachments = 0;
  let deletedOrphanContactObjects = 0;

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
      deletedVaultFiles = await deletePrivateObjects(keys);
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
      deletedInquiryAttachments = await deletePrivateObjects(
        expiredInquiryAtts.map((a) => a.r2_key)
      );
      await admin
        .from('inquiry_attachments')
        .delete()
        .in(
          'id',
          expiredInquiryAtts.map((a) => a.id)
        );
    }

    // Sweep stale orphan contact/* objects older than 90 days not tracked in inquiry_attachments
    const contactObjects = await listPrivateContactObjects();
    if (contactObjects.length > 0) {
      const { data: trackedAtts } = await admin
        .from('inquiry_attachments')
        .select('r2_key');
      const retainedSet = new Set((trackedAtts ?? []).map((row) => row.r2_key));
      const staleKeys = staleObjectKeys(contactObjects, cutoffDate, retainedSet);
      if (staleKeys.length > 0) {
        deletedOrphanContactObjects = await deletePrivateObjects(staleKeys.slice(0, 100));
      }
    }
  }

  return NextResponse.json({
    ok: true,
    autoAcceptedDeliverables: autoAcceptedCount ?? 0,
    deletedVaultFiles,
    deletedInquiryAttachments,
    deletedOrphanContactObjects,
  });
}

export async function GET(request: NextRequest) {
  return handleStorageRetentionCron(request);
}

export async function POST(request: NextRequest) {
  return handleStorageRetentionCron(request);
}
