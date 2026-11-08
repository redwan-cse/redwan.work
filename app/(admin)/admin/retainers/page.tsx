import { Plus, Repeat, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRetainerPlanAction, updateRetainerPlanAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminRetainersPage() {
  const admin = getSupabaseAdmin();
  const [{ data: retainers }, { data: clients }] = await Promise.all([
    admin.from('retainer_plans').select('*').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, email').eq('role', 'client'),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.full_name || c.email])
  );

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <Repeat className="h-3.5 w-3.5" />
          RECURRING ADVISORY &amp; RETAINERS
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Monthly Retainer Plans</h1>
        <p className="text-sm text-muted-foreground">
          Manage recurring monthly security, engineering, and priority SLA retainers for long-term clients.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Start Client Retainer</CardTitle>
            <CardDescription>Assigns monthly hours and recurring billing rate.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRetainerPlanAction} className="space-y-4">
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
                <Label className="text-xs">Retainer Plan Title *</Label>
                <Input
                  name="title"
                  required
                  defaultValue="Dedicated Security & Engineering Retainer"
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Monthly Rate (USD)</Label>
                  <Input
                    name="monthly_usd"
                    type="number"
                    defaultValue="750"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Hours / Month</Label>
                  <Input
                    name="hours_included"
                    type="number"
                    defaultValue="10"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Activate Retainer
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Active &amp; Past Retainers</CardTitle>
          </CardHeader>
          <CardContent>
            {retainers && retainers.length > 0 ? (
              <div className="divide-y divide-border/70">
                {retainers.map((r) => (
                  <div
                    key={r.id}
                    className="space-y-3 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{r.title}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {r.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Client: {clientMap.get(r.client_id) ?? 'Client'}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs">
                        <div className="font-bold">
                          {formatMoney(r.monthly_fee_cents, r.currency)} / mo
                        </div>
                        <div className="text-muted-foreground">
                          {r.hours_used_current_period} / {r.hours_per_month} hrs used
                        </div>
                      </div>
                    </div>

                    <form
                      action={updateRetainerPlanAction}
                      className="flex flex-wrap items-center gap-2.5 pt-1 text-xs"
                    >
                      <input type="hidden" name="retainer_id" value={r.id} />
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Hours Used:</Label>
                        <Input
                          name="hours_used_current_period"
                          type="number"
                          step="0.5"
                          min="0"
                          defaultValue={r.hours_used_current_period}
                          className="h-9 w-20 font-mono text-xs"
                        />
                      </div>
                      <select
                        name="status"
                        defaultValue={r.status}
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                      >
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      <Button type="submit" size="sm" variant="outline" className="h-9 gap-1 text-xs">
                        <Save className="h-3.5 w-3.5" />
                        Update Retainer
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No monthly retainers active yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
