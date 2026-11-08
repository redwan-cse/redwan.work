import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, LifeBuoy, Plus } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClientTicketAction } from '@/lib/crm/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function ClientTicketsPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/tickets');

  const admin = getSupabaseAdmin();
  const [{ data: tickets }, { data: orders }] = await Promise.all([
    admin
      .from('tickets')
      .select(
        'id, code, subject, status, priority, created_at, order:orders(id, code, title)'
      )
      .eq('client_id', session.userId)
      .order('created_at', { ascending: false }),
    admin
      .from('orders')
      .select('id, code, title')
      .eq('client_id', session.userId)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support Helpdesk</h1>
        <p className="text-sm text-muted-foreground">
          Open a priority support ticket for urgent security incidents, server/cloud issues, bug fixes, or billing questions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Open New Ticket */}
        <Card className="border-primary/30 bg-card/90 lg:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Plus className="h-4 w-4 text-primary" />
              Open Support Ticket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createClientTicketAction} className="space-y-3.5">
              <div className="space-y-1">
                <Label className="text-xs">Subject *</Label>
                <Input
                  name="subject"
                  required
                  placeholder="Need re-verification of patched API endpoint"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <select
                    name="priority"
                    defaultValue="medium"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="low">Low (48h SLA)</option>
                    <option value="medium">Medium (24h SLA)</option>
                    <option value="high">High (8h SLA)</option>
                    <option value="urgent">Urgent Incident (4h SLA)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <select
                    name="category"
                    defaultValue="general"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="general">General Support</option>
                    <option value="security_incident">Security Incident / VAPT</option>
                    <option value="server_outage">Server / Cloud Outage</option>
                    <option value="bug_report">Bug Report / Patch</option>
                    <option value="billing">Billing &amp; Invoices</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Related Order (Optional)</Label>
                <select
                  name="order_id"
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">General Account / Retainer</option>
                  {(orders ?? []).map((ord) => (
                    <option key={ord.id} value={ord.id}>
                      {ord.code} — {ord.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Issue Details *</Label>
                <Textarea
                  name="body"
                  rows={4}
                  required
                  placeholder="Describe the issue, logs, or reproduction steps..."
                  className="text-xs"
                />
              </div>

              <Button type="submit" className="w-full">
                Submit Support Ticket
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Right: Ticket List */}
        <div className="space-y-3 lg:col-span-7">
          {(tickets ?? []).map((tkt) => {
            const orderObj = Array.isArray(tkt.order) ? tkt.order[0] : tkt.order;
            return (
              <Card key={tkt.id} className="border-border/80 bg-card/85">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {tkt.code}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {tkt.status}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                        {tkt.priority}
                      </Badge>
                      {orderObj && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {orderObj.code}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/portal/tickets/${tkt.id}`}
                      className="block text-sm font-bold hover:text-primary"
                    >
                      {tkt.subject}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      Opened {new Date(tkt.created_at).toLocaleString()}
                    </div>
                  </div>

                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <Link href={`/portal/tickets/${tkt.id}`}>
                      Thread
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {(tickets ?? []).length === 0 && (
            <Card className="border-dashed border-border bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <LifeBuoy className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No support tickets yet</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Use the form on the left whenever you need direct technical assistance or SLA support.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
