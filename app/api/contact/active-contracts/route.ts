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

    // Omit unenriched initialMessages so ContractLiveChat fetches per-order messages
    // through GET /api/orders/[id]/messages (with enriched attachments, ETag 304,
    // strict client email redaction, and no cross-order 150-row truncation).
    const contracts: ActiveContractOption[] = rows.map((o) => ({
      id: o.id,
      code: o.code ?? 'ORD-XXXX',
      title: o.title,
      status: o.status,
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
