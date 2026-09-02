import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { crmError, type CrmResult } from '@/lib/crm/result';
import { calculateInvoiceTotalCents, isSafeInvoiceLine, MAX_INVOICE_TOTAL_CENTS, roundInvoiceLineCents } from '@/lib/crm/invoice-math';

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
  const total_cents = calculateInvoiceTotalCents(items.map((item) => ({ qty: item.qty, unit_price_cents: item.unit_price_cents })));
  const submitted_cents = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount_cents);
    if (!Number.isSafeInteger(amount) || sum > MAX_INVOICE_TOTAL_CENTS - amount) throw new Error('Invoice amount exceeds the supported limit.');
    return payment.status === 'submitted' || payment.status === 'confirmed' ? sum + amount : sum;
  }, 0);
  const confirmed_cents = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount_cents);
    if (!Number.isSafeInteger(amount) || sum > MAX_INVOICE_TOTAL_CENTS - amount) throw new Error('Invoice amount exceeds the supported limit.');
    return payment.status === 'confirmed' ? sum + amount : sum;
  }, 0);
  return { total_cents, submitted_cents, confirmed_cents, outstanding_cents: Math.max(total_cents - confirmed_cents, 0) };
}

function invalid(message = 'Invalid invoice data.') { return crmError(message); }
function validUuid(value: string) { return typeof value === 'string' && UUID_RE.test(value); }
function validStatus(value: unknown): value is InvoiceStatus { return typeof value === 'string' && STATUSES.includes(value as InvoiceStatus); }
function validMethod(value: unknown): value is PaymentMethod { return typeof value === 'string' && METHODS.includes(value as PaymentMethod); }
function validAmount(qty: number, price: number) { try { return isSafeInvoiceLine(qty, price); } catch { return false; } }
function validProject(project: { status?: string; archived_at?: string | null } | null) { return project?.status === 'active' && project.archived_at == null; }
function validDate(value: string | null | undefined) { if (value == null || value === '') return true; if (!DATE_RE.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }

async function loadPayments(invoiceId: string) {
  const { data, error } = await getSupabaseAdmin().from('payments').select('id, invoice_id, method, reference, amount_cents, status, confirmed_by, confirmed_at, created_at').eq('invoice_id', invoiceId).order('created_at', { ascending: true });
  if (error) throw new Error('Invoice operation failed.');
  return { ok: true as const, payments: (data ?? []) as PaymentRow[] };
}

async function loadItems(invoiceId: string) {
  const { data, error } = await getSupabaseAdmin().from('invoice_items').select('id, invoice_id, description, qty, unit_price_cents, position').eq('invoice_id', invoiceId).order('position', { ascending: true });
  if (error) throw new Error('Invoice operation failed.');
  return { ok: true as const, items: (data ?? []) as InvoiceItemRow[] };
}

async function hydrate(raw: RawInvoice): Promise<InvoiceRow> {
  const admin = getSupabaseAdmin();
  const [{ data: project, error: projectError }, { data: profile, error: profileError }, { data: user, error: userError }] = await Promise.all([
    admin.from('projects').select('name, client_id').eq('id', raw.project_id).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', raw.client_id).maybeSingle(),
    admin.auth.admin.getUserById(raw.client_id),
  ]);
  if (projectError || profileError || userError || !project) throw new Error('Invoice operation failed.');
  const amounts = await invoiceAmounts(raw.id);
  return { ...raw, project_name: (project as { name?: string } | null)?.name ?? '', client_id: (project as { client_id?: string } | null)?.client_id ?? raw.client_id, client_name: (profile as { full_name: string | null } | null)?.full_name ?? null, client_email: user?.user?.email ?? '', ...amounts };
}

async function invoiceAmounts(invoiceId: string): Promise<Amounts> {
  const [items, payments] = await Promise.all([loadItems(invoiceId), loadPayments(invoiceId)]);
  return calculateAmounts(items.items, payments.payments);
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
  if (viewer.role === 'client') query = query.in('status', ['sent', 'paid', 'void']);
  if (status && validStatus(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Invoice operation failed.');
  const rows: InvoiceRow[] = [];
  for (const raw of (data ?? []) as RawInvoice[]) {
    const project = await admin.from('projects').select('client_id').eq('id', raw.project_id).maybeSingle();
    if (project.error || !project.data) throw new Error('Invoice operation failed.');
    if (viewer.role === 'client' && project.data.client_id !== viewer.userId) continue;
    try { rows.push(await hydrate({ ...raw, client_id: project.data.client_id })); } catch { throw new Error('Invoice operation failed.'); }
  }
  return rows;
}

export async function getInvoiceDetail(invoiceId: string, viewer: InvoiceViewer): Promise<{ ok: true; invoice: InvoiceRow; items: InvoiceItemRow[]; payments: PaymentRow[] } | { ok: false; error: string }> {
  try {
    const found = await getRaw(invoiceId);
    if (!found.ok || (viewer.role === 'client' && (found.raw.client_id !== viewer.userId || found.raw.status === 'draft'))) return { ok: false, error: 'Invoice not found.' };
    const [items, payments] = await Promise.all([loadItems(invoiceId), loadPayments(invoiceId)]);
    return { ok: true, invoice: await hydrate(found.raw), items: items.items, payments: payments.payments };
  } catch {
    return { ok: false, error: 'Invoice operation failed.' };
  }
}

export async function createDraftInvoice(input: { project_id: string; currency?: string; due_at?: string | null; payment_note?: string | null }): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const currency = (input.currency ?? 'USD').trim().toUpperCase();
  if (!validUuid(input.project_id) || !/^[A-Z]{3}$/.test(currency) || !validDate(input.due_at)) return { ok: false, error: 'Invalid invoice data.' };
  const project = await getSupabaseAdmin().from('projects').select('id, status, archived_at').eq('id', input.project_id).maybeSingle();
  if (project.error || !validProject(project.data as { status?: string; archived_at?: string | null } | null)) return { ok: false, error: 'Active project not found.' };
  const { data, error } = await getSupabaseAdmin().from('invoices').insert({ project_id: input.project_id, currency, due_at: input.due_at || null, payment_note: input.payment_note?.trim() || null }).select('id').single();
  return error || !data ? { ok: false, error: 'Invoice operation failed.' } : { ok: true, invoiceId: data.id };
}

export async function createDraftInvoiceWithItems(input: {
  project_id: string;
  currency?: string;
  due_at?: string | null;
  payment_note?: string | null;
  items: Array<{ description: string; qty: number; unit_price_cents: number; position: number }>;
}): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (!validUuid(input.project_id) || !input.items.length || input.items.some((item) => item.description.trim().length < 1 || item.description.trim().length > 500 || !Number.isInteger(item.position) || item.position < 0 || !validAmount(item.qty, item.unit_price_cents))) return { ok: false, error: 'Invalid invoice data.' };
  try { calculateAmounts(input.items, []); } catch { return { ok: false, error: 'Invoice amount exceeds the supported limit.' }; }
  const project = await getSupabaseAdmin().from('projects').select('status, archived_at').eq('id', input.project_id).maybeSingle();
  if (project.error || !validProject(project.data as { status?: string; archived_at?: string | null } | null)) return { ok: false, error: 'Active project not found.' };
  const { data, error } = await getSupabaseAdmin().rpc('create_draft_invoice_with_items', {
    p_project_id: input.project_id,
    p_currency: input.currency ?? 'USD',
    p_due_at: input.due_at || null,
    p_payment_note: input.payment_note ?? null,
    p_items: input.items,
  });
  return error || typeof data !== 'string' ? { ok: false, error: 'Invoice operation failed.' } : { ok: true, invoiceId: data };
}

export async function updateDraftInvoice(invoiceId: string, patch: { project_id?: string; currency?: string; due_at?: string | null; payment_note?: string | null }): Promise<CrmResult> {
  const found = await getRaw(invoiceId); if (!found.ok) return found;
  if (found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.');
  const updates: Record<string, unknown> = {};
  if (patch.project_id !== undefined) { if (!validUuid(patch.project_id)) return invalid(); const project = await getSupabaseAdmin().from('projects').select('status, archived_at').eq('id', patch.project_id).maybeSingle(); if (project.error || !validProject(project.data as { status?: string; archived_at?: string | null } | null)) return crmError('Active project not found.'); updates.project_id = patch.project_id; }
  if (patch.currency !== undefined) { const c = patch.currency.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) return invalid(); updates.currency = c; }
  if (patch.due_at !== undefined) { if (!validDate(patch.due_at)) return invalid(); updates.due_at = patch.due_at || null; }
  if (patch.payment_note !== undefined) updates.payment_note = patch.payment_note?.trim() || null;
  if (!Object.keys(updates).length) return invalid('No changes provided.');
  const { error } = await getSupabaseAdmin().from('invoices').update(updates).eq('id', invoiceId).eq('status', 'draft');
  return error ? crmError('Invoice operation failed.') : { ok: true };
}

export async function addInvoiceItem(invoiceId: string, input: { description: string; qty: number; unit_price_cents: number; position?: number }): Promise<CrmResult> { const found = await getRaw(invoiceId); if (!found.ok) return found; if (found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); if (input.description.trim().length < 1 || input.description.trim().length > 500 || !validAmount(input.qty, input.unit_price_cents) || (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0))) return invalid(); const { error } = await getSupabaseAdmin().from('invoice_items').insert({ invoice_id: invoiceId, description: input.description.trim(), qty: input.qty, unit_price_cents: input.unit_price_cents, position: input.position ?? 0 }); return error ? crmError('Invoice operation failed.') : { ok: true }; }
 export async function updateInvoiceItem(itemId: string, patch: { description?: string; qty?: number; unit_price_cents?: number; position?: number }): Promise<CrmResult> { if (!validUuid(itemId)) return crmError('Item not found.'); const { data: item } = await getSupabaseAdmin().from('invoice_items').select('invoice_id, qty, unit_price_cents').eq('id', itemId).maybeSingle(); if (!item) return crmError('Item not found.'); const found = await getRaw(item.invoice_id); if (!found.ok || found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); const updates: Record<string, unknown> = {}; if (patch.description !== undefined) { const d = patch.description.trim(); if (d.length < 1 || d.length > 500) return invalid(); updates.description = d; } if (patch.qty !== undefined || patch.unit_price_cents !== undefined) { const qty = patch.qty ?? Number(item.qty); const price = patch.unit_price_cents ?? Number(item.unit_price_cents); if (!validAmount(qty, price)) return invalid(); if (patch.qty !== undefined) updates.qty = patch.qty; if (patch.unit_price_cents !== undefined) updates.unit_price_cents = patch.unit_price_cents; } if (patch.position !== undefined) { if (!Number.isInteger(patch.position) || patch.position < 0) return invalid(); updates.position = patch.position; } if (!Object.keys(updates).length) return invalid('No changes provided.'); const { error } = await getSupabaseAdmin().from('invoice_items').update(updates).eq('id', itemId); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function deleteInvoiceItem(itemId: string): Promise<CrmResult> { if (!validUuid(itemId)) return crmError('Item not found.'); const { data: item } = await getSupabaseAdmin().from('invoice_items').select('invoice_id').eq('id', itemId).maybeSingle(); if (!item) return crmError('Item not found.'); const found = await getRaw(item.invoice_id); if (!found.ok || found.raw.status !== 'draft') return crmError('Only draft invoices can be edited.'); const { error } = await getSupabaseAdmin().from('invoice_items').delete().eq('id', itemId); return error ? crmError('Invoice operation failed.') : { ok: true }; }

export async function sendInvoice(invoiceId: string): Promise<CrmResult> { if (!validUuid(invoiceId)) return crmError('Invoice not found.'); const { error } = await getSupabaseAdmin().rpc('send_invoice_atomic', { p_invoice_id: invoiceId }); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function voidInvoice(invoiceId: string): Promise<CrmResult> { const found = await getRaw(invoiceId); if (!found.ok) return found; if (found.raw.status !== 'sent') return crmError('Only sent invoices can be voided.'); const { error } = await getSupabaseAdmin().rpc('void_invoice_atomic', { p_invoice_id: invoiceId }); return error ? crmError('Invoice operation failed.') : { ok: true }; }

export async function confirmPayment(paymentId: string, adminId: string): Promise<CrmResult> { if (!validUuid(paymentId) || !validUuid(adminId)) return invalid(); const { error } = await getSupabaseAdmin().rpc('confirm_invoice_payment_atomic', { p_payment_id: paymentId, p_confirmed_by: adminId }); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function rejectPayment(paymentId: string): Promise<CrmResult> { if (!validUuid(paymentId)) return crmError('Payment is no longer pending.'); const { error } = await getSupabaseAdmin().rpc('reject_invoice_payment_atomic', { p_payment_id: paymentId }); return error ? crmError('Invoice operation failed.') : { ok: true }; }
export async function countUnpaidInvoices(): Promise<number> { const rows = await listInvoices({ userId: '00000000-0000-0000-0000-000000000000', role: 'admin' }, 'sent'); return rows.filter((row) => row.outstanding_cents > 0).length; }
export async function countOwnOutstandingInvoices(clientId: string): Promise<number> { if (!validUuid(clientId)) return 0; const rows = await listInvoices({ userId: clientId, role: 'client' }, 'sent'); return rows.filter((row) => row.outstanding_cents > 0).length; }
export async function submitPayment(invoiceId: string, clientId: string, input: { method: PaymentMethod; reference: string; amount_cents: number }): Promise<CrmResult> { if (!validUuid(invoiceId) || !validUuid(clientId) || !validMethod(input.method) || !Number.isInteger(input.amount_cents) || input.amount_cents <= 0 || typeof input.reference !== 'string' || input.reference.trim().length < 1 || input.reference.trim().length > 200) return crmError('Payment submission could not be processed.'); const { error } = await getSupabaseAdmin().rpc('submit_invoice_payment_atomic', { p_invoice_id: invoiceId, p_client_id: clientId, p_method: input.method, p_reference: input.reference.trim(), p_amount_cents: input.amount_cents }); return error ? crmError('Payment submission could not be processed.') : { ok: true }; }
