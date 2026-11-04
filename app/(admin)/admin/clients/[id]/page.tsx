import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Calendar, Save, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { updateClientCrmAndNoteAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [
    { data: profile },
    { data: crm },
    { data: notes },
    { data: orders },
    { data: invoices },
  ] = await Promise.all([
    admin.from('profiles').select('*').eq('id', id).maybeSingle(),
    admin.from('client_profiles').select('*').eq('user_id', id).maybeSingle(),
    admin
      .from('client_notes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('orders')
      .select('id, code, title, status, total_cents, currency, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('invoices')
      .select('id, code, status, total_cents, amount_paid_cents, currency, issued_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!profile) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clients Directory
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {profile.full_name || profile.email}
          </h1>
          <Badge variant="outline" className="font-mono text-xs uppercase text-primary">
            {crm?.tier ?? 'standard'}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {profile.email} · Lifetime Value:{' '}
          <strong className="text-foreground">
            {formatMoney(crm?.lifetime_value_usd_cents ?? 0, 'USD')}
          </strong>{' '}
          · Completed Orders: {crm?.completed_orders_count ?? 0}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Relationship Tier, Follow-Up & Private Note Form */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Relationship &amp; Retention Settings
            </CardTitle>
            <CardDescription className="text-xs">
              Private CRM settings and internal notes (never visible to the client).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateClientCrmAndNoteAction} className="space-y-4">
              <input type="hidden" name="client_id" value={profile.id} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Tier</Label>
                  <select
                    name="tier"
                    defaultValue={crm?.tier ?? 'standard'}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="standard">standard</option>
                    <option value="vip">vip</option>
                    <option value="retainer">retainer</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Company Name</Label>
                  <Input
                    name="company_name"
                    defaultValue={crm?.company_name ?? ''}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Next Follow-Up Date
                </Label>
                <Input
                  name="next_followup_at"
                  type="date"
                  defaultValue={
                    crm?.next_followup_at ? crm.next_followup_at.slice(0, 10) : ''
                  }
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Executive Relationship Summary</Label>
                <Textarea
                  name="relationship_summary"
                  rows={2}
                  defaultValue={crm?.relationship_summary ?? ''}
                  placeholder="Key preferences, tech stack, renewal window..."
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Add Private CRM Note</Label>
                <Textarea
                  name="note_body"
                  rows={3}
                  placeholder="Log a call summary, upsell opportunity, or security advisory note..."
                  className="text-xs"
                />
              </div>

              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Save className="h-4 w-4" />
                Save CRM Profile &amp; Note
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Client History: Notes, Orders, Invoices */}
        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Private Relationship Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes && notes.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {notes.map((n) => (
                    <div key={n.id} className="py-3 text-xs">
                      <div className="mb-1 font-mono text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                      <p className="whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  No private notes recorded yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Client Orders ({orders?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {orders && orders.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-2 py-3 text-xs"
                    >
                      <div>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono font-bold text-primary hover:underline"
                        >
                          {o.code}
                        </Link>
                        <span className="ml-2 font-medium">{o.title}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <Badge variant="outline" className="text-[10px]">
                          {o.status}
                        </Badge>
                        <span>{formatMoney(o.total_cents, o.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">No orders for this client yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Client Invoices ({invoices?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices && invoices.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 py-3 text-xs"
                    >
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="font-mono font-bold text-primary hover:underline"
                      >
                        {inv.code}
                      </Link>
                      <div className="flex items-center gap-2 font-mono">
                        <Badge variant="outline" className="text-[10px]">
                          {inv.status}
                        </Badge>
                        <span>{formatMoney(inv.total_cents, inv.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">No invoices issued yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
