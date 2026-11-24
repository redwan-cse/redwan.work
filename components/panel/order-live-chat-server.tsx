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
      'id, body, created_at, is_internal_note, author_id, attachment_file_ids, author:profiles!order_messages_author_id_fkey(full_name, email, role)'
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (viewerRole !== 'admin') {
    query = query.eq('is_internal_note', false);
  }

  const { data } = await query;
  const ordered = [...(data ?? [])].reverse();
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

  const initialMessages = ordered.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    is_internal_note: m.is_internal_note,
    author_id: m.author_id,
    author: Array.isArray(m.author) ? (m.author[0] ?? null) : (m.author ?? null),
    attachments: (Array.isArray(m.attachment_file_ids) ? m.attachment_file_ids : [])
      .map((fid) => fileMap.get(fid))
      .filter(
        (f): f is { id: string; filename: string; size_bytes: number; mime_type: string } =>
          Boolean(f)
      ),
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
