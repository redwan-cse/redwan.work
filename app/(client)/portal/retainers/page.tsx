import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Repeat, Sparkles } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ClientRetainersPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/retainers');

  const admin = getSupabaseAdmin();
  const { data: retainers } = await admin
    .from('retainer_plans')
    .select('*')
    .eq('client_id', session.userId)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Advisory & Retainers</h1>
          <p className="text-sm text-muted-foreground">
            Track your dedicated monthly engineering, DevSecOps, and security advisory hours.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5 rounded-full">
          <Link href="/portal/orders/new?service=executive-tech-support-recovery&tier=standard">
            <Sparkles className="h-3.5 w-3.5" />
            Start Monthly Retainer
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {(retainers ?? []).map((ret) => {
          const pillarMeta = SERVICE_PILLARS[ret.pillar as ServicePillarKey];
          const pct = Math.min(
            100,
            Math.round(
              (Number(ret.hours_used_current_period ?? 0) /
                Math.max(1, Number(ret.hours_per_month ?? 1))) *
                100
            )
          );
          return (
            <Card key={ret.id} className="border-border/80 bg-card/85">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {ret.status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {pillarMeta?.shortLabel ?? ret.pillar}
                      </Badge>
                    </div>
                    <div className="text-base font-bold">{ret.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Hours Used This Period: {Number(ret.hours_used_current_period)} /{' '}
                      {Number(ret.hours_per_month)} hrs ({pct}%)
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-lg font-extrabold">
                      {ret.currency} {(ret.monthly_fee_cents / 100).toLocaleString()} / mo
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Renews {new Date(ret.current_period_end).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(retainers ?? []).length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Repeat className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">No active monthly retainers</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Subscribe to a monthly retainer for guaranteed SLA response times, continuous security monitoring, and ongoing full-stack maintenance.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
