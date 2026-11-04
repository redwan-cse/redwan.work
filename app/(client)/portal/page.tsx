import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Briefcase,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  FolderLock,
  LifeBuoy,
  Repeat,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';

export const dynamic = 'force-dynamic';

export default async function ClientPortalOverviewPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');

  const admin = getSupabaseAdmin();

  const [
    { data: overviewRaw },
    { data: orders },
    { data: proposals },
    { data: invoices },
  ] = await Promise.all([
    admin.rpc('client_portal_overview', { p_client_id: session.userId }),
    admin
      .from('orders')
      .select('id, code, title, pillar, status, progress_percent, total_cents, currency, due_at')
      .eq('client_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('proposals')
      .select('id, code, title, pillar, status, total_cents, currency, valid_until')
      .eq('client_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(4),
    admin
      .from('invoices')
      .select('id, code, status, total_cents, currency, due_at')
      .eq('client_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const overview = (overviewRaw ?? {}) as Record<string, number>;
  const outstandingUsd = ((overview.outstanding_balance_cents ?? 0) / 100).toLocaleString();

  const kpis = [
    {
      label: 'Active Engagements',
      value: overview.active_orders ?? 0,
      sub: 'Live orders in progress',
      href: '/portal/orders',
      icon: Briefcase,
    },
    {
      label: 'Pending Proposals',
      value: overview.pending_proposals ?? 0,
      sub: 'Awaiting your review',
      href: '/portal/proposals',
      icon: FileSpreadsheet,
    },
    {
      label: 'Ready Deliverables',
      value: overview.awaiting_review_deliverables ?? 0,
      sub: 'Ready for download & sign-off',
      href: '/portal/files',
      icon: FileCheck2,
    },
    {
      label: 'Outstanding Balance',
      value: `$${outstandingUsd}`,
      sub: `${overview.unpaid_invoices ?? 0} open invoice(s)`,
      href: '/portal/invoices',
      icon: CreditCard,
    },
    {
      label: 'Active Retainers',
      value: overview.active_retainers ?? 0,
      sub: 'Dedicated monthly SLA',
      href: '/portal/retainers',
      icon: Repeat,
    },
    {
      label: 'Support Tickets',
      value: overview.open_tickets ?? 0,
      sub: 'Direct priority helpdesk',
      href: '/portal/tickets',
      icon: LifeBuoy,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              C|EH Verified Client Workspace
            </Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back, {session.fullName || session.email}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track live engagements, sign C|EH Rules of Engagement, download encrypted deliverables, and place new service orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button asChild className="gap-1.5 rounded-full">
            <Link href="/portal/orders/new">
              <Sparkles className="h-4 w-4" />
              Order a Service
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5 rounded-full">
            <Link href="/portal/files">
              <FolderLock className="h-4 w-4" />
              Deliverables Vault
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href}>
              <Card className="h-full border-border/80 bg-card/85 transition-colors hover:border-primary/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.label}
                    </span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-bold tracking-tight">
                    {item.value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.sub}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent Orders & Pending Proposals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 bg-card/85">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-bold">Active & Recent Orders</CardTitle>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/portal/orders">
                View All
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(orders ?? []).map((ord) => {
              const pillarMeta = SERVICE_PILLARS[ord.pillar as ServicePillarKey];
              return (
                <Link
                  key={ord.id}
                  href={`/portal/orders/${ord.id}`}
                  className="block rounded-xl border border-border/70 bg-background/60 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {ord.code}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {ord.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="mt-1 font-semibold">{ord.title}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{pillarMeta?.shortLabel ?? ord.pillar}</span>
                    <span className="font-mono font-semibold text-foreground">
                      {ord.currency} {(ord.total_cents / 100).toLocaleString()} • {ord.progress_percent}%
                    </span>
                  </div>
                </Link>
              );
            })}
            {(orders ?? []).length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No active orders yet. Start a new engagement from the Service Store.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold">Custom Proposals</CardTitle>
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/portal/proposals">
                  All Proposals
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(proposals ?? []).map((prp) => (
                <Link
                  key={prp.id}
                  href="/portal/proposals"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3.5 transition-colors hover:border-primary/40"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {prp.code}
                      </span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {prp.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{prp.title}</div>
                  </div>
                  <div className="text-right font-mono text-sm font-bold">
                    {prp.currency} {(prp.total_cents / 100).toLocaleString()}
                  </div>
                </Link>
              ))}
              {(proposals ?? []).length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No custom proposals pending right now.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold">Recent Invoices</CardTitle>
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/portal/invoices">
                  All Invoices
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(invoices ?? []).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}`}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3 text-xs transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-primary">{inv.code}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {inv.status}
                    </Badge>
                  </div>
                  <span className="font-mono font-bold">
                    {inv.currency} {(inv.total_cents / 100).toLocaleString()}
                  </span>
                </Link>
              ))}
              {(invoices ?? []).length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No invoices issued yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
