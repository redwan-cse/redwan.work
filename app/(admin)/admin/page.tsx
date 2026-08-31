import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConvertLeadButton } from '@/components/admin/convert-lead-button';
import { countOpenTickets } from '@/lib/crm/tickets';
import { listRecentLeads } from '@/lib/crm/leads';
import { listClients } from '@/lib/crm/clients';
import { listArchivedProjects } from '@/lib/crm/projects';

export const dynamic = 'force-dynamic';

const LEAD_BADGE: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  contacted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  won: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  lost: 'bg-muted text-muted-foreground',
};

export default async function AdminOverviewPage() {
  const [openTickets, leads, clients, archived] = await Promise.all([
    countOpenTickets(),
    listRecentLeads(5),
    listClients(),
    listArchivedProjects(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      {archived.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {archived.length} archived project(s) awaiting deletion —{' '}
          <Link href="/admin/projects" className="underline underline-offset-4">
            download backups from Projects
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Open tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{openTickets}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting your reply</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Invoicing arrives in P4b</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{clients.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{clients.filter((c) => c.is_active).length} active</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent leads</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Ref</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const converted = lead.converted_client_id !== null;
                  return (
                    <tr key={lead.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">TKT-{lead.number}</td>
                      <td className="px-4 py-2">{lead.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{lead.company ?? '—'}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={LEAD_BADGE[lead.status] ?? ''}>
                          {lead.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!converted && lead.status !== 'won' ? (
                          <ConvertLeadButton leadId={lead.id} label={lead.email} />
                        ) : converted ? (
                          <span className="text-xs text-muted-foreground">Converted</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
