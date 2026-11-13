import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { isSameOriginRequest } from '@/lib/security/safe-redirect';
import {
  ARCHIVE_MAX_BYTES,
  CLIENT_VAULT_QUOTA_BYTES,
  isR2Configured,
  makeVaultFileKey,
  presignPrivatePut,
} from '@/lib/r2';
import { extFromFilename, isAllowedMime, PORTAL_ALLOWED, resolveMimeType } from '@/lib/mime';

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
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'Encrypted attachment vault is not configured.' },
      { status: 503 }
    );
  }

  const allowed = await consumeRateLimit('portal-presign', session.userId, 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Upload rate limit exceeded. Please wait before requesting more upload links.' },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      filename?: string;
      mime?: string;
      mimeType?: string;
      size?: number;
      category?: string;
      clientId?: string;
      orderId?: string | null;
    };

    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const mime = resolveMimeType(filename, body.mime ?? body.mimeType);
    const size = typeof body.size === 'number' ? body.size : 0;
    const category = typeof body.category === 'string' ? body.category : 'deliverable';
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';

    if (!filename || filename.length > 255 || !ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Invalid upload parameters.' }, { status: 400 });
    }

    if (category === 'deliverable' && session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can upload deliverable packages.' },
        { status: 403 }
      );
    }

    if (session.role !== 'admin' && body.clientId && body.clientId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const ext = extFromFilename(filename);
    if (!ALLOWED_EXT.has(ext) || !isAllowedMime(ext, mime, PORTAL_ALLOWED)) {
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

    const admin = getSupabaseAdmin();

    if (orderId && session.role !== 'admin') {
      const { data: orderRow, error: orderErr } = await admin
        .from('orders')
        .select('id, client_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderErr || !orderRow || orderRow.client_id !== session.userId) {
        return NextResponse.json({ error: 'Forbidden order scope.' }, { status: 403 });
      }
    }

    const { data: activeFiles, error: quotaErr } = await admin
      .from('vault_files')
      .select('size_bytes')
      .eq('owner_client_id', ownerClientId)
      .is('archived_at', null);

    if (quotaErr || !activeFiles) {
      return NextResponse.json(
        { error: 'Vault storage quota verification is temporarily unavailable.' },
        { status: 503 }
      );
    }

    const usedBytes = activeFiles.reduce(
      (acc, row) => acc + Number(row.size_bytes ?? 0),
      0
    );
    if (usedBytes + size > CLIENT_VAULT_QUOTA_BYTES) {
      return NextResponse.json(
        { error: 'Client active vault storage quota (500 MB) exceeded.' },
        { status: 413 }
      );
    }

    const r2Key = makeVaultFileKey(ownerClientId, category, ext);
    const uploadUrl = await presignPrivatePut(r2Key, mime, size, 600);

    return NextResponse.json(
      { key: r2Key, uploadUrl, mime },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Portal presign failed:', err);
    return NextResponse.json({ error: 'Could not presign file upload.' }, { status: 500 });
  }
}
