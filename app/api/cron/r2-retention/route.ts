import { NextRequest, NextResponse } from 'next/server';
import { requireBearer } from '@/lib/auth/bearer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { deletePrivateObjects, isR2Configured } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requireBearer(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // 1. Run auto-accept deliverables past their review window
  const { data: autoAcceptedCount } = await admin.rpc('run_auto_accept_deliverables');

  // 2. Purge expired non-retained vault files from R2 if configured
  let deletedVaultFiles = 0;
  if (isR2Configured()) {
    const nowIso = new Date().toISOString();
    const { data: expiredFiles } = await admin
      .from('vault_files')
      .select('id, r2_key')
      .eq('retained', false)
      .is('deleted_from_r2_at', null)
      .lt('retention_expires_at', nowIso)
      .limit(100);

    if (expiredFiles && expiredFiles.length > 0) {
      const keys = expiredFiles.map((f) => f.r2_key);
      deletedVaultFiles = await deletePrivateObjects(keys);
      await admin
        .from('vault_files')
        .update({ deleted_from_r2_at: nowIso })
        .in(
          'id',
          expiredFiles.map((f) => f.id)
        );
    }
  }

  return NextResponse.json({
    ok: true,
    autoAcceptedDeliverables: autoAcceptedCount ?? 0,
    deletedVaultFiles,
  });
}
