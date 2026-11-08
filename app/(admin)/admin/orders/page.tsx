import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Briefcase, Plus, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createOrderFromAdminAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  const admin = getSupabaseAdmin();
  const [{ data: orders }, { data: clients }] = await Promise.all([
    admin
      .from('orders')
      .select(
        'id, code, client_id, title, pillar, status, progress_percent, requires_roe, roe_signed_at, total_cents, currency, due_at, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.full_name || c.email])
  );

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <Briefcase className="h-3.5 w-3.5" />
          ORDER EXECUTION PIPELINE
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Client Orders &amp; Deliverables (`ORD-XXXX`)
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage active engagements across all 5 service pillars, enforce Rules of Engagement, publish versioned encrypted deliverables, and communicate in order threads.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-12">
        {/* Create New Order Form */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Create Direct Order</CardTitle>
            <CardDescription>
              Initializes `ORD-XXXX`, default milestones, and kickoff deposit invoice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createOrderFromAdminAction} className="space-y-4">
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
                <Label className="text-xs">Order Title *</Label>
                <Input
                  name="title"
                  required
                  placeholder="Web & API Penetration Test (VAPT)"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Service Pillar</Label>
                  <select
                    name="pillar"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="cybersecurity">Cybersecurity &amp; VAPT</option>
                    <option value="development">Full-Stack Dev</option>
                    <option value="cloud_devops">Cloud &amp; Linux Ops</option>
                    <option value="ai_ml">AI/ML &amp; Automation</option>
                    <option value="tech_support">Tech Support &amp; Recovery</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Total Price (USD)</Label>
                  <Input
                    name="total_usd"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="1150"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Deposit %</Label>
                  <Input
                    name="deposit_percent"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="50"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Target Due (Days)</Label>
                  <Input
                    name="due_days"
                    type="number"
                    min="1"
                    defaultValue="10"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="requires_roe"
                  className="h-4 w-4 rounded border-border"
                />
                Require Signed RoE Before Execution
              </label>

              <div className="space-y-1.5">
                <Label className="text-xs">Scope Summary</Label>
                <Textarea
                  name="description"
                  rows={3}
                  placeholder="Describe target assets, repositories, or deliverables..."
                  className="text-xs"
                />
              </div>

              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Launch Order
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Orders Pipeline List */}
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">All Orders</CardTitle>
            <CardDescription>Click any order to open its 360° execution workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {orders && orders.length > 0 ? (
              <div className="divide-y divide-border/70">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-xs font-bold text-primary hover:underline"
                        >
                          {order.code}
                        </Link>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {order.pillar}
                        </Badge>
                        {order.requires_roe && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/40 font-mono text-[10px] text-primary"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {order.roe_signed_at ? 'RoE Signed' : 'RoE Pending'}
                          </Badge>
                        )}
                      </div>

                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="block text-base font-bold hover:text-primary"
                      >
                        {order.title}
                      </Link>

                      <div className="text-xs text-muted-foreground">
                        Client: <span className="font-medium text-foreground">{clientMap.get(order.client_id) ?? 'Client'}</span> · Created{' '}
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right font-mono text-xs">
                        <div className="text-sm font-bold">
                          {formatMoney(order.total_cents, order.currency)}
                        </div>
                        <div className="text-muted-foreground">
                          {order.progress_percent}% complete
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="gap-1 rounded-full text-xs">
                        <Link href={`/admin/orders/${order.id}`}>
                          Manage <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No orders yet. Create an order on the left or accept a proposal.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
