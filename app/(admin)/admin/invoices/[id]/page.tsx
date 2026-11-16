import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CreditCard, Download, FileMinus2, Send, XCircle } from 'lucide-react';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrintInvoiceButton } from '@/components/panel/print-invoice-button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSession } from '@/lib/auth/session';
import {
  issueCreditNoteAction,
  recordManualPaymentAction,
  reviewPaymentProofAction,
  sendDraftInvoiceAction,
  voidInvoiceAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminSession();
  const admin = getSupabaseAdmin();

  const [{ data: invoice }, { data: items }, { data: payments }, { data: creditNotes }] =
    await Promise.all([
      admin.from('invoices').select('*').eq('id', id).maybeSingle(),
      admin.from('invoice_items').select('*').eq('invoice_id', id).order('position'),
      admin
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('submitted_at', { ascending: false }),
      admin
        .from('credit_notes')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at', { ascending: false }),
    ]);

  if (!invoice) notFound();

  const [{ data: client }, { data: clientBilling }] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', invoice.client_id).maybeSingle(),
    admin
      .from('client_profiles')
      .select('company_name, tax_id, billing_address')
      .eq('user_id', invoice.client_id)
      .maybeSingle(),
  ]);

  const billingAddr = (clientBilling?.billing_address ?? {}) as Record<string, string | undefined>;
  const outstandingCents = Math.max(
    0,
    invoice.total_cents - invoice.amount_paid_cents - invoice.credited_cents
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/billing"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary print:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Billing &amp; Invoices
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold sm:text-3xl">{invoice.code}</h1>
            <Badge
              variant={
                invoice.status === 'paid'
                  ? 'secondary'
                  : invoice.status === 'void' || invoice.status === 'overdue'
                    ? 'destructive'
                    : 'outline'
              }
              className="font-mono text-xs uppercase"
            >
              {invoice.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Billed to {client?.full_name || client?.email} ({client?.email})
            {clientBilling?.company_name ? ` · ${clientBilling.company_name}` : ''}
            {clientBilling?.tax_id ? ` · Tax ID: ${clientBilling.tax_id}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {invoice.status === 'draft' && (
            <ActionFeedbackForm
              action={sendDraftInvoiceAction}
              successMessage="Draft invoice issued to client."
            >
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Send className="h-3.5 w-3.5" />
                Send Draft to Client
              </Button>
            </ActionFeedbackForm>
          )}
          {invoice.status !== 'void' && invoice.status !== 'paid' && invoice.amount_paid_cents === 0 && (
            <ConfirmActionButton
              action={voidInvoiceAction}
              hiddenFields={{ invoice_id: invoice.id }}
              triggerLabel="Void Invoice"
              confirmTitle={`Void invoice ${invoice.code}?`}
              confirmDescription="Sets status to void cleanly so the client can no longer submit payment against it."
              confirmLabel="Void Invoice"
              successMessage="Invoice voided."
              destructive
              variant="outline"
            />
          )}
          <PrintInvoiceButton />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Statement Breakdown */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Statement Breakdown</CardTitle>
            {billingAddr.line1 && (
              <CardDescription className="text-xs">
                Billing Address: {[billingAddr.line1, billingAddr.city, billingAddr.country].filter(Boolean).join(', ')}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border/70 text-sm">
              {(items ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-xs font-medium sm:text-sm">{item.description}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      Qty: {item.qty} × {formatMoney(item.unit_price_cents, invoice.currency)}
                    </div>
                  </div>
                  <div className="font-mono text-xs font-bold sm:text-sm">
                    {formatMoney(
                      item.line_total_cents ?? Math.round(item.qty * item.unit_price_cents),
                      invoice.currency
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-border pt-3 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal / Total:</span>
                <span>{formatMoney(invoice.total_cents, invoice.currency)}</span>
              </div>
              {invoice.credited_cents > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Credit Notes Applied:</span>
                  <span>-{formatMoney(invoice.credited_cents, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid:</span>
                <span className="text-primary">
                  -{formatMoney(invoice.amount_paid_cents, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-bold">
                <span>Balance Due:</span>
                <span>{formatMoney(outstandingCents, invoice.currency)}</span>
              </div>
            </div>

            {/* Credit Notes History */}
            {creditNotes && creditNotes.length > 0 && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="text-xs font-semibold">Issued Credit Notes ({creditNotes.length})</div>
                {creditNotes.map((cn) => (
                  <div
                    key={cn.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{cn.code}</span> · {cn.reason}
                    </div>
                    <span className="font-mono font-semibold">
                      {formatMoney(cn.amount_cents, cn.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Verification & Manual/Credit Controls */}
        <div className="space-y-6 lg:col-span-5 print:hidden">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Payment Transactions ({payments?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {payments && payments.length > 0 ? (
                payments.map((pay) => (
                  <div key={pay.id} className="space-y-2 rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">{pay.code}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {pay.status}
                      </Badge>
                    </div>
                    <div className="font-mono font-semibold">
                      {formatMoney(pay.amount_cents, pay.currency)} · {pay.method}
                    </div>
                    <div className="text-muted-foreground">Ref: {pay.reference}</div>
                    {pay.proof_file_id && (
                      <a
                        href={`/api/files/${pay.proof_file_id}/download`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Proof File
                      </a>
                    )}
                    {pay.status === 'submitted' && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <form action={reviewPaymentProofAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="payment_id" value={pay.id} />
                          <input type="hidden" name="decision" value="confirmed" />
                          <Input
                            name="fx_rate"
                            type="number"
                            step="0.0001"
                            defaultValue={pay.currency === 'USD' ? '1.0' : '0.0083'}
                            className="h-8 w-20 font-mono text-xs"
                          />
                          <Button type="submit" size="sm" className="h-8 gap-1 rounded-full">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        </form>
                        <form action={reviewPaymentProofAction}>
                          <input type="hidden" name="payment_id" value={pay.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <Button type="submit" size="sm" variant="destructive" className="h-8 gap-1 rounded-full">
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-muted-foreground">
                  No payment submissions yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Record Manual Payment */}
          {invoice.status !== 'void' && outstandingCents > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Record Offline / Manual Payment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionFeedbackForm
                  action={recordManualPaymentAction}
                  successMessage="Manual payment verified and applied."
                  resetOnSuccess
                  className="space-y-3"
                >
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Method</Label>
                      <select
                        name="method"
                        defaultValue="manual"
                        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="manual">Manual / Cash</option>
                        <option value="bank_transfer">Bank Wire / SWIFT</option>
                        <option value="wise">Wise</option>
                        <option value="payoneer">Payoneer</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="paypal">PayPal</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Amount ({invoice.currency}) *</Label>
                      <Input
                        name="amount_major"
                        type="number"
                        step="0.01"
                        min="0.01"
                        defaultValue={(outstandingCents / 100).toFixed(2)}
                        required
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Reference *</Label>
                      <Input
                        name="reference"
                        required
                        placeholder="WIRE-REF-001"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">FX → USD</Label>
                      <Input
                        name="fx_rate"
                        type="number"
                        step="0.0001"
                        defaultValue={invoice.fx_rate_to_usd}
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" className="w-full rounded-full">
                    Record Verified Payment
                  </Button>
                </ActionFeedbackForm>
              </CardContent>
            </Card>
          )}

          {/* Issue Credit Note */}
          {invoice.status !== 'void' && invoice.status !== 'draft' && outstandingCents > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileMinus2 className="h-4 w-4 text-primary" />
                  Issue Credit Note (CN-XXXX)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionFeedbackForm
                  action={issueCreditNoteAction}
                  successMessage="Credit note issued and balance adjusted."
                  resetOnSuccess
                  className="space-y-3"
                >
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <div className="space-y-1">
                    <Label className="text-xs">Credit Amount ({invoice.currency}) *</Label>
                    <Input
                      name="amount_major"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={(outstandingCents / 100).toFixed(2)}
                      required
                      placeholder="50.00"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Adjustment Reason *</Label>
                    <Input
                      name="reason"
                      required
                      placeholder="Scope adjustment or courtesy credit"
                      className="h-9 text-xs"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="w-full rounded-full">
                    Apply Credit Note
                  </Button>
                </ActionFeedbackForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
