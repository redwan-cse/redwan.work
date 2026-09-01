'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { convertLead, inviteClient, setClientActive } from '@/lib/crm/clients';
import { adminReply, setTicketStatus } from '@/lib/crm/tickets';
import {
  addMilestone,
  archiveProject,
  createProject,
  deleteMilestone,
  getArchiveDownloadUrl,
  moveMilestone,
  purgeArchivedProject,
  updateMilestone,
  updateProject,
} from '@/lib/crm/projects';
import { createFileRow, deleteOwnedFile } from '@/lib/crm/files';
import { makeDeliverableKey, presignPrivatePut, validateContactFile } from '@/lib/r2';
import { addInvoiceItem, confirmPayment, createDraftInvoice, createDraftInvoiceWithItems, deleteInvoiceItem, getInvoiceDetail, rejectPayment, sendInvoice, updateDraftInvoice, updateInvoiceItem, voidInvoice } from '@/lib/crm/invoices';

export type CrmActionState = { error?: string; notice?: string; invoiceId?: string };

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

export async function createProjectAction(_prev: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const client_id = String(formData.get('client_id') ?? '').trim();
  const name = String(formData.get('name') ?? '');
  const description = String(formData.get('description') ?? '');
  const due_at = String(formData.get('due_at') ?? '').trim();

  const result = await createProject({
    client_id,
    name,
    description: description || undefined,
    due_at: due_at || undefined,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/projects');
  revalidatePath('/admin');
  return { notice: 'Project created.' };
}

export async function updateProjectAction(
  projectId: string,
  _prev: CrmActionState,
  formData: FormData
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const patch: { name?: string; description?: string | null; status?: 'active' | 'paused' | 'done'; due_at?: string | null } = {};

  if (formData.has('name')) patch.name = String(formData.get('name') ?? '');
  if (formData.has('description')) {
    const v = String(formData.get('description') ?? '');
    patch.description = v === '' && formData.get('description') === '' ? '' : v;
    // allow explicit null via empty string handling – caller decides
    // we keep string; updateProject will normalize empty to null
  }
  if (formData.has('status')) {
    const s = String(formData.get('status') ?? '').trim();
    if (s) patch.status = s as 'active' | 'paused' | 'done';
  }
  if (formData.has('due_at')) {
    const v = String(formData.get('due_at') ?? '').trim();
    patch.due_at = v === '' ? null : v;
  }

  const result = await updateProject(projectId, patch);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/admin/projects');
  revalidatePath('/admin');
  return {};
}

export async function addMilestoneAction(
  projectId: string,
  _prev: CrmActionState,
  formData: FormData
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const title = String(formData.get('title') ?? '');
  const currency = String(formData.get('currency') ?? '').trim() || undefined;

  let amount_cents: number | undefined;
  const rawCents = String(formData.get('amount_cents') ?? '').trim();
  const rawAmount = String(formData.get('amount') ?? '').trim();
  if (rawCents) {
    const n = Number(rawCents);
    if (!Number.isFinite(n)) return { error: 'Invalid amount.' };
    amount_cents = Math.round(n);
  } else if (rawAmount) {
    const n = Number(rawAmount);
    if (!Number.isFinite(n)) return { error: 'Invalid amount.' };
    // amount could be dollars with decimals
    amount_cents = Math.round(n * 100);
  }

  const result = await addMilestone(projectId, { title, amount_cents, currency });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

export async function updateMilestoneAction(
  milestoneId: string,
  _prev: CrmActionState,
  formData: FormData
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const patchRaw = String(formData.get('patch') ?? '').trim();
  let patch: { title?: string; amount_cents?: number; status?: 'pending' | 'in_progress' | 'done' } = {};

  if (patchRaw) {
    try {
      patch = JSON.parse(patchRaw);
    } catch {
      return { error: 'Invalid patch JSON.' };
    }
  } else {
    if (formData.has('title')) patch.title = String(formData.get('title') ?? '');
    if (formData.has('status')) patch.status = String(formData.get('status') ?? '') as 'pending' | 'in_progress' | 'done';
    if (formData.has('amount_cents')) {
      const v = String(formData.get('amount_cents') ?? '').trim();
      if (v) patch.amount_cents = Number(v);
    } else if (formData.has('amount')) {
      const v = String(formData.get('amount') ?? '').trim();
      if (v) patch.amount_cents = Math.round(Number(v) * 100);
    }
  }

  const result = await updateMilestone(milestoneId, patch);
  if (!result.ok) return { error: result.error };

  // revalidate project detail if we can lookup project_id
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('milestones').select('project_id').eq('id', milestoneId).maybeSingle();
    const pid = (data as { project_id: string } | null)?.project_id;
    if (pid) revalidatePath(`/admin/projects/${pid}`);
  } catch {
    // ignore
  }
  revalidatePath('/admin/projects');
  return {};
}

export async function setMilestoneStatusAction(milestoneId: string, status: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await updateMilestone(milestoneId, { status: status as 'pending' | 'in_progress' | 'done' });
  if (!result.ok) return { error: result.error };

  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('milestones').select('project_id').eq('id', milestoneId).maybeSingle();
    const pid = (data as { project_id: string } | null)?.project_id;
    if (pid) revalidatePath(`/admin/projects/${pid}`);
  } catch {}
  revalidatePath('/admin/projects');
  return {};
}

export async function deleteMilestoneAction(milestoneId: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  let projectId: string | null = null;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('milestones').select('project_id').eq('id', milestoneId).maybeSingle();
    projectId = (data as { project_id: string } | null)?.project_id ?? null;
  } catch {}

  const result = await deleteMilestone(milestoneId);
  if (!result.ok) return { error: result.error };
  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/admin/projects');
  return {};
}

