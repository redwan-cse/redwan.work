import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentSession } from '@/lib/auth/session';
import { countOwnOpenTickets, listOwnTickets } from '@/lib/crm/tickets';
import { countOwnActiveProjects, listOwnProjects } from '@/lib/crm/projects';
import { countOwnOutstandingInvoices } from '@/lib/crm/invoices';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  answered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  awaiting_client: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
};

const PROJECT_BADGE: Record<string, string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

export default async function PortalDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');

  const [openTickets, recent, activeProjects, ownProjects, outstandingInvoices] = await Promise.all([
    countOwnOpenTickets(session.userId),
    listOwnTickets(session.userId, 4),
    countOwnActiveProjects(session.userId),
    listOwnProjects(session.userId),
    countOwnOutstandingInvoices(session.userId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Open tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{openTickets}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting a reply from support</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Active projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{activeProjects}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeProjects === 1 ? '1 active project' : `${activeProjects} active`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{outstandingInvoices || '—'}</p>
            <Link href="/portal/invoices" className="mt-1 block text-xs text-muted-foreground hover:underline">
              {outstandingInvoices === 0 ? 'No outstanding invoices' : outstandingInvoices === 1 ? 'View invoice' : 'View invoices'}
            </Link>
          </CardContent>
        </Card>
      </div>

      {activeProjects > 0 && ownProjects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Projects</h2>
            <Link href="/portal/files" className="text-sm underline-offset-4 hover:underline">
              View files
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {ownProjects.map((p) => (
                  <tr key={p.id} className="border-t first:border-t-0">
                    <td className="px-4 py-2">
                      <Link href="/portal/files" className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="outline" className={PROJECT_BADGE[p.status] ?? ''}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent tickets</h2>
          <Link href="/portal/tickets" className="text-sm underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tickets yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">TKT-{t.number}</td>
                    <td className="px-4 py-2">
                      <Link href={`/portal/tickets/${t.id}`} className="underline-offset-4 hover:underline">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[t.status] ?? ''}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
