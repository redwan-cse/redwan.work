import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createInAppNotification,
  enqueueTransactionalEmail,
  notifyAllAdmins,
} from '@/lib/crm/audit';
import { isSameOriginRequest } from '@/lib/security/safe-redirect';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const admin = getSupabaseAdmin();

  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, title, status')
    .eq('id', id)
    .maybeSingle();

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = admin
    .from('order_messages')
    .select('id, body, created_at, is_internal_note, author_id, author:profiles!order_messages_author_id_fkey(full_name, email, role)')
    .eq('order_id', id)
    .order('created_at', { ascending: true });

  if (session.role !== 'admin') {
    query = query.eq('is_internal_note', false);
  }

  const { data: messages } = await query;
  return NextResponse.json({ messages: messages ?? [] });
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

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    body?: string;
    is_internal_note?: boolean;
  } | null;

  const body = String(payload?.body ?? '').trim();
  if (!body) {
    return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
  }
  if (body.length > 10000) {
    return NextResponse.json(
      { error: 'Message body must not exceed 10,000 characters.' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from('orders')
    .select('id, client_id, code, title')
    .eq('id', id)
    .maybeSingle();

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isInternalNote = session.role === 'admin' && Boolean(payload?.is_internal_note);

  const { data: inserted, error } = await admin
    .from('order_messages')
    .insert({
      order_id: id,
      author_id: session.userId,
      body,
      is_internal_note: isInternalNote,
    })
    .select('id, body, created_at, is_internal_note, author_id, author:profiles!order_messages_author_id_fkey(full_name, email, role)')
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not send message.' },
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

  return NextResponse.json({ message: inserted });
}
