import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getPrivateObjectSize, isR2Configured, presignPrivateGet } from '@/lib/r2';
import { recordAuditLog } from '@/lib/crm/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid file identifier.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: file, error } = await admin
    .from('vault_files')
    .select(
      'id, owner_client_id, order_id, deliverable_id, r2_key, filename, mime_type, size_bytes, download_count, retention_until, archived_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !file) {
    if (session.role === 'admin') {
      try {
        const { data: att } = await admin
          .from('inquiry_attachments')
          .select('id, inquiry_id, r2_key, filename, mime, size_bytes')
          .eq('id', id)
          .maybeSingle();

        if (att) {
          if (!isR2Configured()) {
            return NextResponse.json(
              { error: 'Private attachment vault is not configured in this environment.' },
              { status: 503 }
            );
          }
          const storedSize = await getPrivateObjectSize(att.r2_key);
          if (storedSize === null) {
            return NextResponse.json({ error: 'Stored file object not found.' }, { status: 404 });
          }
          const signedUrl = await presignPrivateGet(att.r2_key, 60);
          await recordAuditLog({
            actorId: session.userId,
            actorRole: 'admin',
            action: 'inquiry_attachment.downloaded',
            entityType: 'inquiry_attachment',
            entityId: att.id,
            summary: `Admin downloaded inquiry attachment ${att.filename}`,
            metadata: {
              inquiry_id: att.inquiry_id,
              filename: att.filename,
              size_bytes: att.size_bytes,
            },
          });
          return NextResponse.redirect(signedUrl, {
            status: 302,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
      } catch (attErr) {
        console.error('Inquiry attachment fallback lookup failed:', attErr);
      }
    }
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  if (session.role !== 'admin' && file.owner_client_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const retentionExpired =
    typeof file.retention_until === 'string' &&
    new Date(file.retention_until).getTime() <= Date.now();

  if (file.archived_at || retentionExpired) {
    return NextResponse.json(
      { error: 'This file has expired under the storage retention policy.' },
      { status: 410 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'Private attachment vault is not configured in this environment.' },
      { status: 503 }
    );
  }

  try {
    const storedSize = await getPrivateObjectSize(file.r2_key);
    if (storedSize === null) {
      return NextResponse.json({ error: 'Stored file object not found.' }, { status: 404 });
    }

    const signedUrl = await presignPrivateGet(file.r2_key, 60);

    const { error: incErr } = await admin.rpc('increment_vault_file_download', {
      p_file_id: file.id,
    });
    if (incErr) {
      await admin
        .from('vault_files')
        .update({
          download_count: (file.download_count ?? 0) + 1,
          last_downloaded_at: new Date().toISOString(),
        })
        .eq('id', file.id);
    }

    await recordAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      clientId: file.owner_client_id,
      orderId: file.order_id,
      action: 'vault_file.downloaded',
      entityType: 'vault_file',
      entityId: file.id,
      summary: `${session.role === 'admin' ? 'Admin' : 'Client'} downloaded ${file.filename}`,
      metadata: {
        filename: file.filename,
        size_bytes: file.size_bytes,
        deliverable_id: file.deliverable_id,
      },
    });

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Presigned download error:', err);
    return NextResponse.json({ error: 'Could not generate download link.' }, { status: 502 });
  }
}
