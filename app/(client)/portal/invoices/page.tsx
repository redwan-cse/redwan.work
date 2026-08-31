import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { getCurrentSession } from '@/lib/auth/session';
import { listInvoices } from '@/lib/crm/invoices';

export const dynamic = 'force-dynamic';

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export default async function PortalInvoicesPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/invoices');

  const invoices = await listInvoices({ userId: session.userId, role: 'client' });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Invoices</h1>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Invoice</th><th className="px-4 py-2 font-medium">Project</th><th className="px-4 py-2 text-right font-medium">Total</th><th className="px-4 py-2 text-right font-medium">Outstanding</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Due</th></tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs"><Link href={`/portal/invoices/${invoice.id}`} className="hover:underline">INV-{invoice.number}</Link></td>
                  <td className="px-4 py-2">{invoice.project_name}</td>
                  <td className="px-4 py-2 text-right">{money(invoice.total_cents, invoice.currency)}</td>
                  <td className="px-4 py-2 text-right">{money(invoice.outstanding_cents, invoice.currency)}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{invoice.status}</Badge></td>
                  <td className="px-4 py-2 text-muted-foreground">{date(invoice.due_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
