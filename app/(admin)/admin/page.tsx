import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CreditCard,
  DollarSign,
  Inbox,
  LifeBuoy,
  Repeat,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { getAdminCommandCenterMetrics } from '@/lib/crm/overview-queries';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSession } from '@/lib/auth/session';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await requireAdminSession();
  const admin = getSupabaseAdmin();
  const [
    metricsRaw,
    { data: recentOrders },
    { data: pendingPayments },
    { data: pendingCancellations },
    { data: overdueInvoices },
    { data: urgentTickets },
    { data: recentInquiries },
    { data: recentAudit },
  ] = await Promise.all([
    getAdminCommandCenterMetrics(),
    admin
      .from('orders')
      .select('id, code, title, pillar, status, progress_percent, total_cents, currency, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    admin
      .from('payments')
      .select('id, code, invoice_id, amount_cents, currency, method, reference, submitted_at')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(5),
    admin
      .from('cancellation_requests')
      .select('id, order_id, reason, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('invoices')
      .select('id, code, total_cents, currency, due_at')
      .eq('status', 'overdue')
      .order('due_at', { ascending: true })
      .limit(5),
    admin
      .from('tickets')
      .select('id, code, subject, priority, status, last_message_at')
      .in('status', ['open', 'in_progress'])
      .order('last_message_at', { ascending: true })
      .limit(5),
    admin
      .from('inquiries')
      .select('id, code, name, email, service_pillar, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('audit_logs')
      .select('id, action, actor_role, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const metrics = (metricsRaw ?? {}) as Record<string, number>;
  const actionQueueCount =
    (pendingPayments?.length ?? 0) +
    (pendingCancellations?.length ?? 0) +
    (overdueInvoices?.length ?? 0) +
    (urgentTickets?.length ?? 0);

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="EXECUTIVE COMMAND CENTER"
        title="Operations, Revenue & Client Pipeline"
        description="Compact real-time pulse across payment verification, cancellation triage, SLA tickets, deliveries, and USD-normalized revenue."
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/admin/clients">Invite Client</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/admin/invoices/new">+ Draft Invoice</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/admin/orders">Orders Board</Link>
            </Button>
          </>
        }
      />

      {/* 6 KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Lifetime Revenue</span>
              <DollarSign className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">
              {formatMoney(metrics.lifetime_revenue_usd_cents ?? 0, 'USD')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="font-mono text-[11px] text-muted-foreground">
              30d: {formatMoney(metrics.revenue_30d_usd_cents ?? 0, 'USD')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Active Orders</span>
              <Briefcase className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">{metrics.active_orders ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/orders" className="text-[11px] font-medium text-primary hover:underline">
              {metrics.awaiting_review_orders ?? 0} awaiting sign-off →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Pipeline Leads</span>
              <Inbox className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">{metrics.new_inquiries ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/pipeline" className="text-[11px] font-medium text-primary hover:underline">
              Triage pipeline →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Payment Proofs</span>
              <CreditCard className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">{metrics.submitted_payments ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/billing" className="text-[11px] font-medium text-primary hover:underline">
              {metrics.overdue_invoices ?? 0} overdue invoices →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Active Clients</span>
              <Users className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">{metrics.total_clients ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/clients" className="text-[11px] font-medium text-primary hover:underline">
              {metrics.vip_clients ?? 0} VIP / Retainer →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Tickets &amp; Retainers</span>
              <LifeBuoy className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-xl">
              {metrics.open_tickets ?? 0} / {metrics.active_retainers ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/support" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              <Repeat className="h-3 w-3" /> Open SLA queue →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Action Required Queue */}
      <Card className={actionQueueCount > 0 ? 'border-primary/40 bg-primary/5' : ''}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Operational Action Queue ({actionQueueCount} items)
              </CardTitle>
              <CardDescription className="text-xs">
                Payment receipts awaiting FX verification, cancellation requests, overdue balances, and active support SLAs.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              REAL-TIME PRIORITY TRIAGE
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-card p-3 text-xs">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>Pending Payment Proofs</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {pendingPayments?.length ?? 0}
              </Badge>
            </div>
            {pendingPayments && pendingPayments.length > 0 ? (
              <div className="space-y-1.5">
                {pendingPayments.map((p) => (
                  <Link
                    key={p.id}
                    href={`/admin/invoices/${p.invoice_id}`}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 hover:bg-muted"
                  >
                    <span className="font-mono font-bold text-primary">{p.code}</span>
                    <span className="font-mono">{formatMoney(p.amount_cents, p.currency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">All proofs reconciled.</p>
            )}
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 text-xs">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>Cancellation Requests</span>
              <Badge
                variant={(pendingCancellations?.length ?? 0) > 0 ? 'destructive' : 'secondary'}
                className="font-mono text-[10px]"
              >
                {pendingCancellations?.length ?? 0}
              </Badge>
            </div>
            {pendingCancellations && pendingCancellations.length > 0 ? (
              <div className="space-y-1.5">
                {pendingCancellations.map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/orders/${c.order_id}`}
                    className="block truncate rounded-md bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/15"
                  >
                    {c.reason}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No pending cancellations.</p>
            )}
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 text-xs">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>Overdue Invoices</span>
              <Badge
                variant={(overdueInvoices?.length ?? 0) > 0 ? 'destructive' : 'secondary'}
                className="font-mono text-[10px]"
              >
                {overdueInvoices?.length ?? 0}
              </Badge>
            </div>
            {overdueInvoices && overdueInvoices.length > 0 ? (
              <div className="space-y-1.5">
                {overdueInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 hover:bg-muted"
                  >
                    <span className="font-mono font-bold text-destructive">{inv.code}</span>
                    <span className="font-mono">{formatMoney(inv.total_cents, inv.currency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Zero overdue invoices.</p>
            )}
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 text-xs">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>Open Support Tickets</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {urgentTickets?.length ?? 0}
              </Badge>
            </div>
            {urgentTickets && urgentTickets.length > 0 ? (
              <div className="space-y-1.5">
                {urgentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/tickets/${t.id}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 hover:bg-muted"
                  >
                    <span className="truncate font-medium">{t.subject}</span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[9px] uppercase">
                      {t.priority}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No open SLA backlog.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Split Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Engagement Orders</CardTitle>
              <CardDescription className="text-xs">Live progress &amp; workspace links.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/admin/orders">
                Orders Board <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="divide-y divide-border/70">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-xs font-bold text-primary hover:underline"
                        >
                          {order.code}
                        </Link>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {order.progress_percent}%
                        </span>
                      </div>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="block truncate text-xs font-medium hover:text-primary"
                      >
                        {order.title}
                      </Link>
                    </div>
                    <div className="shrink-0 font-mono text-xs font-semibold">
                      {formatMoney(order.total_cents, order.currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">No orders yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Inquiries</CardTitle>
              <CardDescription className="text-xs">Inbound website leads &amp; attachments.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/admin/pipeline">
                Pipeline <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentInquiries && recentInquiries.length > 0 ? (
              <div className="divide-y divide-border/70">
                {recentInquiries.map((inq) => (
                  <div key={inq.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-primary">
                          {inq.code}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {inq.status}
                        </Badge>
                      </div>
                      <div className="truncate text-xs font-medium">{inq.name}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {inq.email}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="h-7 shrink-0 rounded-full text-[11px]">
                      <Link href={`/admin/pipeline?tab=proposals&inquiry_id=${inq.id}`}>
                        Quote →
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">No inquiries yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Immutable Audit & Direct Ops Bar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Recent Security &amp; CRM Audit Trail</CardTitle>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link href="/admin/ops">
              Security &amp; Ops Hub <ShieldAlert className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentAudit && recentAudit.length > 0 ? (
            <div className="divide-y divide-border/70 text-xs">
              {recentAudit.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.action}
                    </Badge>
                    <span className="text-foreground">{entry.summary}</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">No audit entries yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
