'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { validateAttachments, validUuid, ATTACHMENT_ERROR, type AttachmentEntry } from '@/lib/crm/attachments';
export async function shareTicketFilesAction(ticketId: string, raw: AttachmentEntry[]): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error:'Unauthorized.' };
  if (!validUuid(ticketId)) return { error:'Ticket not found.' };
  const admin = getSupabaseAdmin();
  const { data: profile,error: profileError } = await admin.from('profiles').select('role, is_active').eq('id',session.userId).maybeSingle();
  if (profileError || profile?.is_active !== true || profile.role !== session.role) return { error:'Unauthorized.' };
  const { data: ticket,error } = await admin.from('tickets').select('client_id').eq('id',ticketId).maybeSingle();
  if (error || !ticket || (session.role !== 'admin' && ticket.client_id !== session.userId)) return { error:'Ticket not found.' };
  const entries = await validateAttachments(raw,ticket.client_id,ticketId);
  if (!entries || !entries.length) return { error:ATTACHMENT_ERROR };
  try {
    const { error: saveError } = await admin.rpc('attach_ticket_files_atomic',{ p_actor:session.userId,p_ticket:ticketId,p_entries:entries });
    if (saveError) return { error:saveError.message === 'Attachment limit reached' ? 'A ticket can have at most 10 attachments.' : ATTACHMENT_ERROR };
  } catch { return { error:ATTACHMENT_ERROR }; }
  revalidatePath(`/admin/tickets/${ticketId}`); revalidatePath(`/portal/tickets/${ticketId}`);
  return {};
}
