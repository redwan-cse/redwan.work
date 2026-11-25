import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/crm/audit';
import { getPrivateObjectBytes, isR2Configured } from '@/lib/r2';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { recoveryExportQuerySchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MiB safety ceiling per export

function safeArchiveFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 140);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'file';
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin AAL2 authorization required.' }, { status: 403 });
  }

  try {
    const allowed = await consumeRateLimit('recovery-export', session.userId, 10, 300);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Recovery export rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      );
    }
  } catch {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Rate control unavailable.' }, { status: 503 });
    }
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'Private R2 storage is not configured.' }, { status: 503 });
  }

  const parsedOrder = recoveryExportQuerySchema.safeParse({
    order_id: request.nextUrl.searchParams.get('order_id') ?? '',
  });
  if (!parsedOrder.success) {
    return NextResponse.json({ error: 'Invalid or missing order_id parameter.' }, { status: 400 });
  }
  const orderId = parsedOrder.data.order_id;

  const admin = getSupabaseAdmin();
  const [{ data: order }, { data: files }] = await Promise.all([
    admin.from('orders').select('id, code, title, client_id').eq('id', orderId).maybeSingle(),
    admin
      .from('vault_files')
      .select('id, filename, r2_key, category, size_bytes')
      .eq('order_id', orderId)
      .is('archived_at', null)
      .limit(200),
  ]);

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No active vault objects stored for this order.' }, { status: 404 });
  }

  const declaredTotalBytes = files.reduce((sum, f) => sum + Math.max(0, Number(f.size_bytes ?? 0)), 0);
  if (declaredTotalBytes > MAX_ARCHIVE_BYTES) {
    return NextResponse.json(
      { error: 'Order archive exceeds the 250 MiB single-ZIP export ceiling. Download files individually.' },
      { status: 413 }
    );
  }

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

  const pass = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  // Attach stream listeners BEFORE appending/finalizing so >16KB ZIPs never backpressure-deadlock.
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      pass.on('data', (chunk: Buffer) => {
        if (!closed) controller.enqueue(new Uint8Array(chunk));
      });
      pass.on('end', () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
      pass.on('error', (err) => {
        if (!closed) {
          closed = true;
          controller.error(err);
        }
      });

      void (async () => {
        const usedPaths = new Map<string, number>();
        let streamedBytes = 0;
        for (const file of files) {
          const safeCat = safeArchiveFilename(file.category || 'files');
          const safeName = safeArchiveFilename(file.filename);
          const basePath = `${safeCat}/${safeName}`;
          const seen = usedPaths.get(basePath) ?? 0;
          usedPaths.set(basePath, seen + 1);
          const entryName = seen === 0 ? basePath : `${safeCat}/${file.id.slice(0, 8)}-${safeName}`;

          try {
            const bytes = await getPrivateObjectBytes(file.r2_key);
            streamedBytes += bytes.byteLength;
            if (streamedBytes > MAX_ARCHIVE_BYTES) {
              archive.append(Buffer.from('Archive byte ceiling reached; remaining files omitted.\n'), {
                name: 'EXPORT_TRUNCATED.txt',
              });
              break;
            }
            archive.append(bytes, { name: entryName });
          } catch {
            archive.append(Buffer.from(`Failed to read object ${file.r2_key}\n`), {
              name: `${entryName}.missing.txt`,
            });
          }
        }
        await archive.finalize();
      })().catch((err) => {
        pass.destroy(err instanceof Error ? err : new Error('Archive streaming failed'));
      });
    },
    cancel() {
      archive.abort();
      pass.destroy();
    },
  });

  const zipName = `${safeArchiveFilename(order.code)}-vault-recovery.zip`;
  return new NextResponse(readable, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
