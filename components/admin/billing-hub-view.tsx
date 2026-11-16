import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  XCircle,
} from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createAndIssueInvoiceAction,
  createRetainerPlanAction,
  renewRetainerCycleAction,
  reviewPaymentProofAction,
  updateRetainerPlanAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export async function BillingHubView({
  activeTab,
  statusFilter = '',
  basePath = '/admin/billing',
  pageParam,
}: {
  activeTab: 'invoices' | 'retainers';
  statusFilter?: string;
  basePath?: string;
  pageParam?: string;
}) {
  const admin = getSupabaseAdmin();
  const [
    { data: invoices },
    { data: pendingPayments },
    { data: retainers },
    { data: clients },
    { data: orders },
  ] = await Promise.all([
    admin.from('invoices').select('*').order('created_at', { ascending: false }).limit(250),
    admin
      .from('payments')
      .select('*')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    admin.from('retainer_plans').select('*').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, email').eq('role', 'client'),
    admin.from('orders').select('id, code, title, client_id').order('created_at', { ascending: false }),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.full_name || c.email])
  );

  const filteredInvoices = (invoices ?? []).filter(
    (inv) => !statusFilter || inv.status === statusFilter
  );
  const pagedInvoices = paginateItems(filteredInvoices, pageParam);

  const openInvoiceCount = (invoices ?? []).filter(
    (i) => i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue'
  ).length;
  const activeRetainerCount = (retainers ?? []).filter((r) => r.status === 'active').length;

  const tabs = [
    {
      id: 'invoices',
      label: 'Invoices & Payment Proofs (INV/PAY)',
      href: basePath === '/admin/invoices' ? '/admin/invoices' : '/admin/billing?tab=invoices',
      count: openInvoiceCount,
    },
    {
      id: 'retainers',
      label: 'Monthly Retainer Plans',
      href: basePath === '/admin/retainers' ? '/admin/retainers' : '/admin/billing?tab=retainers',
      count: activeRetainerCount,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="MULTI-CURRENCY BILLING, FX & RETAINERS"
        title="Invoices, Payment Verification & Retainer Cycles"
        description="Issue multi-line draft or live invoices, verify proof receipts with atomic USD FX conversion, issue credit notes, record manual payments, and renew retainer billing cycles."
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href="/admin/invoices/new">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              New Multi-Line Invoice
            </Link>
          </Button>
        }
      />

      {/* Pending Payment Proofs Action Banner */}
      {pendingPayments && pendingPayments.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Action Required: {pendingPayments.length} Submitted Payment Proof(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pendingPayments.map((pay) => (
              <div
                key={pay.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <div className="flex items-center gap-1">
                      <Label className="text-[11px] text-muted-foreground">FX→USD:</Label>
                      <Input
                        name="fx_rate"
                        type="number"
                        step="0.0001"
                        defaultValue={pay.currency === 'USD' ? '1.0' : '0.0083'}
                        className="h-8 w-20 font-mono text-xs"
                      />
                    </div>
                    <Button type="submit" size="sm" className="h-8 gap-1 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirm Payment
                    </Button>
                  </form>

                  <form action={reviewPaymentProofAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="payment_id" value={pay.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <Input
                      name="reason"
                      placeholder="Rejection reason..."
                      className="h-8 w-36 text-xs"
                    />
                    <Button type="submit" size="sm" variant="destructive" className="h-8 gap-1 rounded-full">
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'invoices' ? (
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Quick Single-Line Invoice Issuer */}
          <Card className="xl:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Issue Single Invoice</CardTitle>
              <CardDescription className="text-xs">
                Need multiple line items or draft preview? Use the{' '}
                <Link href="/admin/invoices/new" className="font-semibold text-primary underline">
                  Multi-Line Composer
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={createAndIssueInvoiceAction}
                successMessage="Invoice issued to client."
                resetOnSuccess
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <select
                    name="client_id"
                    aria-label="Invoice client"
                    required
                    className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">— Select Client —</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Link to Order (Optional)</Label>
                  <select
                    name="order_id"
                    aria-label="Linked order"
                    className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">— Standalone Invoice —</option>
                    {(orders ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}: {o.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Description *</Label>
                  <Input
                    name="description"
                    required
                    placeholder="Milestone 2 Payment or Retainer Billing"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Currency</Label>
                    <select
                      name="currency"
                      aria-label="Invoice currency"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
                    >
                      <option value="USD">USD</option>
                      <option value="BDT">BDT</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount *</Label>
                    <Input
                      name="amount_major"
                      aria-label="Invoice amount"
                      type="number"
                      required
                      min="1"
                      defaultValue="500"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">FX→USD</Label>
                    <Input
                      name="fx_rate_to_usd"
                      aria-label="Exchange rate to USD"
                      type="number"
                      step="0.0001"
                      defaultValue="1.0"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Discount</Label>
                    <Input
                      name="discount_major"
                      aria-label="Discount amount"
                      type="number"
                      min="0"
                      defaultValue="0"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tax bps</Label>
                    <Input
                      name="tax_rate_bps"
                      aria-label="Tax rate in basis points"
                      type="number"
                      defaultValue="0"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Due Days</Label>
                    <Input
                      name="due_days"
                      aria-label="Due days"
                      type="number"
                      defaultValue="7"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Invoice Notes</Label>
                  <Textarea name="notes" rows={2} placeholder="Bank wire memo or Net-7 terms" className="text-xs" />
                </div>

                <Button type="submit" className="w-full gap-1.5 rounded-full">
                  <Plus className="h-4 w-4" />
                  Issue Invoice to Client
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          {/* Invoices Ledger Table */}
          <Card className="xl:col-span-8">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">Invoices Ledger ({filteredInvoices.length})</CardTitle>
                <CardDescription className="text-xs">Click any invoice to issue credit notes, record manual cash/wire payments, or print A4.</CardDescription>
              </div>
              <form method="get" className="flex items-center gap-2">
                {basePath === '/admin/billing' && <input type="hidden" name="tab" value="invoices" />}
                <select
                  name="status"
                  aria-label="Filter invoices by status"
                  defaultValue={statusFilter}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">draft</option>
                  <option value="issued">issued</option>
                  <option value="partially_paid">partially_paid</option>
                  <option value="paid">paid</option>
                  <option value="overdue">overdue</option>
                  <option value="void">void</option>
                </select>
                <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                  Filter
                </Button>
              </form>
            </CardHeader>
            <CardContent className="p-0">
              {filteredInvoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Invoice</TableHead>
                      <TableHead className="text-xs">Client</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Total</TableHead>
                      <TableHead className="text-right text-xs">Due</TableHead>
                      <TableHead className="text-right text-xs">Manage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedInvoices.items.map((inv) => {
                      const dueCents = Math.max(
                        0,
                        inv.total_cents - inv.amount_paid_cents - inv.credited_cents
                      );
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <Link
                              href={`/admin/invoices/${inv.id}`}
                              className="font-mono text-xs font-bold text-primary hover:underline"
                            >
                              {inv.code}
                            </Link>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {inv.issued_at
                                ? new Date(inv.issued_at).toLocaleDateString()
                                : 'Draft'}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Link href={`/admin/clients/${inv.client_id}`} className="hover:underline">
                              {clientMap.get(inv.client_id) ?? 'Client'}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inv.status === 'paid'
                                  ? 'secondary'
                                  : inv.status === 'overdue' || inv.status === 'void'
                                    ? 'destructive'
                                    : 'outline'
                              }
                              className="font-mono text-[10px]"
                            >
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatMoney(inv.total_cents, inv.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMoney(dueCents, inv.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                              <Link href={`/admin/invoices/${inv.id}`}>
                                View <ArrowRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No invoices match the selected filter.
                </p>
              )}
              <AdminPagination
                basePath={basePath}
                page={pagedInvoices.page}
                totalPages={pagedInvoices.totalPages}
                totalItems={pagedInvoices.totalItems}
                startIndex={pagedInvoices.startIndex}
                endIndex={pagedInvoices.endIndex}
                query={{
                  tab: basePath === '/admin/billing' ? 'invoices' : undefined,
                  status: statusFilter || undefined,
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          <Card className="xl:col-span-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Start Client Retainer</CardTitle>
              <CardDescription className="text-xs">
                Assigns monthly advisory hours and recurring billing rate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={createRetainerPlanAction}
                successMessage="Retainer plan activated."
                resetOnSuccess
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <select
                    name="client_id"
                    aria-label="Retainer client"
                    required
                    className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">— Select Client —</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Retainer Plan Title *</Label>
                  <Input
                    name="title"
                    aria-label="Retainer plan title"
                    required
                    defaultValue="Dedicated Security & Engineering Retainer"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Monthly Rate (USD)</Label>
                    <Input name="monthly_usd" aria-label="Monthly rate in USD" type="number" defaultValue="750" className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hours / Month</Label>
                    <Input name="hours_included" aria-label="Hours per month" type="number" defaultValue="10" className="h-9 font-mono text-xs" />
                  </div>
                </div>
                <Button type="submit" className="w-full gap-1.5 rounded-full">
                  <Plus className="h-4 w-4" />
                  Activate Retainer
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card className="xl:col-span-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active &amp; Historical Retainers ({retainers?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {retainers && retainers.length > 0 ? (
                retainers.map((ret) => (
                  <div key={ret.id} className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{ret.title}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {ret.status}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          Client: {clientMap.get(ret.client_id) ?? 'Client'} · Period:{' '}
                          <span className="font-mono">
                            {ret.current_period_start} → {ret.current_period_end}
                          </span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-primary">
                          {formatMoney(ret.monthly_fee_cents, ret.currency)}/mo
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Next invoice: {ret.next_invoice_date}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-2.5">
                      <ActionFeedbackForm
                        action={updateRetainerPlanAction}
                        successMessage="Retainer usage updated."
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="retainer_id" value={ret.id} />
                        <div className="space-y-1">
                          <Label className="text-[11px]">
                            Hours Used ({ret.hours_per_month}h incl.)
                          </Label>
                          <Input
                            name="hours_used_current_period"
                            aria-label="Hours used in current period"
                            type="number"
                            step="0.5"
                            defaultValue={ret.hours_used_current_period}
                            className="h-8 w-24 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Status</Label>
                          <select
                            name="status"
                            aria-label="Retainer status"
                            defaultValue={ret.status}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            <option value="active">active</option>
                            <option value="paused">paused</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </div>
                        <Button type="submit" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs">
                          <Save className="h-3.5 w-3.5" />
                          Update
                        </Button>
                      </ActionFeedbackForm>

                      {ret.status === 'active' && (
                        <ActionFeedbackForm
                          action={renewRetainerCycleAction}
                          successMessage="Retainer cycle rolled forward and renewal invoice issued."
                        >
                          <input type="hidden" name="retainer_id" value={ret.id} />
                          <Button type="submit" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Renew Cycle &amp; Issue Invoice
                          </Button>
                        </ActionFeedbackForm>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No active retainer plans configured yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
