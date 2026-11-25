import Link from 'next/link';
import { ArrowRight, Search, UserPlus } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
import { CsvExportButton } from '@/components/admin/csv-export-button';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
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
import {
  inviteOrProvisionClientAction,
  revokeClientInvitationAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; sort?: string; followup?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const qFilter = (params.q ?? '').trim().toLowerCase();
  const tierFilter = (params.tier ?? '').trim();
  const sortMode = (params.sort ?? '').trim();
  const followupFilter = (params.followup ?? '').trim();

  const admin = getSupabaseAdmin();
  const [{ data: profiles }, { data: clientProfiles }, { data: invitations }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, company, is_active, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
    admin.from('client_profiles').select('*'),
    admin
      .from('client_invitations')
      .select('id, email, full_name, company, tier, status, expires_at, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  const crmMap = new Map((clientProfiles ?? []).map((cp) => [cp.user_id, cp]));
  const nowIso = new Date().toISOString();

  const filteredClients = (profiles ?? [])
    .filter((client) => {
      const crm = crmMap.get(client.id);
      const tier = crm?.tier ?? 'standard';
      if (tierFilter && tier !== tierFilter) return false;
      if (followupFilter === 'due') {
        if (!crm?.next_followup_at || crm.next_followup_at > nowIso) return false;
      }
      if (qFilter) {
        const hay = `${client.full_name ?? ''} ${client.email} ${crm?.company_name ?? client.company ?? ''}`.toLowerCase();
        if (!hay.includes(qFilter)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'ltv_desc') {
        const ltvA = crmMap.get(a.id)?.lifetime_value_usd_cents ?? 0;
        const ltvB = crmMap.get(b.id)?.lifetime_value_usd_cents ?? 0;
        return ltvB - ltvA;
      }
      return 0;
    });

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="LONG-TERM CLIENT RETENTION CRM"
        title="Clients 360° Directory"
        description="Invite portal accounts, segment VIP and Retainer clients, track USD Lifetime Value, and open complete 6-tab 360° client records."
        actions={
          <CsvExportButton
            filename="clients-directory.csv"
            headers={['Full Name', 'Email', 'Company', 'Tier', 'Active', 'USD LTV', 'Completed Orders', 'Next Follow-Up']}
            rows={filteredClients.map((client) => {
              const crm = crmMap.get(client.id);
              return [
                client.full_name ?? '',
                client.email,
                crm?.company_name ?? client.company ?? '',
                crm?.tier ?? 'standard',
                client.is_active !== false ? 'Yes' : 'No',
                ((crm?.lifetime_value_usd_cents ?? 0) / 100).toFixed(2),
                crm?.completed_orders_count ?? 0,
                crm?.next_followup_at ? crm.next_followup_at.slice(0, 10) : '',
              ];
            })}
          />
        }
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
                <Label htmlFor="invite-client-email" className="text-xs">Client Email *</Label>
                <Input
                  id="invite-client-email"
                  name="email"
                  type="email"
                  required
                  placeholder="founder@company.com"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-client-name" className="text-xs">Full Name *</Label>
                <Input
                  id="invite-client-name"
                  name="full_name"
                  required
                  placeholder="Sarah Jenkins"
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="invite-client-company" className="text-xs">Company / Org</Label>
                  <Input id="invite-client-company" name="company" placeholder="Acme Security Inc." className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invite-client-tier" className="text-xs">Relationship Tier</Label>
                  <select
                    id="invite-client-tier"
                    name="tier"
                    aria-label="Client invite tier"
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
                <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Input
                  name="q"
                  aria-label="Search clients"
                  defaultValue={params.q ?? ''}
                  placeholder="Search clients..."
                  className="h-8 w-44 pl-8 text-xs"
                />
              </div>
              <select
                name="tier"
                aria-label="Filter clients by tier"
                defaultValue={tierFilter}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">All Tiers</option>
                <option value="standard">standard</option>
                <option value="vip">vip</option>
                <option value="retainer">retainer</option>
                <option value="enterprise">enterprise</option>
              </select>
              <select
                name="sort"
                aria-label="Sort clients"
                defaultValue={sortMode}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Newest First</option>
                <option value="ltv_desc">Highest LTV</option>
              </select>
              <select
                name="followup"
                aria-label="Filter by follow-up status"
                defaultValue={followupFilter}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">All Follow-Ups</option>
                <option value="due">Follow-Up Due</option>
              </select>
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                Filter
              </Button>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            {filteredClients.length > 0 ? (() => {
              const pagedClients = paginateItems(
                filteredClients,
                (params as Record<string, string | undefined>).page
              );
              return (
              <>
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
                  {pagedClients.items.map((client) => {
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
              <AdminPagination
                basePath="/admin/clients"
                page={pagedClients.page}
                totalPages={pagedClients.totalPages}
                totalItems={pagedClients.totalItems}
                startIndex={pagedClients.startIndex}
                endIndex={pagedClients.endIndex}
                query={{
                  tier: tierFilter || undefined,
                  q: params.q || undefined,
                }}
              />
              </>
              );
            })() : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No clients match the current filter.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portal Invitations Tracker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Portal Invitations Ledger ({invitations?.length ?? 0})
          </CardTitle>
          <CardDescription className="text-xs">
            Track pending, accepted, expired, and revoked client invitations — resend or revoke pending invites cleanly.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invitations && invitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Recipient</TableHead>
                  <TableHead className="text-xs">Tier / Status</TableHead>
                  <TableHead className="text-xs">Expires</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">
                      <div className="font-semibold">{inv.full_name || inv.email}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {inv.email}
                        {inv.company ? ` · ${inv.company}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                          {inv.tier}
                        </Badge>
                        <Badge
                          variant={
                            inv.status === 'accepted'
                              ? 'default'
                              : inv.status === 'revoked' || inv.status === 'expired'
                                ? 'destructive'
                                : 'outline'
                          }
                          className="font-mono text-[10px] uppercase"
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <ActionFeedbackForm
                            action={inviteOrProvisionClientAction}
                            successMessage="Invitation resent."
                          >
                            <input type="hidden" name="email" value={inv.email} />
                            <input type="hidden" name="full_name" value={inv.full_name ?? ''} />
                            <input type="hidden" name="company" value={inv.company ?? ''} />
                            <input type="hidden" name="tier" value={inv.tier} />
                            <Button type="submit" size="sm" variant="outline" className="h-7 text-[11px]">
                              Resend
                            </Button>
                          </ActionFeedbackForm>
                          <ConfirmActionButton
                            action={revokeClientInvitationAction}
                            hiddenFields={{ invitation_id: inv.id }}
                            triggerLabel="Revoke"
                            confirmTitle={`Revoke invite for ${inv.email}?`}
                            confirmDescription="Marks this pending invitation as revoked in the audit ledger."
                            confirmLabel="Revoke Invite"
                            destructive
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-destructive"
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No portal invitations recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
