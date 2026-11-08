import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CreditCard } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { submitInvoicePaymentProofAction } from '@/lib/crm/actions';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/invoices');

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: invoice } = await admin
    .from('invoices')
    .select(
      '*, order:orders(id, code, title), invoice_items(*), payments(*, proof_file:vault_files(id, filename))'
    )
    .eq('id', id)
    .maybeSingle();

  if (!invoice || (session.role !== 'admin' && invoice.client_id !== session.userId)) {
    notFound();
  }

  const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const confirmedCents = payments
    .filter((p: { status: string }) => p.status === 'confirmed')
    .reduce((acc: number, p: { amount_cents: number }) => acc + (p.amount_cents ?? 0), 0);
  const balanceDueMajor = Math.max(0, (invoice.total_cents - confirmedCents) / 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/portal/invoices"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Invoices
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-primary">{invoice.code}</span>
            <Badge
              variant={invoice.status === 'paid' ? 'default' : 'outline'}
              className="font-mono text-xs uppercase"
            >
              {invoice.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-2xl font-extrabold">
            {invoice.currency} {(invoice.total_cents / 100).toLocaleString()}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            Balance Due: {invoice.currency} {balanceDueMajor.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Line Items & Payment History */}
        <div className="space-y-6 lg:col-span-7">
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Invoice Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {items.map(
                (item: {
                  id: string;
                  description: string;
                  qty: number;
                  unit_price_cents: number;
                  line_total_cents: number | null;
                }) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold">{item.description}</div>
                      <div className="text-[11px] text-muted-foreground">Qty: {item.qty}</div>
                    </div>
                    <div className="font-mono font-bold">
                      {invoice.currency}{' '}
                      {((item.line_total_cents ?? item.unit_price_cents) / 100).toLocaleString()}
                    </div>
                  </div>
                )
              )}
              {invoice.notes && (
                <p className="pt-2 text-xs text-muted-foreground">{invoice.notes}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">
                Submitted Payment Transfers ({payments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {payments.map(
                (pmt: {
                  id: string;
                  code: string;
                  amount_cents: number;
                  currency: string;
                  method: string;
                  reference: string;
                  status: string;
                  rejection_reason: string | null;
                  created_at: string;
                }) => (
                  <div
                    key={pmt.id}
                    className="rounded-xl border border-border/70 bg-background/60 p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">{pmt.code}</span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {pmt.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {pmt.method.replace(/_/g, ' ')} • Ref: {pmt.reference}
                      </span>
                      <span className="font-mono font-bold">
                        {pmt.currency} {(pmt.amount_cents / 100).toLocaleString()}
                      </span>
                    </div>
                    {pmt.rejection_reason && (
                      <p className="mt-1 text-destructive">Note: {pmt.rejection_reason}</p>
                    )}
                  </div>
                )
              )}
              {payments.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No payment proofs submitted for this invoice yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Submit Payment Proof Form */}
        <div className="lg:col-span-5">
          <Card className="border-primary/30 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <CreditCard className="h-4 w-4 text-primary" />
                Submit Payment Proof
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.status === 'paid' ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <div className="mt-2 text-sm font-bold">Invoice Paid in Full</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Thank you! Your payment has been verified and applied to your engagement.
                  </p>
                </div>
              ) : (
                <form action={submitInvoicePaymentProofAction} className="space-y-3.5">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Method *</Label>
                    <select
                      name="method"
                      defaultValue="bank_transfer"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="bank_transfer">Bank Wire / SWIFT / Local Transfer</option>
                      <option value="wise">Wise (USD / EUR / GBP)</option>
                      <option value="payoneer">Payoneer</option>
                      <option value="paypal">PayPal</option>
                      <option value="bkash">bKash (BDT)</option>
                      <option value="nagad">Nagad (BDT)</option>
                      <option value="manual">Manual / Direct Settlement</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">
                      Amount Sent ({invoice.currency}) *
                    </Label>
                    <Input
                      name="amount_major"
                      type="number"
                      step="0.01"
                      defaultValue={balanceDueMajor}
                      required
                      className="h-9 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Transaction ID / Reference *</Label>
                    <Input
                      name="reference"
                      required
                      placeholder="TXN-98412093 / SWIFT Ref"
                      className="h-9 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Upload Transfer Receipt (PDF / Screenshot)</Label>
                    <R2FileUploader
                      category="payment_proof"
                      orderId={invoice.order_id}
                      label="Attach Payment Receipt"
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    Submit Payment for Verification
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
