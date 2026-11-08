import Link from 'next/link';
import { ArrowRight, UserPlus, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { inviteOrProvisionClientAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const admin = getSupabaseAdmin();
  const [{ data: profiles }, { data: clientProfiles }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, is_active, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
    admin.from('client_profiles').select('*'),
  ]);

  const crmMap = new Map((clientProfiles ?? []).map((cp) => [cp.user_id, cp]));

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <Users className="h-3.5 w-3.5" />
          LONG-TERM CLIENT RETENTION CRM
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Clients 360° Directory</h1>
        <p className="text-sm text-muted-foreground">
          Manage long-term client relationships, track lifetime value (LTV), schedule follow-ups, and invite new clients to the Portal.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-12">
        {/* Invite Client Card */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Invite Client to Portal</CardTitle>
            <CardDescription>
              Sends a magic invitation link and initializes their 360° CRM profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={inviteOrProvisionClientAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Client Email *</Label>
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="founder@company.com"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  name="full_name"
                  required
                  placeholder="Sarah Jenkins"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Company / Organization</Label>
                <Input name="company" placeholder="Acme Security Inc." className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Relationship Tier</Label>
                <select
                  name="tier"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="standard">standard</option>
                  <option value="vip">vip</option>
                  <option value="retainer">retainer</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>
              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <UserPlus className="h-4 w-4" />
                Send Portal Invitation
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Client Roster */}
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Client Roster</CardTitle>
            <CardDescription>Click any client to inspect LTV, notes, orders, and follow-up schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            {profiles && profiles.length > 0 ? (
              <div className="divide-y divide-border/70">
                {profiles.map((client) => {
                  const crm = crmMap.get(client.id);
                  return (
                    <div
                      key={client.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="text-base font-bold hover:text-primary"
                          >
                            {client.full_name || client.email}
                          </Link>
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            {crm?.tier ?? 'standard'}
                          </Badge>
                          {client.is_active === false && (
                            <Badge variant="destructive" className="font-mono text-[10px]">
                              DEACTIVATED
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {client.email}{' '}
                          {crm?.company_name ? `· ${crm.company_name}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right font-mono text-xs">
                          <div className="font-bold">
                            LTV: {formatMoney(crm?.lifetime_value_usd_cents ?? 0, 'USD')}
                          </div>
                          <div className="text-muted-foreground">
                            {crm?.completed_orders_count ?? 0} completed orders
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm" className="gap-1 rounded-full text-xs">
                          <Link href={`/admin/clients/${client.id}`}>
                            360° CRM <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No client accounts yet. Invite a client on the left or convert an inquiry.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
