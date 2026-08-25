'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { createTicket, clientReply } from '@/lib/crm/tickets';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type PortalActionState = { error?: string; notice?: string };

async function requireClient() {
  const session = await getCurrentSession();
  if (!session || session.role !== 'client') return null;

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', session.userId)
    .maybeSingle();
  if (profile?.is_active !== true) return null;

  return session;
}

export async function createTicketAction(
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  const result = await createTicket(
    session.userId,
    String(formData.get('subject') ?? ''),
    String(formData.get('body') ?? '')
  );
  if (!result.ok) return { error: result.error };

  redirect(`/portal/tickets/${result.ticketId}`);
}

export async function clientReplyAction(
  ticketId: string,
  _prev: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const session = await requireClient();
  if (!session) return { error: 'Unauthorized.' };

  const result = await clientReply(ticketId, session.userId, String(formData.get('body') ?? ''));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath('/portal/tickets');
  revalidatePath('/portal');
  return {};
}
