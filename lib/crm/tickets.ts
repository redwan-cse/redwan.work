import 'server-only';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import { decodeThreadCursor, threadCursorFilter, threadWindow, THREAD_PAGE_SIZE, type ThreadPageInfo } from '@/lib/crm/thread-pagination';
import { queueEmail, recordUnsent, sendNewTicketEmail, sendReplyPostedEmail, sendStatusChangedEmail, sendToAll } from '@/lib/email';
import { adminRecipients, emailOrigin, recipientEmail, recipientName, ticketEmailContext } from '@/lib/email/recipients';
import type { AttachmentEntry } from '@/lib/crm/attachments';
export type TicketStatus = 'open' | 'answered' | 'awaiting_client' | 'closed';
const TICKET_STATUSES: TicketStatus[] = ['open', 'answered', 'awaiting_client', 'closed'];
export function isTicketStatus(value: unknown): value is TicketStatus { return typeof value === 'string' && TICKET_STATUSES.includes(value as TicketStatus); }
export interface TicketRow { id: string; number: number; subject: string; status: TicketStatus; last_message_at: string; created_at: string; client_id: string; client_name: string | null; client_email: string; }
export interface ThreadMessage { id: string; body: string; created_at: string; author_name: string | null; author_role: 'admin' | 'client'; }
interface TicketJoin { id: string; number: number; subject: string; status: TicketStatus; last_message_at: string; created_at: string; client_id: string; profiles: { full_name: string | null } | null; }
const PAGE_SIZE = 20;
function mapTicket(row: TicketJoin, email: string): TicketRow {
  return { id: row.id, number: row.number, subject: row.subject, status: row.status, last_message_at: row.last_message_at, created_at: row.created_at, client_id: row.client_id, client_name: row.profiles?.full_name ?? null, client_email: email };
}
export async function listTickets(params: { status?: TicketStatus; page?: number }) {
  const admin = getSupabaseAdmin();
  const page = Number.isSafeInteger(params.page) && params.page! > 0 ? params.page! : 1;
  let query = admin.from('tickets').select('id, number, subject, status, last_message_at, created_at, client_id, profiles!tickets_client_id_fkey ( full_name )', { count: 'exact' }).order('last_message_at', { ascending: false }).order('id').range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);
  if (params.status) query = query.eq('status', params.status);
  const { data, error, count } = await query;
  if (error) throw new Error('Could not load tickets.');
  const rows = (data ?? []) as unknown as TicketJoin[];
  // Deduplicate account hydration within the bounded page.
  const emails = new Map<string, string>();
  await Promise.all([...new Set(rows.map(row => row.client_id))].map(async id => {
    const { data: user } = await admin.auth.admin.getUserById(id); emails.set(id, user?.user?.email ?? '');
  }));
  const total = count ?? 0;
  return { items: rows.map(row => mapTicket(row, emails.get(row.client_id) ?? '')), total, page, pageCount: Math.max(1, Math.ceil(total/PAGE_SIZE)) };
}
export async function countOpenTickets(): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('tickets').select('id', { count: 'exact', head: true }).eq('status','open');
  if (error) throw new Error('Could not count tickets.');
  return count ?? 0;
}
export type ThreadFailure={ok:false;kind:'not_found'|'invalid_cursor'|'unavailable';error:string};
function threadError(kind:ThreadFailure['kind'],error:string):ThreadFailure{return {ok:false,kind,error};}
async function threadMessages(ticketId: string, rawCursor?:unknown):Promise<{ok:true;messages:ThreadMessage[];pageInfo:ThreadPageInfo}|ThreadFailure> {
  const cursor=decodeThreadCursor(rawCursor,ticketId);
  if(cursor===false)return threadError('invalid_cursor','Invalid conversation page. Return to the latest messages.');
  try{
    let query=getSupabaseAdmin().from('ticket_messages').select('id, body, created_at, profiles!ticket_messages_author_id_fkey ( full_name, role )').eq('ticket_id',ticketId);
    if(cursor)query=query.or(threadCursorFilter(cursor));
    const ascending=cursor?.direction==='newer';
    const {data,error}=await query.order('created_at',{ascending}).order('id',{ascending}).limit(THREAD_PAGE_SIZE+1);
    if(error)return threadError('unavailable','Could not load messages.');
    const window=threadWindow(ticketId,(data??[]) as unknown as Array<{id:string;body:string;created_at:string;profiles:{full_name:string|null;role:string}|null}>,cursor);
    return {ok:true,messages:window.rows.map(m=>({id:m.id,body:m.body,created_at:m.created_at,author_name:m.profiles?.full_name??null,author_role:m.profiles?.role==='admin'?'admin':'client'})),pageInfo:window.pageInfo};
  }catch{return threadError('unavailable','Could not load messages.');}
}
export async function getTicketThread(ticketId: string, cursor?:unknown) {
  try{
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('tickets').select('id, number, subject, status, last_message_at, created_at, client_id, profiles!tickets_client_id_fkey ( full_name )').eq('id',ticketId).maybeSingle();
    if (error) return threadError('unavailable','Could not load ticket.');
    if (!data) return threadError('not_found','Ticket not found.');
    const row = data as unknown as TicketJoin;
    const messages=await threadMessages(ticketId,cursor);if(!messages.ok)return messages;
    const {data:user,error:accountError}=await admin.auth.admin.getUserById(row.client_id);
    if(accountError)return threadError('unavailable','Could not load ticket.');
    return {ok:true as const,ticket:mapTicket(row,user?.user?.email??''),messages:messages.messages,pageInfo:messages.pageInfo};
  }catch{return threadError('unavailable','Could not load ticket.');}
}
function notifyReply(ticketId: string, authorId: string, body: string, adminAuthor: boolean) {
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return recordUnsent({ template:'reply-posted',reason:'Ticket context unavailable',entityType:'ticket',entityId:ticketId });
    const origin = await emailOrigin();
    const authorName = adminAuthor ? 'Support' : await recipientName(authorId);
    const send = (to: string) => sendReplyPostedEmail({ to,ticketId:ctx.ticketId,ticketNumber:ctx.ticketNumber,subject:ctx.subject,authorName,bodyPreview:body,ticketLink:`${origin}/${adminAuthor ? 'portal' : 'admin'}/tickets/${ctx.ticketId}` });
    if (adminAuthor) {
      const to = await recipientEmail(ctx.clientId);
      return to ? send(to) : recordUnsent({ template:'reply-posted',reason:'Recipient unavailable',entityType:'ticket',entityId:ticketId });
    }
    return sendToAll(await adminRecipients(),send,{ template:'reply-posted',entityType:'ticket',entityId:ticketId });
  });
}
export async function adminReply(ticketId: string, authorId: string, body: string): Promise<CrmResult> {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 10000) return crmError('Reply must contain between 1 and 10000 characters.');
  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin.from('tickets').select('id').eq('id',ticketId).maybeSingle();
  if (!ticket) return crmError('Ticket not found.');
  const { error } = await admin.from('ticket_messages').insert({ ticket_id:ticketId,author_id:authorId,body:body.trim() });
  if (error) return crmError('Reply could not be sent.');
  notifyReply(ticketId,authorId,body.trim(),true);
  return { ok:true };
}
export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<CrmResult> {
  if (!isTicketStatus(status)) return crmError('Unknown status.');
  const admin = getSupabaseAdmin();
  const { data: before, error: readError } = await admin.from('tickets').select('status').eq('id',ticketId).maybeSingle();
  if (readError) return crmError('Status update failed.');
  if (!before) return crmError('Ticket not found.');
  if (before.status === status) return { ok:true };
  const { data: changed, error } = await admin.from('tickets').update({ status }).eq('id',ticketId).eq('status',before.status).select('id').maybeSingle();
  if (error || !changed) return crmError('Ticket changed. Refresh and try again.');
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return recordUnsent({ template:'status-changed',reason:'Ticket context unavailable',entityType:'ticket',entityId:ticketId });
    const to = await recipientEmail(ctx.clientId);
    if (!to) return recordUnsent({ template:'status-changed',reason:'Recipient unavailable',entityType:'ticket',entityId:ticketId });
    return sendStatusChangedEmail({ to,ticketId:ctx.ticketId,ticketNumber:ctx.ticketNumber,subject:ctx.subject,status,ticketLink:`${await emailOrigin()}/portal/tickets/${ctx.ticketId}` });
  });
  return { ok:true };
}
export interface PortalTicketRow { id: string; number: number; subject: string; status: TicketStatus; last_message_at: string; created_at: string; }
export async function createTicket(clientId: string, subject: string, body: string, entries: AttachmentEntry[] = [], requestId = randomUUID()): Promise<{ ok:true; ticketId:string } | { ok:false; error:string }> {
  if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 200) return { ok:false,error:'Subject must contain between 1 and 200 characters.' };
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 10000) return { ok:false,error:'Message must contain between 1 and 10000 characters.' };
  const { data, error } = await getSupabaseAdmin().rpc('create_ticket_atomic', { p_client:clientId,p_request:requestId,p_subject:subject.trim(),p_body:body.trim(),p_entries:entries });
  if (error || typeof data !== 'string') {
    const errorText = error?.message === 'Ticket limit reached' ? 'You have created 10 tickets in the last 24 hours. Please reply to an existing ticket instead.' : error?.message === 'Submission conflict' ? 'This submission changed. Reopen the form to create a different ticket.' : 'Could not create ticket. Please try again.';
    return { ok:false,error:errorText };
  }
  const ticketId = data;
  queueEmail(async () => {
    const ctx = await ticketEmailContext(ticketId);
    if (!ctx) return recordUnsent({ template:'new-ticket',reason:'Ticket context unavailable',entityType:'ticket',entityId:ticketId });
    const recipients = await adminRecipients();
    const clientName = await recipientName(clientId);
    const origin = await emailOrigin();
    return sendToAll(recipients,to => sendNewTicketEmail({ to,ticketId:ctx.ticketId,ticketNumber:ctx.ticketNumber,subject:ctx.subject,clientName,ticketLink:`${origin}/admin/tickets/${ctx.ticketId}` }),{ template:'new-ticket',entityType:'ticket',entityId:ticketId });
  });
  return { ok:true,ticketId };
}
export async function listOwnTickets(clientId: string, limit?: number): Promise<PortalTicketRow[]> {
  let query = getSupabaseAdmin().from('tickets').select('id, number, subject, status, last_message_at, created_at').eq('client_id',clientId).order('last_message_at',{ ascending:false });
  if (limit) query = query.limit(limit);
  const { data,error } = await query;
  if (error) throw new Error('Could not load tickets.');
  return (data ?? []) as PortalTicketRow[];
}
export async function countOwnOpenTickets(clientId: string): Promise<number> {
  const { count,error } = await getSupabaseAdmin().from('tickets').select('id',{ count:'exact',head:true }).eq('client_id',clientId).eq('status','open');
  if (error) throw new Error('Could not count tickets.');
  return count ?? 0;
}
export async function getOwnTicketThread(clientId: string,ticketId: string,cursor?:unknown) {
  try{
    const { data,error } = await getSupabaseAdmin().from('tickets').select('id, number, subject, status, last_message_at, created_at, client_id').eq('id',ticketId).eq('client_id',clientId).maybeSingle();
    if (error) return threadError('unavailable','Could not load ticket.');
    if (!data) return threadError('not_found','Ticket not found.');
    const messages=await threadMessages(ticketId,cursor);if(!messages.ok)return messages;
    return {ok:true as const,ticket:data as PortalTicketRow & {client_id:string},messages:messages.messages,pageInfo:messages.pageInfo};
  }catch{return threadError('unavailable','Could not load ticket.');}
}
export async function clientReply(ticketId: string,clientId: string,body: string): Promise<CrmResult> {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 10000) return crmError('Reply must contain between 1 and 10000 characters.');
  const admin = getSupabaseAdmin();
  const { data: ticket } = await admin.from('tickets').select('id').eq('id',ticketId).eq('client_id',clientId).maybeSingle();
  if (!ticket) return crmError('Ticket not found.');
  const { error } = await admin.from('ticket_messages').insert({ ticket_id:ticketId,author_id:clientId,body:body.trim() });
  if (error) return crmError('Reply could not be sent.');
  notifyReply(ticketId,clientId,body.trim(),false);
  return { ok:true };
}