export async function moveMilestoneAction(
  milestoneId: string,
  direction: 'up' | 'down'
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await moveMilestone(milestoneId, direction);
  if (!result.ok) return { error: result.error };

  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('milestones').select('project_id').eq('id', milestoneId).maybeSingle();
    const pid = (data as { project_id: string } | null)?.project_id;
    if (pid) revalidatePath(`/admin/projects/${pid}`);
  } catch {}
  revalidatePath('/admin/projects');
  return {};
}

export async function getDeliverablePresignAction(
  projectId: string,
  filename: string,
  mime: string,
  size: number
): Promise<{ ok: true; key: string; uploadUrl: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: 'Unauthorized.' };

  const check = validateContactFile({ filename, mime, size });
  if (!check.ok) return { ok: false, error: check.error };

  const admin = getSupabaseAdmin();
  const { data: project, error } = await admin.from('projects').select('client_id').eq('id', projectId).maybeSingle();
  if (error) return { ok: false, error: `Project lookup failed: ${error.message}` };
  if (!project) return { ok: false, error: 'Project not found.' };

  const clientId = (project as { client_id: string }).client_id;

  let key: string;
  try {
    key = makeDeliverableKey(clientId, projectId, check.ext);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  try {
    const uploadUrl = await presignPrivatePut(key, mime, 600);
    return { ok: true, key, uploadUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function confirmDeliverableAction(
  projectId: string,
  meta: { key: string; filename: string; mime: string; size_bytes: number }
): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await createFileRow({
    bucket: 'private',
    r2_key: meta.key,
    kind: 'deliverable',
    project_id: projectId,
    uploaded_by: session.userId,
    filename: meta.filename,
    mime: meta.mime,
    size_bytes: meta.size_bytes,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/admin/projects');
  return {};
}

export async function deleteFileAction(fileId: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  let projectId: string | null = null;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('files').select('project_id').eq('id', fileId).maybeSingle();
    projectId = (data as { project_id: string | null } | null)?.project_id ?? null;
  } catch {}

  const result = await deleteOwnedFile(fileId, { userId: session.userId, role: 'admin' });
  if (!result.ok) return { error: result.error };
  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/admin/projects');
  revalidatePath('/admin');
  return {};
}

export async function archiveProjectAction(projectId: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await archiveProject(projectId);
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/projects');
  revalidatePath('/admin');
  return { notice: 'Project archived. Download the backup from the Projects list within 30 days.' };
}

export async function purgeArchivedProjectAction(projectId: string): Promise<CrmActionState> {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized.' };

  const result = await purgeArchivedProject(projectId);
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/projects');
  revalidatePath('/admin');
  return {};
}

export async function archiveDownloadUrlAction(
  projectId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: 'Unauthorized.' };

  return getArchiveDownloadUrl(projectId);
}

function revalidateInvoice(invoiceId: string, projectId?: string) {
  revalidatePath('/admin'); revalidatePath('/admin/invoices'); revalidatePath(`/admin/invoices/${invoiceId}`); if (projectId) revalidatePath(`/admin/projects/${projectId}`);
}

async function invoiceProjectId(invoiceId: string) {
  const { data: invoice } = await getSupabaseAdmin().from('invoices').select('project_id').eq('id', invoiceId).maybeSingle();
  return invoice?.project_id as string | undefined;
}

async function revalidateInvoiceForItem(itemId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('invoice_items').select('invoice_id').eq('id', itemId).maybeSingle();
  if (!data) return;
  const detail = await getInvoiceDetail(data.invoice_id, { userId: '', role: 'admin' });
  revalidateInvoice(data.invoice_id, detail.ok ? detail.invoice.project_id : undefined);
}

export async function createDraftInvoiceAction(input: { project_id: string; currency?: string; due_at?: string | null; payment_note?: string | null }): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const result = await createDraftInvoice(input); if (!result.ok) return { error: result.error }; revalidateInvoice(result.invoiceId, input.project_id); return { notice: 'Draft created.', invoiceId: result.invoiceId }; }
export async function createDraftInvoiceWithItemsAction(input: Parameters<typeof createDraftInvoiceWithItems>[0]): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const result = await createDraftInvoiceWithItems(input); if (!result.ok) return { error: result.error }; revalidateInvoice(result.invoiceId, input.project_id); return { notice: 'Draft created.', invoiceId: result.invoiceId }; }
export async function updateDraftInvoiceAction(invoiceId: string, patch: Parameters<typeof updateDraftInvoice>[1]): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const before = await invoiceProjectId(invoiceId); const result = await updateDraftInvoice(invoiceId, patch); if (!result.ok) return { error: result.error }; const after = await invoiceProjectId(invoiceId); revalidateInvoice(invoiceId, after ?? before); if (before && after && before !== after) revalidatePath(`/admin/projects/${before}`); return {}; }
export async function addInvoiceItemAction(invoiceId: string, input: Parameters<typeof addInvoiceItem>[1]): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const projectId = await invoiceProjectId(invoiceId); const result = await addInvoiceItem(invoiceId, input); if (!result.ok) return { error: result.error }; revalidateInvoice(invoiceId, projectId); return {}; }
export async function updateInvoiceItemAction(itemId: string, patch: Parameters<typeof updateInvoiceItem>[1]): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const result = await updateInvoiceItem(itemId, patch); if (!result.ok) return { error: result.error }; await revalidateInvoiceForItem(itemId); return {}; }
export async function deleteInvoiceItemAction(itemId: string): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const admin = getSupabaseAdmin(); const { data: item } = await admin.from('invoice_items').select('invoice_id').eq('id', itemId).maybeSingle(); const result = await deleteInvoiceItem(itemId); if (!result.ok) return { error: result.error }; if (item?.invoice_id) { const detail = await getInvoiceDetail(item.invoice_id, { userId: '', role: 'admin' }); revalidateInvoice(item.invoice_id, detail.ok ? detail.invoice.project_id : undefined); } else { revalidatePath('/admin'); revalidatePath('/admin/invoices'); } return {}; }
export async function sendInvoiceAction(invoiceId: string): Promise<CrmActionState> { const session = await requireAdmin(); if (!session) return { error: 'Unauthorized.' }; const detail = await getInvoiceDetail(invoiceId, { userId: session.userId, role: 'admin' }); const result = await sendInvoice(invoiceId); if (!result.ok) return { error: result.error }; revalidateInvoice(invoiceId, detail.ok ? detail.invoice.project_id : undefined); return {}; }
export async function voidInvoiceAction(invoiceId: string): Promise<CrmActionState> { if (!await requireAdmin()) return { error: 'Unauthorized.' }; const projectId = await invoiceProjectId(invoiceId); const result = await voidInvoice(invoiceId); if (!result.ok) return { error: result.error }; revalidateInvoice(invoiceId, projectId); return {}; }
export async function confirmPaymentAction(paymentId: string): Promise<CrmActionState> { const session = await requireAdmin(); if (!session) return { error: 'Unauthorized.' }; const payment = await getSupabaseAdmin().from('payments').select('invoice_id').eq('id', paymentId).maybeSingle(); const detail = payment.data ? await getInvoiceDetail(payment.data.invoice_id, { userId: session.userId, role: 'admin' }) : null; const result = await confirmPayment(paymentId, session.userId); if (!result.ok) return { error: result.error }; revalidateInvoice(payment.data?.invoice_id ?? paymentId, detail?.ok ? detail.invoice.project_id : undefined); return {}; }
export async function rejectPaymentAction(paymentId: string): Promise<CrmActionState> { const session = await requireAdmin(); if (!session) return { error: 'Unauthorized.' }; const payment = await getSupabaseAdmin().from('payments').select('invoice_id').eq('id', paymentId).maybeSingle(); const detail = payment.data ? await getInvoiceDetail(payment.data.invoice_id, { userId: session.userId, role: 'admin' }) : null; const result = await rejectPayment(paymentId); if (!result.ok) return { error: result.error }; revalidateInvoice(payment.data?.invoice_id ?? paymentId, detail?.ok ? detail.invoice.project_id : undefined); return {}; }
