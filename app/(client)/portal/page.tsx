import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentSession } from '@/lib/auth/session';
import { countOwnOpenTickets, listOwnTickets } from '@/lib/crm/tickets';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  answered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  awaiting_client: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
};

export default async function PortalDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal');

  const [openTickets, recent] = await Promise.all([
    countOwnOpenTickets(session.userId),
    listOwnTickets(session.userId, 4),
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
            <p className="text-3xl font-semibold">0</p>
            <p className="mt-1 text-xs text-muted-foreground">Projects arrive in P4a</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Invoicing arrives in P4b</p>
          </CardContent>
        </Card>
      </div>

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
