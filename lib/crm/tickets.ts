import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';

export type TicketStatus = 'open' | 'answered' | 'awaiting_client' | 'closed';

const TICKET_STATUSES: TicketStatus[] = ['open', 'answered', 'awaiting_client', 'closed'];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && TICKET_STATUSES.includes(value as TicketStatus);
}

export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  last_message_at: string;
  created_at: string;
  client_id: string;
  client_name: string | null;
  client_email: string;
}

export interface ThreadMessage {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
  author_role: 'admin' | 'client';
}

const PAGE_SIZE = 20;

interface TicketJoin {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  last_message_at: string;
  created_at: string;
  client_id: string;
  profiles: { full_name: string | null; id: string } | null;
}

function mapTicket(row: TicketJoin, clientEmail: string): TicketRow {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    status: row.status,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    client_id: row.client_id,
    client_name: row.profiles?.full_name ?? null,
    client_email: clientEmail,
  };
}

export async function listTickets(params: { status?: TicketStatus; page?: number }) {
  const admin = getSupabaseAdmin();
  const page = Math.max(1, params.page ?? 1);

  let query = admin
    .from('tickets')
    .select(
      'id, number, subject, status, last_message_at, created_at, client_id, profiles!tickets_client_id_fkey ( full_name )',
      { count: 'exact' }
    )
    .order('last_message_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (params.status) query = query.eq('status', params.status);

  const { data, error, count } = await query;
  if (error) throw new Error(`inbox query failed: ${error.message}`);

  // Emails live on auth.users, not profiles — resolve per-page via admin lookup.
  const rows = (data ?? []) as unknown as Array<TicketJoin & { profiles: { id: string } | null }>;
  const items: TicketRow[] = [];
  for (const row of rows) {
    const { data: userData } = await admin.auth.admin.getUserById(row.client_id);
    items.push(mapTicket(row as TicketJoin, userData?.user?.email ?? ''));
  }

  const total = count ?? 0;
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function countOpenTickets(): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw new Error(`open-ticket count failed: ${error.message}`);
  return count ?? 0;
}

export async function getTicketThread(ticketId: string) {
  const admin = getSupabaseAdmin();

  const { data: ticketData, error: ticketError } = await admin
    .from('tickets')
    .select(
      'id, number, subject, status, last_message_at, created_at, client_id, profiles!tickets_client_id_fkey ( full_name )'
    )
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return crmError(`thread load failed: ${ticketError.message}`);
  const row = ticketData as unknown as TicketJoin | null;
  if (!row) return crmError('Ticket not found.');

  const { data: userData } = await admin.auth.admin.getUserById(row.client_id);

  const { data: msgData, error: msgError } = await admin
    .from('ticket_messages')
    .select('id, body, created_at, author_id, profiles!ticket_messages_author_id_fkey ( full_name, role )')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (msgError) return crmError(`messages load failed: ${msgError.message}`);

  const messages: ThreadMessage[] = ((msgData ?? []) as unknown as Array<{
    id: string;
    body: string;
    created_at: string;
    profiles: { full_name: string | null; role: string } | null;
  }>).map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    author_name: m.profiles?.full_name ?? null,
    author_role: m.profiles?.role === 'admin' ? 'admin' : 'client',
  }));

  return {
    ok: true as const,
    ticket: mapTicket(row, userData?.user?.email ?? ''),
    messages,
  };
}

export async function adminReply(
  ticketId: string,
  authorId: string,
  body: string
): Promise<CrmResult> {
  const trimmed = body.trim().slice(0, 10000);
  if (trimmed.length === 0) return crmError('Reply cannot be empty.');

  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin.from('tickets').select('id').eq('id', ticketId).maybeSingle();
  if (!ticket) return crmError('Ticket not found.');

  const { error } = await admin
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, author_id: authorId, body: trimmed });
  if (error) return crmError(`Reply failed: ${error.message}`);

  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<CrmResult> {
  if (!isTicketStatus(status)) return crmError('Unknown status.');
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('tickets').update({ status }).eq('id', ticketId);
  if (error) return crmError(`Status update failed: ${error.message}`);
  return { ok: true };
}
