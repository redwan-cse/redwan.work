import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrintInvoiceButton } from '@/components/panel/print-invoice-button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { reviewPaymentProofAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: invoice }, { data: items }, { data: payments }] = await Promise.all([
    admin.from('invoices').select('*').eq('id', id).maybeSingle(),
    admin.from('invoice_items').select('*').eq('invoice_id', id).order('position'),
    admin
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  if (!invoice) notFound();

  const { data: client } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', invoice.client_id)
    .maybeSingle();

  const outstandingCents = Math.max(
    0,
    invoice.total_cents - invoice.amount_paid_cents - invoice.credited_cents
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary print:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Invoices Ledger
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-bold">{invoice.code}</h1>
            <Badge variant="outline" className="font-mono text-xs uppercase">
              {invoice.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Billed to {client?.full_name || client?.email} ({client?.email})
          </p>
        </div>
        <PrintInvoiceButton />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Statement Breakdown */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Invoice Line Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border/70 text-sm">
              {(items ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{item.description}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      Qty: {item.qty} × {formatMoney(item.unit_price_cents, invoice.currency)}
                    </div>
                  </div>
                  <div className="font-mono font-bold">
                    {formatMoney(
                      item.line_total_cents ?? Math.round(item.qty * item.unit_price_cents),
                      invoice.currency
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-border pt-4 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Invoice:</span>
                <span className="text-sm font-bold">
                  {formatMoney(invoice.total_cents, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmed Paid:</span>
                <span className="text-primary">
                  {formatMoney(invoice.amount_paid_cents, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-bold">
                <span>Balance Due:</span>
                <span>{formatMoney(outstandingCents, invoice.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Submissions & Verification */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Submitted Payments (`PAY-XXXX`)</CardTitle>
            <CardDescription className="text-xs">
              Confirming a deposit payment automatically transitions `awaiting_payment` orders forward.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payments && payments.length > 0 ? (
              payments.map((pay) => (
                <div
                  key={pay.id}
                  className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-primary">{pay.code}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {pay.status}
                    </Badge>
                  </div>
                  <div className="font-mono text-sm font-bold">
                    {formatMoney(pay.amount_cents, pay.currency)} via {pay.method}
                  </div>
                  <div className="text-muted-foreground">
                    Reference: <span className="font-mono text-foreground">{pay.reference}</span>
                  </div>
                  {pay.proof_file_id && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full text-xs"
                    >
                      <a href={`/api/files/${pay.proof_file_id}/download`}>
                        <Download className="h-3.5 w-3.5 text-primary" />
                        Download Receipt Proof
                      </a>
                    </Button>
                  )}

                  {pay.status === 'submitted' && (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <form action={reviewPaymentProofAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="payment_id" value={pay.id} />
                        <input type="hidden" name="decision" value="confirmed" />
                        {pay.currency !== 'USD' ? (
                          <Input
                            name="fx_rate"
                            type="number"
                            step="0.0001"
                            defaultValue={pay.fx_rate_to_usd || invoice.fx_rate_to_usd || 1}
                            title="FX rate to USD"
                            className="h-9 w-24 font-mono text-xs"
                          />
                        ) : (
                          <input type="hidden" name="fx_rate" value="1" />
                        )}
                        <Button type="submit" size="sm" className="h-9 gap-1 rounded-full text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm
                        </Button>
                      </form>

                      <form action={reviewPaymentProofAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="payment_id" value={pay.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <Input
                          name="reason"
                          placeholder="Rejection note..."
                          defaultValue="Transaction reference could not be verified."
                          className="h-9 min-w-[180px] flex-1 text-xs"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1 rounded-full text-xs"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No payment proofs submitted for this invoice yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
