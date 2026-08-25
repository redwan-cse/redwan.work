'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { convertLead, inviteClient, setClientActive } from '@/lib/crm/clients';
import { adminReply, setTicketStatus } from '@/lib/crm/tickets';

export type CrmActionState = { error?: string; notice?: string };

async function requireAdmin() {
  const session = await getCurrentSession();
  return session && session.role === 'admin' ? session : null;
}

// Actions derive origins from request headers only — never from client input.
// Each action that needs a redirect base inlines this pattern (headers() is
// available inside server actions):
//   const h = await headers();
//   const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';
//   const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
//   const redirectToBase = `${proto}://${host}`;

export async function convertLeadAction(leadId: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const result = await convertLead(leadId, `${proto}://${host}`);
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin');
  return { notice: 'Client invited — ask them to check their inbox.' };
}

export async function replyToTicketAction(
  ticketId: string,
  _prev: CrmActionState,
  formData: FormData
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await adminReply(ticketId, session.userId, String(formData.get('body') ?? ''));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  return {};
}

export async function setTicketStatusAction(
  ticketId: string,
  status: string
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await setTicketStatus(ticketId, status as Parameters<typeof setTicketStatus>[1]);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath('/admin/tickets');
  return {};
}

export async function inviteClientAction(
  _prev: CrmActionState,
  formData: FormData
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const result = await inviteClient({
    email: String(formData.get('email') ?? ''),
    fullName: String(formData.get('fullName') ?? '') || undefined,
    company: String(formData.get('company') ?? '') || undefined,
    redirectToBase: `${proto}://${host}`,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/clients');
  revalidatePath('/admin');
  return { notice: 'Invitation sent.' };
}

export async function setClientActiveAction(
  clientId: string,
  active: boolean
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await setClientActive(clientId, active);
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/clients');
  revalidatePath('/admin');
  return {};
}
