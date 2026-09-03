import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import {
  queueEmail,
  sendNewTicketEmail,
  sendReplyPostedEmail,
  sendStatusChangedEmail,
  sendToAll,
} from '@/lib/email';
import {
  adminRecipients,
  emailOrigin,
  recipientEmail,
  recipientName,
  ticketEmailContext,
} from '@/lib/email/recipients';

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
  if (error) { console.error('Reply error:', error.message); return crmError('Reply could not be sent.'); }

  // Notify the client that support replied. Fail-soft: never blocks the reply.
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return { ok: false as const, error: 'Ticket context unavailable' };
    const to = await recipientEmail(ctx.clientId);
    if (!to) return { ok: false as const, error: 'Recipient unavailable' };
    const origin = await emailOrigin();
    return sendReplyPostedEmail({
      to,
      ticketId: ctx.ticketId,
      ticketNumber: ctx.ticketNumber,
      subject: ctx.subject,
      authorName: 'Support',
      bodyPreview: trimmed,
      ticketLink: `${origin}/portal/tickets/${ctx.ticketId}`,
    });
  });

  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<CrmResult> {
  if (!isTicketStatus(status)) return crmError('Unknown status.');
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('tickets').update({ status }).eq('id', ticketId);
  if (error) { console.error('Status update error:', error.message); return crmError('Status update failed.'); }

  // Tell the client their ticket moved. Fail-soft.
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return { ok: false as const, error: 'Ticket context unavailable' };
    const to = await recipientEmail(ctx.clientId);
    if (!to) return { ok: false as const, error: 'Recipient unavailable' };
    const origin = await emailOrigin();
    return sendStatusChangedEmail({
      to,
      ticketId: ctx.ticketId,
      ticketNumber: ctx.ticketNumber,
      subject: ctx.subject,
      status,
      ticketLink: `${origin}/portal/tickets/${ctx.ticketId}`,
    });
  });

  return { ok: true };
}

export interface PortalTicketRow {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  last_message_at: string;
  created_at: string;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 10000;
const TICKET_CAP_24H = 10;

function trimField(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function createTicket(
  clientId: string,
  subject: string,
  body: string
): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  const trimmedSubject = trimField(subject, MAX_SUBJECT);
  const trimmedBody = trimField(body, MAX_BODY);
  if (trimmedSubject.length === 0) return { ok: false, error: 'Subject is required.' };
  if (trimmedBody.length === 0) return { ok: false, error: 'Message is required.' };

  const admin = getSupabaseAdmin();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: capError } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', since);
  if (capError) return { ok: false, error: `Could not create ticket: ${capError.message}` };
  if ((count ?? 0) >= TICKET_CAP_24H) {
    return {
      ok: false,
      error:
        'You have created 10 tickets in the last 24 hours. Please reply to an existing ticket instead.',
    };
  }

  const { data: ticket, error: ticketError } = await admin
    .from('tickets')
    .insert({ client_id: clientId, subject: trimmedSubject })
    .select('id')
    .single();
  if (ticketError || !ticket)
    return { ok: false, error: `Could not create ticket: ${ticketError?.message ?? 'no row'}` };

  const { error: msgError } = await admin
    .from('ticket_messages')
    .insert({ ticket_id: ticket.id, author_id: clientId, body: trimmedBody });
  if (msgError) return { ok: false, error: `Could not create ticket: ${msgError.message}` };

  // Alert every active admin. Fail-soft: never blocks ticket creation.
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticket.id);
    if (!ctx) return { ok: false as const, error: 'Ticket context unavailable' };
    const recipients = await adminRecipients();
    const clientName = await recipientName(clientId);
    const origin = await emailOrigin();
    return sendToAll(recipients, (to) =>
      sendNewTicketEmail({
        to,
        ticketId: ctx.ticketId,
        ticketNumber: ctx.ticketNumber,
        subject: ctx.subject,
        clientName,
        ticketLink: `${origin}/admin/tickets/${ctx.ticketId}`,
      })
    );
  });

  return { ok: true, ticketId: ticket.id };
}

export async function listOwnTickets(clientId: string, limit?: number): Promise<PortalTicketRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('tickets')
    .select('id, number, subject, status, last_message_at, created_at')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`own tickets query failed: ${error.message}`);
  return (data ?? []) as PortalTicketRow[];
}

export async function countOwnOpenTickets(clientId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'open');
  if (error) throw new Error(`open-ticket count failed: ${error.message}`);
  return count ?? 0;
}

export async function getOwnTicketThread(clientId: string, ticketId: string) {
  const admin = getSupabaseAdmin();

  const { data: ticketData, error: ticketError } = await admin
    .from('tickets')
    .select('id, number, subject, status, last_message_at, created_at, client_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return crmError(`thread load failed: ${ticketError.message}`);
  if (!ticketData || ticketData.client_id !== clientId) return crmError('Ticket not found.');

  const { data: msgData, error: msgError } = await admin
    .from('ticket_messages')
    .select('id, body, created_at, profiles!ticket_messages_author_id_fkey ( full_name, role )')
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

  const row = ticketData as unknown as PortalTicketRow & { client_id: string };
  return { ok: true as const, ticket: row, messages };
}

export async function clientReply(
  ticketId: string,
  clientId: string,
  body: string
): Promise<CrmResult> {
  const trimmed = trimField(body, MAX_BODY);
  if (trimmed.length === 0) return crmError('Reply cannot be empty.');

  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, client_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket || ticket.client_id !== clientId) return crmError('Ticket not found.');

  const { error } = await admin
    .from('ticket_messages')
    .insert({ ticket_id: ticketId, author_id: clientId, body: trimmed });
  if (error) { console.error('Reply error:', error.message); return crmError('Reply could not be sent.'); }

  // Alert every active admin that the client replied. Fail-soft.
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return { ok: false as const, error: 'Ticket context unavailable' };
    const recipients = await adminRecipients();
    const authorName = await recipientName(clientId);
    const origin = await emailOrigin();
    return sendToAll(recipients, (to) =>
      sendReplyPostedEmail({
        to,
        ticketId: ctx.ticketId,
        ticketNumber: ctx.ticketNumber,
        subject: ctx.subject,
        authorName,
        bodyPreview: trimmed,
        ticketLink: `${origin}/admin/tickets/${ctx.ticketId}`,
      })
    );
  });

  return { ok: true };
}
