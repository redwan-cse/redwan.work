import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createInAppNotification,
  enqueueTransactionalEmail,
  notifyAllAdmins,
} from '@/lib/crm/audit';
import {
  PORTAL_ALLOWED,
  extFromFilename,
  isAllowedMime,
  resolveMimeType,
  validateMagicBytes,
} from '@/lib/mime';
import {
  getPrivateObjectBytes,
  getPrivateObjectHeadBytes,
  isR2Configured,
  verifyStoredPortalObjectSize,
} from '@/lib/r2';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { isSameOriginRequest } from '@/lib/security/safe-redirect';
import { orderMessageBodySchema, uuidSchema } from '@/lib/validation/schemas';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const parsedId = uuidSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid order identifier.' }, { status: 400 });
  }
  const id = parsedId.data;
  const admin = getSupabaseAdmin();

  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, title, status')
    .eq('id', id)
    .maybeSingle();

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rawAfter = request.nextUrl.searchParams.get('after')?.trim() ?? '';
  const parsedAfterMs = rawAfter ? Date.parse(rawAfter) : Number.NaN;
  const afterIso = Number.isFinite(parsedAfterMs) ? new Date(parsedAfterMs).toISOString() : null;

  const authorSelect =
    session.role === 'admin'
      ? 'author:profiles!order_messages_author_id_fkey(full_name, email, role)'
      : 'author:profiles!order_messages_author_id_fkey(full_name, role)';

  let query = admin
    .from('order_messages')
    .select(`id, body, created_at, is_internal_note, author_id, attachment_file_ids, ${authorSelect}`)
    .eq('order_id', id)
    .order('created_at', { ascending: Boolean(afterIso) })
    .limit(100);

  if (afterIso && typeof query.gt === 'function') {
    query = query.gt('created_at', afterIso);
  }

  if (session.role !== 'admin') {
    query = query.eq('is_internal_note', false);
  }

  const { data: messages } = await query;
  const ordered = afterIso ? [...(messages ?? [])] : [...(messages ?? [])].reverse();

  const lastMessage = ordered[ordered.length - 1];
  const etag = `W/"${ordered.length}-${lastMessage?.id ?? 'empty'}-${lastMessage?.created_at ?? '0'}-${afterIso ?? 'full'}"`;
  const responseHeaders = {
    ETag: etag,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
  };

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: responseHeaders });
  }

  const allFileIds = Array.from(
    new Set(
      ordered.flatMap((m) =>
        Array.isArray(m.attachment_file_ids) ? m.attachment_file_ids : []
      )
    )
  );

  let fileMap = new Map<
    string,
    { id: string; filename: string; size_bytes: number; mime_type: string }
  >();
  if (allFileIds.length > 0) {
    const { data: vFiles } = await admin
      .from('vault_files')
      .select('id, filename, size_bytes, mime_type')
      .in('id', allFileIds)
      .is('archived_at', null);
    fileMap = new Map((vFiles ?? []).map((f) => [f.id, f]));
  }

  const enriched = ordered.map((m) => ({
    ...m,
    attachments: (Array.isArray(m.attachment_file_ids) ? m.attachment_file_ids : [])
      .map((fid) => fileMap.get(fid))
      .filter(Boolean),
  }));

  return NextResponse.json(
    { messages: enriched, delta: Boolean(afterIso) },
    { headers: responseHeaders }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const parsedId = uuidSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid order identifier.' }, { status: 400 });
  }
  const id = parsedId.data;

  const rawPayload = await request.json().catch(() => null);
  const parsedBody = orderMessageBodySchema.safeParse(rawPayload);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? 'Invalid message payload.' },
      { status: 400 }
    );
  }
  const body = parsedBody.data.body;

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, title, status')
    .eq('id', id)
    .maybeSingle();

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (session.role !== 'admin' && order.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Cancelled orders cannot receive new client messages.' },
      { status: 403 }
    );
  }

  try {
    const allowed = await consumeRateLimit('order-message', session.userId, 30, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many messages sent. Please wait a minute before sending again.' },
        { status: 429 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Messaging rate limit service unavailable.' },
      { status: 503 }
    );
  }

  const isInternalNote = session.role === 'admin' && parsedBody.data.is_internal_note;

  const attachmentIds: string[] = [];
  const attachedMetadata: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    mime_type: string;
  }> = [];

  if (parsedBody.data.attachment) {
    const att = parsedBody.data.attachment;
    const ext = extFromFilename(att.filename);
    const resolvedMime = resolveMimeType(att.filename, att.mime);
    if (!ext || !isAllowedMime(ext, resolvedMime, PORTAL_ALLOWED)) {
      return NextResponse.json(
        { error: 'Unsupported attachment file type or MIME signature.' },
        { status: 400 }
      );
    }
    const expectedPrefix = `private/${order.client_id}/order_attachment/`;
    if (!att.r2_key.startsWith(expectedPrefix) || att.r2_key.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid vault attachment storage prefix.' },
        { status: 400 }
      );
    }
    let verifiedSha256: string | null = null;
    if (isR2Configured()) {
      const okSize = await verifyStoredPortalObjectSize(att.r2_key, att.size_bytes);
      if (!okSize) {
        return NextResponse.json(
          { error: 'Uploaded attachment could not be verified in private storage.' },
          { status: 400 }
        );
      }
      if (att.size_bytes <= 10 * 1024 * 1024) {
        const objectBytes = await getPrivateObjectBytes(att.r2_key);
        if (!validateMagicBytes(objectBytes, resolvedMime)) {
          return NextResponse.json(
            { error: 'Uploaded attachment signature does not match its declared file type.' },
            { status: 400 }
          );
        }
        verifiedSha256 = createHash('sha256').update(objectBytes).digest('hex');
      } else {
        const headBytes = await getPrivateObjectHeadBytes(att.r2_key, 64);
        if (!headBytes || !validateMagicBytes(headBytes, resolvedMime)) {
          return NextResponse.json(
            { error: 'Uploaded attachment signature does not match its declared file type.' },
            { status: 400 }
          );
        }
      }
    }
    const retentionUntil = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
    const { data: vFile, error: vfErr } = await admin
      .from('vault_files')
      .insert({
        owner_client_id: order.client_id,
        order_id: id,
        category: 'order_attachment',
        r2_key: att.r2_key,
        filename: att.filename,
        mime_type: resolvedMime,
        size_bytes: Math.round(att.size_bytes),
        sha256_checksum: verifiedSha256,
        retention_until: retentionUntil,
        uploaded_by: session.userId,
      })
      .select('id, filename, size_bytes, mime_type')
      .single();

    if (vfErr || !vFile) {
      return NextResponse.json(
        { error: 'Could not register uploaded attachment.' },
        { status: 500 }
      );
    }
    attachmentIds.push(vFile.id);
    attachedMetadata.push(vFile);
  }

  if (parsedBody.data.attachment_file_ids.length > 0) {
    const { data: existingFiles } = await admin
      .from('vault_files')
      .select('id, filename, size_bytes, mime_type')
      .in('id', parsedBody.data.attachment_file_ids)
      .eq('owner_client_id', order.client_id)
      .is('archived_at', null);

    for (const vf of existingFiles ?? []) {
      if (!attachmentIds.includes(vf.id)) {
        attachmentIds.push(vf.id);
        attachedMetadata.push(vf);
      }
    }
  }

  const postAuthorSelect =
    session.role === 'admin'
      ? 'author:profiles!order_messages_author_id_fkey(full_name, email, role)'
      : 'author:profiles!order_messages_author_id_fkey(full_name, role)';

  const { data: inserted, error } = await admin
    .from('order_messages')
    .insert({
      order_id: id,
      author_id: session.userId,
      body,
      is_internal_note: isInternalNote,
      ...(attachmentIds.length > 0 ? { attachment_file_ids: attachmentIds } : {}),
    })
    .select(
      `id, body, created_at, is_internal_note, author_id, attachment_file_ids, ${postAuthorSelect}`
    )
    .single();

  if (error || !inserted) {
    console.error('[orders/messages] insert failed:', error?.message);
    return NextResponse.json(
      { error: 'Could not send message.' },
      { status: 500 }
    );
  }

  if (!isInternalNote) {
    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work';
    if (session.role === 'admin') {
      await createInAppNotification({
        recipientId: order.client_id,
        category: 'message',
        title: `New message on contract ${order.code}`,
        body: body.slice(0, 120),
        href: `/portal/orders/${id}`,
      });
      try {
        const { data: clientProf } = await admin
          .from('profiles')
          .select('email')
          .eq('id', order.client_id)
          .maybeSingle();
        if (clientProf?.email) {
          await enqueueTransactionalEmail({
            toEmail: clientProf.email,
            template: 'order_message',
            subject: `New Message on Contract ${order.code} — ${order.title}`,
            payload: {
              message: body.slice(0, 400),
              actionUrl: `${siteOrigin}/portal/orders/${id}`,
            },
            entityType: 'order',
            entityId: id,
          });
        }
      } catch {}
    } else {
      await notifyAllAdmins({
        category: 'message',
        title: `Client message on contract ${order.code}`,
        body: body.slice(0, 120),
        href: `/admin/orders/${id}`,
      });
      await enqueueTransactionalEmail({
        toEmail:
          process.env.CONTACT_ALERT_TO || process.env.ADMIN_ALERT_EMAIL || 'contact@redwan.work',
        template: 'order_message_admin',
        subject: `Client Message on Contract ${order.code} — ${order.title}`,
        payload: {
          message: body.slice(0, 400),
          actionUrl: `${siteOrigin}/admin/orders/${id}`,
        },
        entityType: 'order',
        entityId: id,
      });
    }
  }

  return NextResponse.json(
    { message: { ...inserted, attachments: attachedMetadata } },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}
