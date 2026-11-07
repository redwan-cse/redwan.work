import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Briefcase, ShieldCheck, Sparkles } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ClientOrdersListPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/orders');

  const admin = getSupabaseAdmin();
  const { data: orders } = await admin
    .from('orders')
    .select(
      'id, code, title, pillar, status, priority, progress_percent, requires_roe, roe_signed_at, currency, total_cents, due_at, created_at'
    )
    .eq('client_id', session.userId)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Orders & Projects</h1>
          <p className="text-sm text-muted-foreground">
            Track milestones, submit requirements, sign RoE authorizations, and review versioned deliverables.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5 rounded-full">
          <Link href="/portal/orders/new">
            <Sparkles className="h-3.5 w-3.5" />
            Order New Service
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {(orders ?? []).map((ord) => {
          const pillarMeta = SERVICE_PILLARS[ord.pillar as ServicePillarKey];
          return (
            <Card key={ord.id} className="border-border/80 bg-card/85">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {ord.code}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {ord.status.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {pillarMeta?.shortLabel ?? ord.pillar}
                      </Badge>
                      {ord.requires_roe && (
                        <Badge
                          variant={ord.roe_signed_at ? 'default' : 'destructive'}
                          className="font-mono text-[10px]"
                        >
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          {ord.roe_signed_at ? 'RoE Authorized' : 'Action Required: Sign RoE'}
                        </Badge>
                      )}
                    </div>

                    <Link
                      href={`/portal/orders/${ord.id}`}
                      className="block text-base font-bold hover:text-primary"
                    >
                      {ord.title}
                    </Link>

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Progress: {ord.progress_percent}%</span>
                      {ord.due_at && (
                        <span>Target Delivery: {new Date(ord.due_at).toLocaleDateString()}</span>
                      )}
                      <span>Created: {new Date(ord.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-mono text-base font-bold">
                        {ord.currency} {(ord.total_cents / 100).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Total Value</div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <Link href={`/portal/orders/${ord.id}`}>
                        Open Workspace
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(orders ?? []).length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">No orders placed yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Launch your first cybersecurity, full-stack web engineering, cloud, or tech support engagement from the Service Store.
              </p>
              <Button asChild size="sm" className="mt-4 gap-1.5 rounded-full">
                <Link href="/portal/orders/new">
                  <Sparkles className="h-3.5 w-3.5" />
                  Browse Service Packages
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
