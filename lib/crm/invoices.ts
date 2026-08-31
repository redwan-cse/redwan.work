import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type PaymentMethod = 'bank' | 'bkash' | 'paypal' | 'other';
export type PaymentStatus = 'submitted' | 'confirmed' | 'rejected';
export type InvoiceViewer = { userId: string; role: 'admin' | 'client' };

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  qty: number;
  unit_price_cents: number;
  position: number;
}

export interface PaymentRow {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  reference: string;
  amount_cents: number;
  status: PaymentStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  project_id: string;
  project_name: string;
  client_id: string;
  client_name: string | null;
  client_email: string;
  number: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  payment_note: string | null;
  total_cents: number;
  submitted_cents: number;
  confirmed_cents: number;
  outstanding_cents: number;
  created_at: string;
}

type Amounts = Pick<InvoiceRow, 'total_cents' | 'submitted_cents' | 'confirmed_cents' | 'outstanding_cents'>;
type RawInvoice = Omit<InvoiceRow, keyof Amounts | 'project_name' | 'client_name' | 'client_email'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS: readonly PaymentMethod[] = ['bank', 'bkash', 'paypal', 'other'];
const STATUSES: readonly InvoiceStatus[] = ['draft', 'sent', 'paid', 'void'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function calculateAmounts(items: Pick<InvoiceItemRow, 'qty' | 'unit_price_cents'>[], payments: Pick<PaymentRow, 'amount_cents' | 'status'>[]): Amounts {
  const total_cents = items.reduce((sum, item) => sum + Math.round(Number(item.qty) * Number(item.unit_price_cents)), 0);
  const submitted_cents = payments.reduce((sum, payment) => payment.status === 'submitted' || payment.status === 'confirmed' ? sum + Number(payment.amount_cents) : sum, 0);
  const confirmed_cents = payments.reduce((sum, payment) => payment.status === 'confirmed' ? sum + Number(payment.amount_cents) : sum, 0);
  return { total_cents, submitted_cents, confirmed_cents, outstanding_cents: Math.max(total_cents - confirmed_cents, 0) };
}

function invalid(message = 'Invalid invoice data.') { return crmError(message); }
function validUuid(value: string) { return typeof value === 'string' && UUID_RE.test(value); }
function validStatus(value: unknown): value is InvoiceStatus { return typeof value === 'string' && STATUSES.includes(value as InvoiceStatus); }
function validMethod(value: unknown): value is PaymentMethod { return typeof value === 'string' && METHODS.includes(value as PaymentMethod); }
function validDate(value: string | null | undefined) { if (value == null || value === '') return true; if (!DATE_RE.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }

async function loadPayments(invoiceId: string) {
  const { data, error } = await getSupabaseAdmin().from('payments').select('id, invoice_id, method, reference, amount_cents, status, confirmed_by, confirmed_at, created_at').eq('invoice_id', invoiceId).order('created_at', { ascending: true });
  if (error) return { ok: false as const, error: 'Invoice operation failed.' };
  return { ok: true as const, payments: (data ?? []) as PaymentRow[] };
}

async function loadItems(invoiceId: string) {
  const { data, error } = await getSupabaseAdmin().from('invoice_items').select('id, invoice_id, description, qty, unit_price_cents, position').eq('invoice_id', invoiceId).order('position', { ascending: true });
  if (error) return { ok: false as const, error: 'Invoice operation failed.' };
  return { ok: true as const, items: (data ?? []) as InvoiceItemRow[] };
}

async function hydrate(raw: RawInvoice): Promise<InvoiceRow> {
  const admin = getSupabaseAdmin();
  const [{ data: project }, { data: profile }, { data: user }] = await Promise.all([
    admin.from('projects').select('name, client_id').eq('id', raw.project_id).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', raw.client_id).maybeSingle(),
    admin.auth.admin.getUserById(raw.client_id),
  ]);
  const amounts = await invoiceAmounts(raw.id);
  return { ...raw, project_name: (project as { name?: string } | null)?.name ?? '', client_id: (project as { client_id?: string } | null)?.client_id ?? raw.client_id, client_name: (profile as { full_name: string | null } | null)?.full_name ?? null, client_email: user?.user?.email ?? '', ...amounts };
}

async function invoiceAmounts(invoiceId: string): Promise<Amounts> {
  const [items, payments] = await Promise.all([loadItems(invoiceId), loadPayments(invoiceId)]);
  return calculateAmounts(items.ok ? items.items : [], payments.ok ? payments.payments : []);
}

async function getRaw(invoiceId: string) {
  if (!validUuid(invoiceId)) return { ok: false as const, error: 'Invoice not found.' };
  const { data, error } = await getSupabaseAdmin().from('invoices').select('id, project_id, number, currency, status, issued_at, due_at, payment_note, created_at').eq('id', invoiceId).maybeSingle();
  if (error || !data) return { ok: false as const, error: 'Invoice not found.' };
  const project = await getSupabaseAdmin().from('projects').select('client_id').eq('id', data.project_id).maybeSingle();
  if (project.error || !project.data) return { ok: false as const, error: 'Invoice not found.' };
  return { ok: true as const, raw: { ...data, client_id: project.data.client_id } as RawInvoice };
}

export async function listInvoices(viewer: InvoiceViewer, status?: InvoiceStatus): Promise<InvoiceRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from('invoices').select('id, project_id, number, currency, status, issued_at, due_at, payment_note, created_at').order('created_at', { ascending: false });
  if (status && validStatus(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return [];
  const rows: InvoiceRow[] = [];
  for (const raw of (data ?? []) as RawInvoice[]) {
    const project = await admin.from('projects').select('client_id').eq('id', raw.project_id).maybeSingle();
    if (!project.data || (viewer.role === 'client' && project.data.client_id !== viewer.userId)) continue;
    rows.push(await hydrate({ ...raw, client_id: project.data.client_id }));
  }
  return rows;
}

export async function getInvoiceDetail(invoiceId: string, viewer: InvoiceViewer): Promise<{ ok: true; invoice: InvoiceRow; items: InvoiceItemRow[]; payments: PaymentRow[] } | { ok: false; error: string }> {
  const found = await getRaw(invoiceId);
  if (!found.ok || (viewer.role === 'client' && found.raw.client_id !== viewer.userId)) return { ok: false, error: 'Invoice not found.' };
  const [items, payments] = await Promise.all([loadItems(invoiceId), loadPayments(invoiceId)]);
  if (!items.ok || !payments.ok) return { ok: false, error: 'Invoice operation failed.' };
  return { ok: true, invoice: await hydrate(found.raw), items: items.items, payments: payments.payments };
}

export async function createDraftInvoice(input: { project_id: string; currency?: string; due_at?: string | null; payment_note?: string | null }): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const currency = (input.currency ?? 'USD').trim().toUpperCase();
  if (!validUuid(input.project_id) || !/^[A-Z]{3}$/.test(currency) || !validDate(input.due_at)) return { ok: false, error: 'Invalid invoice data.' };
  const project = await getSupabaseAdmin().from('projects').select('id').eq('id', input.project_id).maybeSingle();
  if (!project.data) return { ok: false, error: 'Project not found.' };
  const { data, error } = await getSupabaseAdmin().from('invoices').insert({ project_id: input.project_id, currency, due_at: input.due_at || null, payment_note: input.payment_note?.trim() || null }).select('id').single();
  return error || !data ? { ok: false, error: 'Invoice operation failed.' } : { ok: true, invoiceId: data.id };
}

export async function updateDraftInvoice(invoiceId: string, patch: { project_id?: string; currency?: string; due_at?: string | null; payment_note?: string | null }): Promise<CrmResult> {
  const found = await getRaw(invoiceId); if (!found.ok) return found;
  if (found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.');
  const updates: Record<string, unknown> = {};
  if (patch.project_id !== undefined) { if (!validUuid(patch.project_id)) return invalid(); updates.project_id = patch.project_id; }
  if (patch.currency !== undefined) { const c = patch.currency.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) return invalid(); updates.currency = c; }
  if (patch.due_at !== undefined) { if (!validDate(patch.due_at)) return invalid(); updates.due_at = patch.due_at || null; }
  if (patch.payment_note !== undefined) updates.payment_note = patch.payment_note?.trim() || null;
  if (!Object.keys(updates).length) return invalid('No changes provided.');
  const { error } = await getSupabaseAdmin().from('invoices').update(updates).eq('id', invoiceId).eq('status', 'draft');
  return error ? crmError('Invoice operation failed.') : { ok: true };
}

export async function addInvoiceItem(invoiceId: string, input: { description: string; qty: number; unit_price_cents: number; position?: number }): Promise<CrmResult> { const found = await getRaw(invoiceId); if (!found.ok) return found; if (found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); if (input.description.trim().length < 1 || input.description.trim().length > 500 || !Number.isFinite(input.qty) || input.qty <= 0 || !Number.isInteger(input.unit_price_cents) || input.unit_price_cents < 0 || (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0))) return invalid(); const { error } = await getSupabaseAdmin().from('invoice_items').insert({ invoice_id: invoiceId, description: input.description.trim(), qty: input.qty, unit_price_cents: input.unit_price_cents, position: input.position ?? 0 }); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function updateInvoiceItem(itemId: string, patch: { description?: string; qty?: number; unit_price_cents?: number; position?: number }): Promise<CrmResult> { if (!validUuid(itemId)) return crmError('Item not found.'); const { data: item } = await getSupabaseAdmin().from('invoice_items').select('invoice_id').eq('id', itemId).maybeSingle(); if (!item) return crmError('Item not found.'); const found = await getRaw(item.invoice_id); if (!found.ok || found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); const updates: Record<string, unknown> = {}; if (patch.description !== undefined) { const d = patch.description.trim(); if (d.length < 1 || d.length > 500) return invalid(); updates.description = d; } if (patch.qty !== undefined) { if (!Number.isFinite(patch.qty) || patch.qty <= 0) return invalid(); updates.qty = patch.qty; } if (patch.unit_price_cents !== undefined) { if (!Number.isInteger(patch.unit_price_cents) || patch.unit_price_cents < 0) return invalid(); updates.unit_price_cents = patch.unit_price_cents; } if (patch.position !== undefined) { if (!Number.isInteger(patch.position) || patch.position < 0) return invalid(); updates.position = patch.position; } if (!Object.keys(updates).length) return invalid('No changes provided.'); const { error } = await getSupabaseAdmin().from('invoice_items').update(updates).eq('id', itemId); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function deleteInvoiceItem(itemId: string): Promise<CrmResult> { if (!validUuid(itemId)) return crmError('Item not found.'); const { data: item } = await getSupabaseAdmin().from('invoice_items').select('invoice_id').eq('id', itemId).maybeSingle(); if (!item) return crmError('Item not found.'); const found = await getRaw(item.invoice_id); if (!found.ok || found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); const { error } = await getSupabaseAdmin().from('invoice_items').delete().eq('id', itemId); return error ? crmError('Invoice operation failed.') : { ok: true }; }

export async function sendInvoice(invoiceId: string): Promise<CrmResult> { const found = await getRaw(invoiceId); if (!found.ok) return found; if (found.raw.status !== 'draft') return crmError('Only draft invoices can be sent.'); const items = await loadItems(invoiceId); if (!items.ok || !items.items.length || calculateAmounts(items.items, []).total_cents <= 0) return crmError('Invoice must have a positive total and at least one item.'); const { error } = await getSupabaseAdmin().from('invoices').update({ status: 'sent', issued_at: new Date().toISOString() }).eq('id', invoiceId).eq('status', 'draft'); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function voidInvoice(invoiceId: string): Promise<CrmResult> { const found = await getRaw(invoiceId); if (!found.ok) return found; if (found.raw.status !== 'sent') return crmError('Only sent invoices can be voided.'); const { error } = await getSupabaseAdmin().from('invoices').update({ status: 'void' }).eq('id', invoiceId).eq('status', 'sent'); return error ? crmError('Invoice operation failed.') : { ok: true }; }

export async function confirmPayment(paymentId: string, adminId: string): Promise<CrmResult> { if (!validUuid(paymentId) || !validUuid(adminId)) return invalid(); const { data: payment } = await getSupabaseAdmin().from('payments').select('id, invoice_id, amount_cents, status').eq('id', paymentId).maybeSingle(); if (!payment || payment.status !== 'submitted') return crmError('Payment is no longer pending.'); const detail = await getInvoiceDetail(payment.invoice_id, { userId: adminId, role: 'admin' }); if (!detail.ok) return detail; if (Number(payment.amount_cents) + detail.invoice.confirmed_cents > detail.invoice.total_cents) return crmError('Payment exceeds the invoice balance.'); const { error } = await getSupabaseAdmin().from('payments').update({ status: 'confirmed', confirmed_by: adminId }).eq('id', paymentId).eq('status', 'submitted'); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function rejectPayment(paymentId: string): Promise<CrmResult> { if (!validUuid(paymentId)) return invalid(); const { error } = await getSupabaseAdmin().from('payments').update({ status: 'rejected' }).eq('id', paymentId).eq('status', 'submitted'); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function countUnpaidInvoices(): Promise<number> { const rows = await listInvoices({ userId: '00000000-0000-0000-0000-000000000000', role: 'admin' }, 'sent'); return rows.filter((row) => row.outstanding_cents > 0).length; }
export async function countOwnOutstandingInvoices(clientId: string): Promise<number> { if (!validUuid(clientId)) return 0; const rows = await listInvoices({ userId: clientId, role: 'client' }, 'sent'); return rows.filter((row) => row.outstanding_cents > 0).length; }
export async function submitPayment(invoiceId: string, clientId: string, input: { method: PaymentMethod; reference: string; amount_cents: number }): Promise<CrmResult> { if (!validUuid(invoiceId) || !validUuid(clientId) || !validMethod(input.method) || !Number.isInteger(input.amount_cents) || input.amount_cents <= 0 || typeof input.reference !== 'string' || input.reference.trim().length < 1 || input.reference.trim().length > 200) return crmError('Payment submission could not be processed.'); const found = await getRaw(invoiceId); if (!found.ok || found.raw.client_id !== clientId || found.raw.status !== 'sent') return crmError('Payment submission could not be processed.'); const detail = await getInvoiceDetail(invoiceId, { userId: clientId, role: 'client' }); if (!detail.ok || input.amount_cents > detail.invoice.total_cents - detail.invoice.submitted_cents) return crmError('Payment submission could not be processed.'); const { error } = await getSupabaseAdmin().from('payments').insert({ invoice_id: invoiceId, method: input.method, reference: input.reference.trim(), amount_cents: input.amount_cents, status: 'submitted' }); return error ? crmError('Payment submission could not be processed.') : { ok: true }; }
