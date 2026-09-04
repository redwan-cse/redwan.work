import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ReplyForm } from '@/components/admin/reply-form';
import { StatusControl } from '@/components/admin/status-control';
import { getTicketThread } from '@/lib/crm/tickets';
import { listTicketAttachmentRows } from '@/lib/crm/files';
import { formatBytes } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Inline badge/label maps (RSC-safe; identical copy in the inbox page).
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

export default async function AdminTicketThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getTicketThread(id);
  // crmError's CrmResult annotation adds a bare { ok: true } arm to the union,
  // so presence of the thread payload must be narrowed too.
  if (!result.ok || !('ticket' in result)) notFound();
  const { ticket, messages } = result;
  const attachments = await listTicketAttachmentRows(ticket.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/tickets" className="text-sm text-muted-foreground hover:underline">
          ← All tickets
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">#TKT-{ticket.number}</p>
          <h1 className="text-xl font-semibold">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.client_name ?? 'Client'} · {ticket.client_email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={TICKET_BADGE[ticket.status]}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </Badge>
          <StatusControl ticketId={ticket.id} status={ticket.status} />
        </div>
      </header>

      <section aria-label="Conversation" className="space-y-3">
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-xs">
              <span className="font-medium">
                {message.author_name ?? (message.author_role === 'admin' ? 'Admin' : 'Client')}
              </span>
              <time dateTime={message.created_at} className="text-muted-foreground">
                {utcStamp(message.created_at)} UTC
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </article>
        ))}
      </section>

      {attachments.length > 0 && (
        <section aria-label="Attachments" className="space-y-2">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <ul className="space-y-2">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {file.filename}{' '}
                  <span className="text-muted-foreground">({formatBytes(file.size_bytes)})</span>
                </span>
                <a
                  href={`/api/files/${file.id}/download`}
                  className="ml-3 inline-flex h-7 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReplyForm ticketId={ticket.id} />
    </div>
  );
}
