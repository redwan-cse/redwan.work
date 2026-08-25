import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { NewTicketButton } from '@/components/portal/new-ticket-button';
import { getCurrentSession } from '@/lib/auth/session';
import { listOwnTickets } from '@/lib/crm/tickets';

export const dynamic = 'force-dynamic';

// Inline badge/label maps (RSC-safe; identical copy in the thread page).
const TICKET_STATUS_LABELS = {
  open: 'Open',
  answered: 'Answered',
  awaiting_client: 'Awaiting client',
  closed: 'Closed',
} as const;

const TICKET_BADGE: Record<keyof typeof TICKET_STATUS_LABELS, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  answered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  awaiting_client: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
};

function utcStamp(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

export default async function PortalTicketsPage() {
  const session = await getCurrentSession();
  // The portal layout guarantees a client session; redirect defensively anyway.
  if (!session) redirect('/login');

  const items = await listOwnTickets(session.userId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <NewTicketButton />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets yet — create your first one.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ticket) => (
                <tr key={ticket.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">#TKT-{ticket.number}</td>
                  <td className="px-4 py-2">
                    <Link href={`/portal/tickets/${ticket.id}`} className="hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={TICKET_BADGE[ticket.status]}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{utcStamp(ticket.last_message_at)} UTC</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
