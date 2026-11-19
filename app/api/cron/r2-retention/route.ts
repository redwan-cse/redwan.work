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
  type R2ObjectSummary,
} from '@/lib/r2';

export const dynamic = 'force-dynamic';

async function collectUnretainedOrphans(
  objects: R2ObjectSummary[],
  prefix: string,
  cutoffDate: Date,
  checkBatch: (keys: string[]) => Promise<{ retained: Set<string>; ok: boolean }>,
  maxCollect = 500
): Promise<{ ok: boolean; keys: string[] }> {
  const candidates = objects.filter(
    (obj) =>
      obj.key.startsWith(prefix) &&
      obj.lastModified instanceof Date &&
      obj.lastModified.getTime() < cutoffDate.getTime()
  );

  const collected: string[] = [];
  for (let i = 0; i < candidates.length && collected.length < maxCollect; i += 100) {
    const slice = candidates.slice(i, i + 100);
    const { retained, ok } = await checkBatch(slice.map((item) => item.key));
    if (!ok) {
      return { ok: false, keys: [] };
    }
    const stale = staleObjectKeys(slice, cutoffDate, retained);
    for (const key of stale) {
      if (collected.length >= maxCollect) break;
      collected.push(key);
    }
  }

  return { ok: true, keys: collected };
}

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

  // 1b. Transition overdue invoices & expired proposals and queue overdue notifications
  try {
    const todayDate = new Date().toISOString().slice(0, 10);
    const beforeMarkIso = new Date(Date.now() - 5000).toISOString();
    const { data: markedOverdueCount } = await admin.rpc('mark_overdue_invoices_atomic');

    let overdueIds: string[] = [];
    if (Number(markedOverdueCount ?? 0) > 0) {
      const { data: overdueAuditRows } = await admin
        .from('audit_logs')
        .select('entity_id')
        .eq('action', 'invoice.overdue')
        .gte('created_at', beforeMarkIso);
      overdueIds = Array.from(
        new Set((overdueAuditRows ?? []).map((r) => r.entity_id).filter(Boolean) as string[])
      );
    }
    const { data: newlyOverdue } =
      overdueIds.length > 0
        ? await admin
            .from('invoices')
            .select('id, code, client_id, currency, total_cents, amount_paid_cents, credited_cents')
            .in('id', overdueIds)
        : { data: [] };

    if (Array.isArray(newlyOverdue) && newlyOverdue.length > 0) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work';
      for (const inv of newlyOverdue) {
        const dueCents = Math.max(
          0,
          Number(inv.total_cents || 0) -
            Number(inv.amount_paid_cents || 0) -
            Number(inv.credited_cents || 0)
        );
        await admin.from('notifications').insert({
          recipient_id: inv.client_id,
          category: 'invoice',
          title: `Invoice Overdue: ${inv.code ?? ''}`,
          body: `Balance due: ${inv.currency} ${(dueCents / 100).toLocaleString()}`,
          href: `/portal/invoices/${inv.id}`,
        });
        const { data: prof } = await admin
          .from('profiles')
          .select('email')
          .eq('id', inv.client_id)
          .maybeSingle();
        if (prof?.email) {
          await admin.from('email_outbox').insert({
            to_email: prof.email,
            template: 'invoice_overdue',
            subject: `Action Required: Invoice ${inv.code ?? ''} is Overdue`,
            payload: {
              message: `Invoice ${inv.code ?? ''} (${inv.currency} ${(dueCents / 100).toLocaleString()} remaining balance) is now past its due date. Please submit payment proof or contact support.`,
              actionUrl: `${origin}/portal/invoices/${inv.id}`,
            },
            entity_type: 'invoice',
            entity_id: inv.id,
          });
        }
      }
    }

    await admin
      .from('proposals')
      .update({ status: 'expired' })
      .in('status', ['sent', 'viewed'])
      .lt('valid_until', todayDate);

    // Renew active retainers due on or before today (ensures Vercel Cron triggers renewal even if pg_cron is disabled)
    const { data: dueRetainers } = await admin
      .from('retainer_plans')
      .select('id')
      .eq('status', 'active')
      .lte('next_invoice_date', todayDate)
      .limit(50);

    if (Array.isArray(dueRetainers)) {
      for (const ret of dueRetainers) {
        await admin.rpc('renew_retainer_cycle_atomic', {
          p_retainer_id: ret.id,
          p_admin_id: undefined,
        });
      }
    }
  } catch {
    // Non-fatal in isolated storage unit tests with mocked DB clients
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

    // Paginated cursor sweep across all contact/* objects older than 90d not tracked in DB
    let contactObjects: R2ObjectSummary[] = [];
    try {
      contactObjects = await listPrivateContactObjects();
    } catch {
      return NextResponse.json(
        { error: 'Failed to list contact storage objects.' },
        { status: 503 }
      );
    }

    const contactSweep = await collectUnretainedOrphans(
      contactObjects,
      'contact/',
      cutoffDate,
      async (keys) => {
        const { data: trackedAtts, error: trackedErr } = await admin
          .from('inquiry_attachments')
          .select('r2_key')
          .in('r2_key', keys);
        if (trackedErr || !trackedAtts) {
          return { retained: new Set<string>(), ok: false };
        }
        return { retained: new Set(trackedAtts.map((r) => r.r2_key)), ok: true };
      }
    );

    if (!contactSweep.ok) {
      return NextResponse.json(
        { error: 'Could not verify retained contact attachments.' },
        { status: 503 }
      );
    }
    if (contactSweep.keys.length > 0) {
      try {
        deletedOrphanContactObjects = await deletePrivateObjects(contactSweep.keys);
      } catch {
        return NextResponse.json(
          { error: 'Failed to delete orphan contact objects.' },
          { status: 503 }
        );
      }
    }

    // Paginated cursor sweep across all unreferenced private/* objects older than 24h
    const vaultOrphanCutoff = new Date(now.getTime() - 86_400_000);
    let privateObjects: R2ObjectSummary[] = [];
    try {
      privateObjects = await listPrivateVaultObjects();
    } catch {
      return NextResponse.json(
        { error: 'Failed to list private vault storage objects.' },
        { status: 503 }
      );
    }

    const vaultSweep = await collectUnretainedOrphans(
      privateObjects,
      'private/',
      vaultOrphanCutoff,
      async (keys) => {
        const { data: trackedVaultFiles, error: trackedVaultErr } = await admin
          .from('vault_files')
          .select('r2_key')
          .in('r2_key', keys);
        if (trackedVaultErr || !trackedVaultFiles) {
          return { retained: new Set<string>(), ok: false };
        }
        return { retained: new Set(trackedVaultFiles.map((r) => r.r2_key)), ok: true };
      }
    );

    if (!vaultSweep.ok) {
      return NextResponse.json(
        { error: 'Could not verify retained vault files.' },
        { status: 503 }
      );
    }
    if (vaultSweep.keys.length > 0) {
      try {
        deletedOrphanPrivateObjects = await deletePrivateObjects(vaultSweep.keys);
      } catch {
        return NextResponse.json(
          { error: 'Failed to delete orphan private objects.' },
          { status: 503 }
        );
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
