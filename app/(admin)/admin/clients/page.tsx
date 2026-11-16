import Link from 'next/link';
import { ArrowRight, Search, UserPlus } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSession } from '@/lib/auth/session';
import { inviteOrProvisionClientAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const qFilter = (params.q ?? '').trim().toLowerCase();
  const tierFilter = (params.tier ?? '').trim();

  const admin = getSupabaseAdmin();
  const [{ data: profiles }, { data: clientProfiles }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, company, is_active, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
    admin.from('client_profiles').select('*'),
  ]);

  const crmMap = new Map((clientProfiles ?? []).map((cp) => [cp.user_id, cp]));

  const filteredClients = (profiles ?? []).filter((client) => {
    const crm = crmMap.get(client.id);
    const tier = crm?.tier ?? 'standard';
    if (tierFilter && tier !== tierFilter) return false;
    if (qFilter) {
      const hay = `${client.full_name ?? ''} ${client.email} ${crm?.company_name ?? client.company ?? ''}`.toLowerCase();
      if (!hay.includes(qFilter)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="LONG-TERM CLIENT RETENTION CRM"
        title="Clients 360° Directory"
        description="Invite portal accounts, segment VIP and Retainer clients, track USD Lifetime Value, and open complete 6-tab 360° client records."
      />

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Invite Client Card */}
        <Card className="xl:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite Client to Portal</CardTitle>
            <CardDescription className="text-xs">
              Sends a magic invitation link and initializes their 360° CRM profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionFeedbackForm
              action={inviteOrProvisionClientAction}
              successMessage="Invitation issued and CRM profile initialized."
              resetOnSuccess
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label className="text-xs">Client Email *</Label>
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="founder@company.com"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  name="full_name"
                  required
                  placeholder="Sarah Jenkins"
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Company / Org</Label>
                  <Input name="company" placeholder="Acme Security Inc." className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Relationship Tier</Label>
                  <select
                    name="tier"
                    className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="standard">standard</option>
                    <option value="vip">vip</option>
                    <option value="retainer">retainer</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <UserPlus className="h-4 w-4" />
                Send Portal Invitation
              </Button>
            </ActionFeedbackForm>
          </CardContent>
        </Card>

        {/* Compact Client Table Roster */}
        <Card className="xl:col-span-8">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Client Roster ({filteredClients.length})</CardTitle>
              <CardDescription className="text-xs">
                Filter by name, organization, or retention tier.
              </CardDescription>
            </div>
            <form method="get" className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={params.q ?? ''}
                  placeholder="Search clients..."
                  className="h-8 w-44 pl-8 text-xs"
                />
              </div>
              <select
                name="tier"
                defaultValue={tierFilter}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">All Tiers</option>
                <option value="standard">standard</option>
                <option value="vip">vip</option>
                <option value="retainer">retainer</option>
                <option value="enterprise">enterprise</option>
              </select>
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                Filter
              </Button>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            {filteredClients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Client &amp; Email</TableHead>
                    <TableHead className="text-xs">Tier / Status</TableHead>
                    <TableHead className="text-right text-xs">USD LTV</TableHead>
                    <TableHead className="text-right text-xs">Orders</TableHead>
                    <TableHead className="text-right text-xs">CRM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => {
                    const crm = crmMap.get(client.id);
                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="font-semibold hover:text-primary"
                          >
                            {client.full_name || client.email}
                          </Link>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {client.email}
                            {crm?.company_name ? ` · ${crm.company_name}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                              {crm?.tier ?? 'standard'}
                            </Badge>
                            {client.is_active === false && (
                              <Badge variant="destructive" className="font-mono text-[10px]">
                                INACTIVE
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold">
                          {formatMoney(crm?.lifetime_value_usd_cents ?? 0, 'USD')}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {crm?.completed_orders_count ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <Link href={`/admin/clients/${client.id}`}>
                              360° <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No clients match the current filter.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
