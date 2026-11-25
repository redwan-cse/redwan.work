import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CreditCard, Download } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { submitInvoicePaymentProofAction } from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { PrintInvoiceButton } from '@/components/panel/print-invoice-button';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';

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

  const [{ data: invoice }, { data: creditNotes }] = await Promise.all([
    admin
      .from('invoices')
      .select(
        '*, order:orders(id, code, title), invoice_items(*), payments(*, proof_file:vault_files(id, filename))'
      )
      .eq('id', id)
      .maybeSingle(),
    admin.from('credit_notes').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
  ]);

  if (
    !invoice ||
    (session.role !== 'admin' && (invoice.client_id !== session.userId || invoice.status === 'draft'))
  ) {
    notFound();
  }

  const [{ data: clientProfileRow }, { data: billingProfile }] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', invoice.client_id).maybeSingle(),
    admin
      .from('client_profiles')
      .select('company_name, tax_id, billing_address')
      .eq('user_id', invoice.client_id)
      .maybeSingle(),
  ]);

  const billingAddress = (billingProfile?.billing_address ?? {}) as Record<string, string | undefined>;
  const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const confirmedCents = payments
    .filter((p: { status: string }) => p.status === 'confirmed')
    .reduce((acc: number, p: { amount_cents: number }) => acc + (p.amount_cents ?? 0), 0);
  const creditedCents = Number(invoice.credited_cents ?? 0);
  const balanceDueCents = Math.max(0, invoice.total_cents - confirmedCents - creditedCents);
  const balanceDueMajor = balanceDueCents / 100;
  const canSubmitPaymentProof = ['issued', 'partially_paid', 'overdue'].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
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

        <div className="flex flex-wrap items-center gap-3">
          <PrintInvoiceButton />
          <div className="text-right">
            <div className="font-mono text-2xl font-extrabold">
              {invoice.currency} {(invoice.total_cents / 100).toLocaleString()}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              Balance Due: {invoice.currency} {balanceDueMajor.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Formal Seller & Billed-To Letterhead (Rendered prominently on A4 Print & Web) */}
      <Card className="border-border/80 bg-card/90 print:border-slate-300 print:shadow-none">
        <CardContent className="grid gap-6 p-5 text-xs sm:grid-cols-2">
          <div className="space-y-1">
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
              Issued By (Seller)
            </div>
            <div className="text-sm font-bold">Md. Redwan Ahmed — redwan.work</div>
            <div className="text-muted-foreground">Security Engineering &amp; Software Advisory</div>
            <div className="font-mono text-[11px] text-muted-foreground">contact@redwan.work · https://redwan.work</div>
          </div>

          <div className="space-y-1 sm:text-right">
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Billed To ({invoice.code})
            </div>
            <div className="text-sm font-bold">
              {clientProfileRow?.full_name || clientProfileRow?.email || session.email}
            </div>
            {billingProfile?.company_name && (
              <div className="font-medium">{billingProfile.company_name}</div>
            )}
            {billingAddress.line1 && (
              <div className="text-muted-foreground">
                {[
                  billingAddress.line1,
                  billingAddress.line2,
                  billingAddress.city,
                  billingAddress.state,
                  billingAddress.postal_code,
                  billingAddress.country,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            )}
            {billingProfile?.tax_id && (
              <div className="font-mono text-[11px] text-muted-foreground">
                Tax / VAT ID: {billingProfile.tax_id}
              </div>
            )}
            <div className="font-mono text-[11px] text-muted-foreground">
              Issued: {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : 'Draft'}
              {invoice.due_at ? ` · Due: ${new Date(invoice.due_at).toLocaleDateString()}` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12 print:block">
        {/* Left: Line Items & Payment History */}
        <div className="space-y-6 lg:col-span-7 print:space-y-4">
          <Card className="border-border/80 bg-card/85 print:border-slate-300 print:shadow-none">
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
                }) => {
                  const computedCents =
                    item.line_total_cents ?? Math.round(item.qty * item.unit_price_cents);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold">{item.description}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          Qty: {item.qty} × {formatMoney(item.unit_price_cents, invoice.currency)}
                        </div>
                      </div>
                      <div className="font-mono font-bold">
                        {invoice.currency} {(computedCents / 100).toLocaleString()}
                      </div>
                    </div>
                  );
                }
              )}

              <div className="space-y-1 border-t border-border/70 pt-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span>{formatMoney(invoice.subtotal_cents ?? invoice.total_cents, invoice.currency)}</span>
                </div>
                {(invoice.discount_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-800 dark:text-emerald-300">
                    <span>Discount:</span>
                    <span>-{formatMoney(invoice.discount_cents, invoice.currency)}</span>
                  </div>
                )}
                {((invoice.tax_cents ?? 0) > 0 || (invoice.tax_rate_bps ?? 0) > 0) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Tax ({((invoice.tax_rate_bps ?? 0) / 100).toFixed(2)}%):
                    </span>
                    <span>{formatMoney(invoice.tax_cents ?? 0, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Invoice Total:</span>
                  <span>{formatMoney(invoice.total_cents, invoice.currency)}</span>
                </div>
                {invoice.currency !== 'USD' && Number(invoice.fx_rate_to_usd ?? 1) > 0 && (
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Locked FX Rate (to USD):</span>
                    <span>1 {invoice.currency} = {Number(invoice.fx_rate_to_usd).toFixed(4)} USD</span>
                  </div>
                )}
                {creditedCents > 0 && (
                  <div className="flex justify-between text-amber-800 dark:text-amber-300">
                    <span>Credit Notes Applied:</span>
                    <span>-{formatMoney(creditedCents, invoice.currency)}</span>
                  </div>
                )}
                {confirmedCents > 0 && (
                  <div className="flex justify-between text-emerald-800 dark:text-emerald-300">
                    <span>Verified Payments:</span>
                    <span>-{formatMoney(confirmedCents, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
                  <span>Balance Due:</span>
                  <span>
                    {invoice.currency} {balanceDueMajor.toLocaleString()}
                  </span>
                </div>
                <div className="hidden pt-1 text-[11px] uppercase print:block">
                  Status: {invoice.status.replace(/_/g, ' ')}
                </div>
              </div>

              {invoice.payment_instructions && (
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                  <div className="font-semibold">Payment Instructions:</div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {invoice.payment_instructions}
                  </p>
                </div>
              )}

              {invoice.notes && (
                <p className="pt-1 text-xs text-muted-foreground">{invoice.notes}</p>
              )}
            </CardContent>
          </Card>

          {creditNotes && creditNotes.length > 0 && (
            <Card className="border-border/80 bg-card/85 print:border-slate-300 print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Credit Notes Applied</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {creditNotes.map((cn) => (
                  <div key={cn.id} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
                    <div>
                      <span className="font-mono font-bold text-primary">{cn.code}</span> · {cn.reason}
                    </div>
                    <span className="font-mono font-semibold">
                      -{formatMoney(cn.amount_cents, cn.currency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/80 bg-card/85 print:hidden">
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
                  proof_file?: { id: string; filename: string } | Array<{ id: string; filename: string }> | null;
                }) => {
                  const proofFile = Array.isArray(pmt.proof_file)
                    ? pmt.proof_file[0]
                    : pmt.proof_file;
                  return (
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
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {pmt.method.replace(/_/g, ' ')} · Ref: {pmt.reference}
                        </span>
                        <span className="font-mono font-bold">
                          {pmt.currency} {(pmt.amount_cents / 100).toLocaleString()}
                        </span>
                      </div>
                      {proofFile?.id && (
                        <div className="mt-2">
                          <a
                            href={`/api/files/${proofFile.id}/download`}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                          >
                            <Download className="h-3 w-3" />
                            Receipt: {proofFile.filename}
                          </a>
                        </div>
                      )}
                      {pmt.rejection_reason && (
                        <p className="mt-1 text-destructive">Note: {pmt.rejection_reason}</p>
                      )}
                    </div>
                  );
                }
              )}
              {payments.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No payment proofs submitted for this invoice yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Submit Payment Proof Form (hidden cleanly when printing A4) */}
        <div className="lg:col-span-5 print:hidden">
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
              ) : !canSubmitPaymentProof ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  This invoice is currently marked as <strong className="uppercase">{invoice.status}</strong> and is not accepting payment transfers.
                </div>
              ) : (
                <ActionFeedbackForm
                  action={submitInvoicePaymentProofAction}
                  successMessage="Payment proof submitted for verification."
                  className="space-y-3.5"
                >
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method *</Label>
                    <select
                      name="method"
                      aria-label="Payment proof method"
                      defaultValue="bank_transfer"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
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
                </ActionFeedbackForm>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
