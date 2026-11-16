import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/crm/audit';
import { getPrivateObjectBytes, isR2Configured } from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function safeArchiveFilename(raw: string): string {
  return raw.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 140) || 'file';
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin AAL2 authorization required.' }, { status: 403 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'Private R2 storage is not configured.' }, { status: 503 });
  }

  const orderId = (request.nextUrl.searchParams.get('order_id') ?? '').trim();
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order_id parameter.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const [{ data: order }, { data: files }] = await Promise.all([
    admin.from('orders').select('id, code, title, client_id').eq('id', orderId).maybeSingle(),
    admin
      .from('vault_files')
      .select('id, filename, r2_key, category')
      .eq('order_id', orderId)
      .is('archived_at', null)
      .is('deleted_from_r2_at', null),
  ]);

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No active vault objects stored for this order.' }, { status: 404 });
  }

  const pass = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  for (const file of files) {
    try {
      const bytes = await getPrivateObjectBytes(file.r2_key);
      archive.append(bytes, {
        name: `${file.category}/${safeArchiveFilename(file.filename)}`,
      });
    } catch {
      archive.append(Buffer.from(`Failed to read object ${file.r2_key}\n`), {
        name: `${file.category}/${safeArchiveFilename(file.filename)}.missing.txt`,
      });
    }
  }

  void archive.finalize();

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      pass.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      pass.on('end', () => controller.close());
      pass.on('error', (err) => controller.error(err));
    },
    cancel() {
      archive.abort();
    },
  });

  await recordAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    clientId: order.client_id,
    orderId: order.id,
    action: 'vault.recovery_zip_exported',
    entityType: 'order',
    entityId: order.id,
    summary: `Exported recovery ZIP archive (${files.length} files) for ${order.code}`,
  });

  const zipName = `${safeArchiveFilename(order.code)}-vault-recovery.zip`;
  return new NextResponse(readable, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
