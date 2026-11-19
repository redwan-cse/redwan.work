import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActiveContractOption } from '@/components/panel/contract-live-chat';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { authenticated: false, contracts: [] as ActiveContractOption[] },
      { headers: PRIVATE_NO_STORE }
    );
  }

  try {
    const admin = getSupabaseAdmin();
    let ordersQuery = admin
      .from('orders')
      .select('id, code, title, status')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(10);

    if (session.role !== 'admin') {
      ordersQuery = ordersQuery.eq('client_id', session.userId);
    }

    const { data: orderRows } = await ordersQuery;
    const rows = orderRows ?? [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          authenticated: true,
          viewerRole: session.role === 'admin' ? 'admin' : 'client',
          viewerId: session.userId,
          contracts: [] as ActiveContractOption[],
        },
        { headers: PRIVATE_NO_STORE }
      );
    }

    const orderIds = rows.map((r) => r.id);
    let msgQuery = admin
      .from('order_messages')
      .select(
        'id, order_id, body, created_at, is_internal_note, author_id, author:profiles!order_messages_author_id_fkey(full_name, email, role)'
      )
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
      .limit(150);

    if (session.role !== 'admin') {
      msgQuery = msgQuery.eq('is_internal_note', false);
    }

    const { data: msgRows } = await msgQuery;
    const grouped = new Map<string, NonNullable<ActiveContractOption['initialMessages']>>();
    for (const m of msgRows ?? []) {
      const list = grouped.get(m.order_id) ?? [];
      list.push({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        is_internal_note: m.is_internal_note,
        author_id: m.author_id,
        author: Array.isArray(m.author) ? (m.author[0] ?? null) : (m.author ?? null),
      });
      grouped.set(m.order_id, list);
    }

    const contracts: ActiveContractOption[] = rows.map((o) => ({
      id: o.id,
      code: o.code ?? 'ORD-XXXX',
      title: o.title,
      status: o.status,
      initialMessages: (grouped.get(o.id) ?? []).reverse(),
    }));

    return NextResponse.json(
      {
        authenticated: true,
        viewerRole: session.role === 'admin' ? 'admin' : 'client',
        viewerId: session.userId,
        contracts,
      },
      { headers: PRIVATE_NO_STORE }
    );
  } catch {
    return NextResponse.json(
      { authenticated: false, contracts: [] as ActiveContractOption[] },
      { headers: PRIVATE_NO_STORE }
    );
  }
}
