import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { getInvoiceDetail } from '@/lib/crm/invoices';
import { roundInvoiceLineCents } from '@/lib/crm/invoice-math';
import { listProjects } from '@/lib/crm/projects';
import {
  DeleteItemButton,
  DraftInvoiceForm,
  InvoiceLifecycleControls,
  LineItemForm,
  PaymentDecisionButtons,
  PrintInvoiceButton,
  money,
} from '@/components/admin/invoice-forms';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInvoiceDetail(id, { userId: '', role: 'admin' });
  if (!result.ok) notFound();

  const { invoice, items, payments } = result;
  const draft = invoice.status === 'draft';
  const projects = draft ? (await listProjects({ archived: false })).filter((project) => project.status === 'active') : [];

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/admin/invoices" className="text-sm text-muted-foreground hover:underline">← All invoices</Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">INV-{invoice.number}</p>
          <h1 className="text-2xl font-semibold">{invoice.project_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{invoice.client_name ?? invoice.client_email} · {invoice.client_email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">{invoice.status}</Badge>
          <PrintInvoiceButton />
          <InvoiceLifecycleControls invoiceId={invoice.id} number={invoice.number} status={invoice.status} />
        </div>
      </header>

      <main className="space-y-6 print:block">
        <section className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs uppercase text-muted-foreground">Issued</p><p>{formatDate(invoice.issued_at)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Due</p><p>{formatDate(invoice.due_at)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Currency</p><p>{invoice.currency}</p></div>
        </section>

        {draft && <DraftInvoiceForm invoice={invoice} items={items} projects={projects.map((project) => ({ id: project.id, name: project.name, client_name: project.client_name, client_email: project.client_email }))} />}

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Line items</h2>{draft && <span className="text-sm text-muted-foreground">Draft</span>}</div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 print:hidden" /></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="px-4 py-2">{item.description}</td><td className="px-4 py-2 text-right">{item.qty}</td><td className="px-4 py-2 text-right">{money(item.unit_price_cents, invoice.currency)}</td><td className="px-4 py-2 text-right">{money(roundInvoiceLineCents(item.qty, item.unit_price_cents), invoice.currency)}</td><td className="px-4 py-2 text-right print:hidden">{draft && <DeleteItemButton itemId={item.id} />}</td></tr>)}</tbody>
            </table>
          </div>
          {draft && <div className="space-y-3 print:hidden">{items.map((item) => <LineItemForm key={item.id} invoiceId={invoice.id} item={item} position={item.position} />)}<LineItemForm invoiceId={invoice.id} position={items.length} /></div>}
        </section>

        <section className="ml-auto max-w-sm space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>Total</span><strong>{money(invoice.total_cents, invoice.currency)}</strong></div><div className="flex justify-between"><span>Submitted</span><span>{money(invoice.submitted_cents, invoice.currency)}</span></div><div className="flex justify-between"><span>Confirmed</span><span>{money(invoice.confirmed_cents, invoice.currency)}</span></div><div className="flex justify-between font-semibold"><span>Outstanding</span><span>{money(invoice.outstanding_cents, invoice.currency)}</span></div></section>
        {invoice.payment_note && <section><h2 className="text-lg font-semibold">Payment note</h2><p className="mt-2 whitespace-pre-wrap text-sm">{invoice.payment_note}</p></section>}

        <section><h2 className="mb-3 text-lg font-semibold">Payment history</h2>{payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments submitted.</p> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-4 py-2">Date</th><th scope="col" className="px-4 py-2">Method</th><th scope="col" className="px-4 py-2">Reference</th><th scope="col" className="px-4 py-2 text-right">Amount</th><th scope="col" className="px-4 py-2">Status</th><th scope="col" className="px-4 py-2 print:hidden">Action</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t"><td className="px-4 py-2">{formatDate(payment.created_at)}</td><td className="px-4 py-2">{payment.method}</td><td className="px-4 py-2 font-mono text-xs">{payment.reference}</td><td className="px-4 py-2 text-right">{money(payment.amount_cents, invoice.currency)}</td><td className="px-4 py-2">{payment.status}</td><td className="px-4 py-2 print:hidden">{invoice.status === 'sent' && <PaymentDecisionButtons payment={payment} />}</td></tr>)}</tbody></table></div>}</section>
      </main>
    </div>
  );
}
