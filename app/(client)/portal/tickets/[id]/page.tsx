import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ReplyForm } from '@/components/portal/reply-form';
import { getCurrentSession } from '@/lib/auth/session';
import { getOwnTicketThread } from '@/lib/crm/tickets';

export const dynamic = 'force-dynamic';

// Inline badge/label maps (RSC-safe; identical copy in the list page).
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

export default async function PortalTicketThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  // The portal layout guarantees a client session; redirect defensively anyway.
  if (!session) redirect('/login');

  const result = await getOwnTicketThread(session.userId, id);
  // crmError's CrmResult annotation adds a bare { ok: true } arm to the union,
  // so presence of the thread payload must be narrowed too.
  if (!result.ok || !('ticket' in result)) notFound();
  const { ticket, messages } = result;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/tickets" className="text-sm text-muted-foreground hover:underline">
          ← All tickets
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">#TKT-{ticket.number}</p>
          <h1 className="text-xl font-semibold">{ticket.subject}</h1>
        </div>
        <Badge variant="outline" className={TICKET_BADGE[ticket.status]}>
          {TICKET_STATUS_LABELS[ticket.status]}
        </Badge>
      </header>

      <section aria-label="Conversation" className="space-y-3">
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-xs">
              <span className="font-medium">
                {message.author_role === 'client' ? 'You' : (message.author_name ?? 'Support')}
              </span>
              <time dateTime={message.created_at} className="text-muted-foreground">
                {utcStamp(message.created_at)} UTC
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </article>
        ))}
      </section>

      {ticket.status === 'closed' && (
        <p className="text-sm text-muted-foreground">
          This ticket is closed — replying will reopen it.
        </p>
      )}

      <ReplyForm ticketId={ticket.id} />
    </div>
  );
}
