'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { getCurrentSession } from '@/lib/auth/session';
import { createTicket, clientReply } from '@/lib/crm/tickets';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { prepareTicketUploads, validateAttachments, validUuid, ATTACHMENT_ERROR, type AttachmentEntry } from '@/lib/crm/attachments';
import { submitPayment } from '@/lib/crm/invoices';
export type PortalActionState = { error?: string; notice?: string };
async function requireClient() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'client') return null;
  const { data: profile, error } = await getSupabaseAdmin().from('profiles').select('role, is_active').eq('id', session.userId).maybeSingle();
  return !error && profile?.role === 'client' && profile.is_active === true ? session : null;
}
function refreshTicket(id: string) {
  revalidatePath(`/portal/tickets/${id}`); revalidatePath('/portal/tickets'); revalidatePath('/portal');
}
export async function createTicketWithAttachmentsAction(subject: string, body: string, entries: AttachmentEntry[], requestId?: string): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };
  if (requestId !== undefined && !validUuid(requestId)) return { error: 'Invalid submission. Please reopen the form.' };
  const validated = await validateAttachments(entries, session.userId, null);
  if (!validated) return { error: ATTACHMENT_ERROR };
  const result = await createTicket(session.userId, subject, body, validated, requestId ?? randomUUID());
  if (!result.ok) return { error: result.error };
  refreshTicket(result.ticketId);
  redirect(`/portal/tickets/${result.ticketId}`);
}
export async function clientReplyAction(ticketId: string, _prev: PortalActionState, formData: FormData): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };
  if (!validUuid(ticketId)) return { error: 'Ticket not found.' };
  const result = await clientReply(ticketId, session.userId, String(formData.get('body') ?? ''));
  if (!result.ok) return { error: result.error };
  refreshTicket(ticketId);
  return {};
}
// Compatibility wrapper: uses the exact same validation, rate budget and size as the route.
export async function getTicketAttachmentPresignAction(input: { ticketId: string | null; filename: string; mime: string; size: number }): Promise<{ ok: true; key: string; uploadUrl: string } | { ok: false; error: string }> {
  const session = await requireClient();
  if (!session) return { ok: false, error: 'Unauthorized.' };
  if (!input) return { ok: false, error: ATTACHMENT_ERROR };
  const result = await prepareTicketUploads(session, input.ticketId, [{ filename: input.filename, mime: input.mime, size: input.size }]);
  return result.ok ? { ok: true, key: result.uploads[0].key, uploadUrl: result.uploads[0].uploadUrl } : { ok: false, error: result.error };
}
export async function confirmTicketAttachmentAction(input: { ticketId: string | null; entries: AttachmentEntry[] }): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };
  if (!input || !validUuid(input.ticketId)) return { error: 'Choose a ticket before confirming files.' };
  const admin = getSupabaseAdmin();
  const { data: ticket, error } = await admin.from('tickets').select('client_id').eq('id', input.ticketId).maybeSingle();
  if (error || ticket?.client_id !== session.userId) return { error: 'Ticket not found.' };
  const entries = await validateAttachments(input.entries, session.userId, input.ticketId);
  if (!entries || !entries.length) return { error: ATTACHMENT_ERROR };
  try {
    const { error: saveError } = await admin.rpc('attach_ticket_files_atomic', { p_actor: session.userId, p_ticket: input.ticketId, p_entries: entries });
    if (saveError) return { error: saveError.message === 'Attachment limit reached' ? 'A ticket can have at most 10 attachments.' : ATTACHMENT_ERROR };
  } catch { return { error: ATTACHMENT_ERROR }; }
  refreshTicket(input.ticketId);
  return { notice: 'Files shared with this ticket.' };
}
export async function submitPaymentAction(invoiceId: string, input: { method: 'bank' | 'bkash' | 'paypal' | 'other'; reference: string; amount_cents: number }): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };
  const result = await submitPayment(invoiceId, session.userId, input);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/portal/invoices/${invoiceId}`); revalidatePath('/portal/invoices'); revalidatePath('/portal');
  return { notice: 'Payment submitted for review.' };
}
