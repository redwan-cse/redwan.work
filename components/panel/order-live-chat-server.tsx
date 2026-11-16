import { ContractLiveChat } from '@/components/panel/contract-live-chat';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function OrderLiveChatServer({
  orderId,
  orderCode,
  orderTitle,
  orderStatus,
  viewerId,
  viewerRole,
}: {
  orderId: string;
  orderCode: string;
  orderTitle: string;
  orderStatus: string;
  viewerId: string;
  viewerRole: 'admin' | 'client';
}) {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('order_messages')
    .select(
      'id, body, created_at, is_internal_note, author_id, author:profiles!order_messages_author_id_fkey(full_name, email, role)'
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (viewerRole !== 'admin') {
    query = query.eq('is_internal_note', false);
  }

  const { data } = await query;
  const initialMessages = [...(data ?? [])]
    .reverse()
    .map((m) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      is_internal_note: m.is_internal_note,
      author_id: m.author_id,
      author: Array.isArray(m.author) ? (m.author[0] ?? null) : (m.author ?? null),
    }));

  return (
    <ContractLiveChat
      viewerId={viewerId}
      viewerRole={viewerRole}
      contracts={[
        {
          id: orderId,
          code: orderCode,
          title: orderTitle,
          status: orderStatus,
          initialMessages,
        },
      ]}
    />
  );
}
