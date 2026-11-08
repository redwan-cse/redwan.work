import Link from 'next/link';
import { ArrowRight, CreditCard, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createAndIssueInvoiceAction, reviewPaymentProofAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminInvoicesPage() {
  const admin = getSupabaseAdmin();
  const [
    { data: invoices },
    { data: pendingPayments },
    { data: clients },
    { data: orders },
  ] = await Promise.all([
    admin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('payments')
      .select('*')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, email').eq('role', 'client'),
    admin.from('orders').select('id, code, title, client_id').order('created_at', { ascending: false }),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.full_name || c.email])
  );

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <CreditCard className="h-3.5 w-3.5" />
          MULTI-CURRENCY BILLING &amp; LEDGER
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Invoices &amp; Payment Verification (`INV-XXXX` / `PAY-XXXX`)
        </h1>
        <p className="text-sm text-muted-foreground">
          Issue invoices in USD, EUR, GBP, or BDT and verify client payment proofs with atomic USD LTV normalization.
        </p>
      </div>

      {/* Pending Payment Proofs Banner */}
      {pendingPayments && pendingPayments.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Action Required: {pendingPayments.length} Submitted Payment Proof(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingPayments.map((pay) => (
              <div
                key={pay.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{pay.code}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {pay.method}
                    </Badge>
                    <span className="font-mono font-bold">
                      {formatMoney(pay.amount_cents, pay.currency)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Ref: <span className="font-mono text-foreground">{pay.reference}</span>
                    {pay.proof_file_id && (
                      <>
                        {' · '}
                        <a
                          href={`/api/files/${pay.proof_file_id}/download`}
                          className="font-semibold text-primary underline"
                        >
                          Download Receipt Proof
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form action={reviewPaymentProofAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="payment_id" value={pay.id} />
                    <input type="hidden" name="decision" value="confirmed" />
                    {pay.currency !== 'USD' ? (
                      <Input
                        name="fx_rate"
                        type="number"
                        step="0.0001"
                        defaultValue={pay.fx_rate_to_usd || 1}
                        title="FX rate to USD"
                        className="h-9 w-24 font-mono text-xs"
                      />
                    ) : (
                      <input type="hidden" name="fx_rate" value="1" />
                    )}
                    <Button type="submit" size="sm" className="h-9 rounded-full text-xs">
                      Confirm Payment
                    </Button>
                  </form>

                  <form action={reviewPaymentProofAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="payment_id" value={pay.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <Input
                      name="reason"
                      placeholder="Rejection note..."
                      defaultValue="Reference or receipt could not be verified."
                      className="h-9 w-48 text-xs"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full text-xs"
                    >
                      Reject
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 xl:grid-cols-12">
        {/* Issue New Invoice Form */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Issue New Invoice</CardTitle>
            <CardDescription>Creates and locks an `INV-XXXX` statement.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAndIssueInvoiceAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Client *</Label>
                <select
                  name="client_id"
                  required
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="">— Select Client —</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.email} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Linked Order (Optional)</Label>
                <select
                  name="order_id"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="">— Standalone Invoice —</option>
                  {(orders ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code}: {o.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Line Item Description *</Label>
                <Input
                  name="description"
                  required
                  placeholder="Web & API Penetration Test — Milestone 1"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Amount *</Label>
                  <Input
                    name="amount_major"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    defaultValue="575"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Currency</Label>
                  <select
                    name="currency"
                    defaultValue="USD"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="BDT">BDT</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">FX → USD</Label>
                  <Input
                    name="fx_rate_to_usd"
                    type="number"
                    step="0.0001"
                    defaultValue="1"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Due In (Days)</Label>
                  <Input
                    name="due_days"
                    type="number"
                    min="1"
                    defaultValue="7"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      name="is_deposit_invoice"
                      className="h-4 w-4 rounded border-border"
                    />
                    Kickoff Deposit Invoice
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Instructions / Notes</Label>
                <Textarea
                  name="notes"
                  rows={2}
                  placeholder="Wire / Wise / Payoneer / bKash instructions..."
                  className="text-xs"
                />
              </div>

              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Issue Invoice
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Invoices Ledger */}
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Issued Invoices Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices && invoices.length > 0 ? (
              <div className="divide-y divide-border/70">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="font-mono text-sm font-bold text-primary hover:underline"
                        >
                          {inv.code}
                        </Link>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {inv.status}
                        </Badge>
                        {inv.is_deposit_invoice && (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            Deposit
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Client: <span className="font-medium text-foreground">{clientMap.get(inv.client_id) ?? 'Client'}</span>
                        {inv.notes ? ` · ${inv.notes}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right font-mono text-xs">
                        <div className="text-sm font-bold">
                          {formatMoney(inv.total_cents, inv.currency)}
                        </div>
                        <div className="text-muted-foreground">
                          Paid: {formatMoney(inv.amount_paid_cents, inv.currency)}
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="gap-1 rounded-full text-xs">
                        <Link href={`/admin/invoices/${inv.id}`}>
                          Inspect <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No invoices issued yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
