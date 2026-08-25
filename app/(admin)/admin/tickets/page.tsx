import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { isTicketStatus, listTickets } from '@/lib/crm/tickets';

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

const TABS: Array<{ label: string; value?: string }> = [
  { label: 'All' },
  { label: 'Open', value: 'open' },
  { label: 'Answered', value: 'answered' },
  { label: 'Awaiting client', value: 'awaiting_client' },
  { label: 'Closed', value: 'closed' },
];

function ticketHref(status?: string, page?: number) {
  const search = new URLSearchParams();
  if (status) search.set('status', status);
  if (page && page > 1) search.set('page', String(page));
  const qs = search.toString();
  return qs ? `/admin/tickets?${qs}` : '/admin/tickets';
}

function utcStamp(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = isTicketStatus(params.status) ? params.status : undefined;
  const rawPage = Number.parseInt(params.page ?? '', 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const { items, total, pageCount } = await listTickets({ status, page });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tickets</h1>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {TABS.map((tab) => {
          const active = tab.value === status;
          return (
            <Link
              key={tab.label}
              href={ticketHref(tab.value, page)}
              className={
                active
                  ? 'rounded-full border bg-accent px-3 py-1 text-sm font-medium'
                  : 'rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-accent'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets{status ? ` with status “${TICKET_STATUS_LABELS[status]}”` : ''}.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ticket) => (
                <tr key={ticket.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">#TKT-{ticket.number}</td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/tickets/${ticket.id}`} className="hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {ticket.client_name ?? '—'}
                    <span className="block text-xs text-muted-foreground">{ticket.client_email}</span>
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

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={ticketHref(status, page - 1)} className="hover:underline">
              ← Prev
            </Link>
          ) : (
            <span aria-disabled="true" className="text-muted-foreground/60">← Prev</span>
          )}
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} ticket{total === 1 ? '' : 's'}
          </span>
          {page < pageCount ? (
            <Link href={ticketHref(status, page + 1)} className="hover:underline">
              Next →
            </Link>
          ) : (
            <span aria-disabled="true" className="text-muted-foreground/60">Next →</span>
          )}
        </div>
      )}
    </div>
  );
}
