import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CreditCard } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ClientInvoicesListPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/invoices');

  const admin = getSupabaseAdmin();
  const { data: invoices } = await admin
    .from('invoices')
    .select(
      'id, code, status, is_deposit_invoice, currency, total_cents, issued_at, due_at, paid_at, order:orders(id, code, title)'
    )
    .eq('client_id', session.userId)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices & Billing</h1>
        <p className="text-sm text-muted-foreground">
          View itemized multi-currency invoices (`USD`, `BDT`, `EUR`, `GBP`) and submit payment transfer proofs for verification.
        </p>
      </div>

      <div className="space-y-3">
        {(invoices ?? []).map((inv) => {
          const orderObj = Array.isArray(inv.order) ? inv.order[0] : inv.order;
          return (
            <Card key={inv.id} className="border-border/80 bg-card/85">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">
                      {inv.code}
                    </span>
                    <Badge
                      variant={inv.status === 'paid' ? 'default' : 'outline'}
                      className="font-mono text-[10px] uppercase"
                    >
                      {inv.status.replace(/_/g, ' ')}
                    </Badge>
                    {inv.is_deposit_invoice && (
                      <Badge variant="secondary" className="text-[10px]">
                        Kickoff Deposit
                      </Badge>
                    )}
                  </div>
                  {orderObj && (
                    <div className="text-sm font-semibold">
                      {orderObj.code}: {orderObj.title}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {inv.issued_at && (
                      <span>Issued: {new Date(inv.issued_at).toLocaleDateString()}</span>
                    )}
                    {inv.due_at && (
                      <span>Due: {new Date(inv.due_at).toLocaleDateString()}</span>
                    )}
                    {inv.paid_at && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Paid: {new Date(inv.paid_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right font-mono text-base font-extrabold">
                    {inv.currency} {(inv.total_cents / 100).toLocaleString()}
                  </div>
                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <Link href={`/portal/invoices/${inv.id}`}>
                      {inv.status === 'paid' ? 'Receipt' : 'Pay / Submit Proof'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(invoices ?? []).length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">No invoices issued yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Invoices for your orders, milestones, and monthly retainers will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
