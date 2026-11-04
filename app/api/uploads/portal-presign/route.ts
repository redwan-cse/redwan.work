import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import {
  ARCHIVE_MAX_BYTES,
  isR2Configured,
  makeVaultFileKey,
  presignPrivatePut,
} from '@/lib/r2';
import { isAllowedMime } from '@/lib/mime';

export const dynamic = 'force-dynamic';

const ALLOWED_CATEGORIES = new Set([
  'deliverable',
  'requirement_attachment',
  'ticket_attachment',
  'payment_proof',
  'roe_document',
]);

const ALLOWED_EXT = new Set([
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'png',
  'jpg',
  'webp',
  'zip',
]);

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'Cloudflare R2 private bucket is not configured.' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as {
      filename?: string;
      mime?: string;
      size?: number;
      category?: string;
      clientId?: string;
    };

    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const mime = typeof body.mime === 'string' ? body.mime.trim() : '';
    const size = typeof body.size === 'number' ? body.size : 0;
    const category = typeof body.category === 'string' ? body.category : 'deliverable';

    if (!filename || filename.length > 255 || !ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Invalid upload parameters.' }, { status: 400 });
    }

    const parts = filename.toLowerCase().split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1] : '';
    if (!ALLOWED_EXT.has(ext) || !isAllowedMime(ext, mime)) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
    }

    if (!Number.isSafeInteger(size) || size < 1 || size > ARCHIVE_MAX_BYTES) {
      return NextResponse.json(
        { error: 'File size must be between 1 byte and 100 MB.' },
        { status: 400 }
      );
    }

    const ownerClientId =
      session.role === 'admin' && typeof body.clientId === 'string' && body.clientId
        ? body.clientId
        : session.userId;

    const r2Key = makeVaultFileKey(ownerClientId, category, ext);
    const uploadUrl = await presignPrivatePut(r2Key, mime, size, 600);

    return NextResponse.json(
      { key: r2Key, uploadUrl },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Portal presign failed:', err);
    return NextResponse.json({ error: 'Could not presign file upload.' }, { status: 500 });
  }
}
