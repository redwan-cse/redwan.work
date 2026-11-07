import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowRight,
  Briefcase,
  CreditCard,
  DollarSign,
  Inbox,
  LifeBuoy,
  Repeat,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const admin = getSupabaseAdmin();
  const [
    { data: metricsRaw },
    { data: recentOrders },
    { data: pendingPayments },
    { data: recentInquiries },
    { data: recentAudit },
  ] = await Promise.all([
    admin.rpc('admin_command_center_metrics'),
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            EXECUTIVE COMMAND CENTER
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">
            Operations, Revenue &amp; Client Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview across inquiries, proposals, active security &amp; engineering orders, encrypted deliverables, and USD-normalized revenue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/admin/clients">Invite Client</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full">
            <Link href="/admin/orders">Create Order</Link>
          </Button>
        </div>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Lifetime Revenue (USD)</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatMoney(metrics.lifetime_revenue_usd_cents ?? 0, 'USD')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[11px] text-muted-foreground">
              30d: {formatMoney(metrics.revenue_30d_usd_cents ?? 0, 'USD')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Active Orders</span>
              <Briefcase className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {metrics.active_orders ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[11px] text-muted-foreground">
              {metrics.awaiting_review_orders ?? 0} awaiting client sign-off
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>New Inquiries</span>
              <Inbox className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {metrics.new_inquiries ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/inquiries" className="text-[11px] font-medium text-primary hover:underline">
              Triage inbox →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Payment Proofs</span>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {metrics.submitted_payments ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[11px] text-muted-foreground">
              {metrics.overdue_invoices ?? 0} overdue invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Active Clients</span>
              <Users className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {metrics.total_clients ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[11px] text-muted-foreground">
              {metrics.vip_clients ?? 0} VIP / Retainer tier
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Tickets &amp; Retainers</span>
              <LifeBuoy className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {metrics.open_tickets ?? 0} / {metrics.active_retainers ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Repeat className="h-3 w-3 text-primary" />
              Open tickets / Retainers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Orders Pipeline */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Active &amp; Recent Orders</CardTitle>
              <CardDescription>Click any order to manage RoE, milestones, and R2 deliverables.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1 rounded-full text-xs">
              <Link href="/admin/orders">
                All Orders <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="divide-y divide-border/70">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="space-y-1">
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
                      </div>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="block text-sm font-semibold hover:text-primary"
                      >
                        {order.title}
                      </Link>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="font-bold">
                        {formatMoney(order.total_cents, order.currency)}
                      </div>
                      <div className="text-muted-foreground">{order.progress_percent}% done</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No orders yet. Create an order or convert a client inquiry to get started.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Queue: Pending Payment Proofs & New Inquiries */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending Payment Proofs</CardTitle>
              <CardDescription className="text-xs">
                Submitted client receipts awaiting verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments && pendingPayments.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {pendingPayments.map((pay) => (
                    <div
                      key={pay.id}
                      className="flex items-center justify-between gap-2 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-primary">{pay.code}</span>
                        <span className="ml-2 text-muted-foreground">
                          {pay.method} · Ref: {pay.reference}
                        </span>
                      </div>
                      <Button asChild variant="outline" size="sm" className="h-7 rounded-full text-xs">
                        <Link href={`/admin/invoices/${pay.invoice_id}`}>
                          Verify {formatMoney(pay.amount_cents, pay.currency)}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  All submitted payment proofs have been reviewed.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Latest Service Inquiries</CardTitle>
              <CardDescription className="text-xs">
                Direct submissions from `/contact` and service package links.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentInquiries && recentInquiries.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {recentInquiries.map((inq) => (
                    <div
                      key={inq.id}
                      className="flex items-center justify-between gap-2 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-mono font-semibold text-primary">
                          {inq.code}
                        </span>
                        <span className="ml-2 font-medium">{inq.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {inq.email}
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {inq.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  No new inquiries in queue.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live Immutable Audit Stream */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-4 w-4 text-primary" />
              Immutable Security &amp; Operations Audit Stream
            </CardTitle>
            <CardDescription>
              Every proposal acceptance, RoE signature, R2 file download, and payment review is recorded.
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="rounded-full text-xs">
            <Link href="/admin/audit">Full Audit Log →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentAudit && recentAudit.length > 0 ? (
            <div className="divide-y divide-border/60 text-xs">
              {recentAudit.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.action}
                    </Badge>
                    <span className="text-foreground/90">{entry.summary}</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-xs text-muted-foreground">No audit events recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
