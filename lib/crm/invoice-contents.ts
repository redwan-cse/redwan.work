import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { InvoiceItemRow, PaymentRow } from '@/lib/crm/invoices';
export async function readInvoiceContents(invoiceId: string): Promise<{ items: InvoiceItemRow[]; payments: PaymentRow[] }> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('invoice_contents_snapshot', { p_invoice: invoiceId });
    if (error || !data || !Array.isArray(data.items) || !Array.isArray(data.payments) || data.items.length > 10000 || data.payments.length > 10000) throw new Error('Invalid detail');
    return { items: data.items as InvoiceItemRow[], payments: data.payments as PaymentRow[] };
  } catch { throw new Error('Invoice details unavailable or exceed the interactive limit. No partial totals are shown.'); }
}
