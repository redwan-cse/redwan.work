import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  countFailedEmails,
  EMAIL_STATUSES,
  EMAIL_TEMPLATES,
  listEmailLogs,
  type EmailDelivery,
} from '@/lib/crm/email-log';

export const dynamic = 'force-dynamic';

const TEMPLATE_LABELS: Record<string, string> = {
  invite: 'Invite',
  'new-ticket': 'New ticket',
  'reply-posted': 'Reply posted',
  'status-changed': 'Status changed',
  'deliverable-uploaded': 'Deliverable uploaded',
  'invoice-issued': 'Invoice issued',
  'payment-confirmed': 'Payment confirmed',
};

const ENTITY_LABELS: Record<string, string> = {
  client: 'Client',
  ticket: 'Ticket',
  invoice: 'Invoice',
  deliverable: 'Deliverable',
};

// Delivery is derived, not stored — `error` is polymorphic (see lib/crm/email-log.ts).
const DELIVERY_LABELS: Record<EmailDelivery, string> = {
  confirmed: 'Sent',
  handoff: 'Handed off',
  failed: 'Failed',
};

const DELIVERY_BADGE: Record<EmailDelivery, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  handoff: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

function logHref(params: { template?: string; status?: string; email?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.template) search.set('template', params.template);
  if (params.status) search.set('status', params.status);
  if (params.email) search.set('email', params.email);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/admin/emails?${qs}` : '/admin/emails';
}

function utcStamp(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** Entity link, so an operator can jump from a log row to what it describes. */
function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === 'ticket') return `/admin/tickets/${id}`;
  if (type === 'invoice') return `/admin/invoices/${id}`;
  return null;
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; status?: string; email?: string; page?: string }>;
}) {
  const params = await searchParams;
  const rawPage = Number.parseInt(params.page ?? '', 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const [{ rows, total, pageCount, counts }, failedTotal] = await Promise.all([
    listEmailLogs(page, {
      template: params.template,
      status: params.status,
      email: params.email,
    }),
    countFailedEmails(),
  ]);

  // Echo back only values the module accepted, so a bogus query param does not
  // survive into the pagination links.
  const activeTemplate = EMAIL_TEMPLATES.includes(params.template as never)
    ? params.template
    : undefined;
  const activeStatus = EMAIL_STATUSES.includes(params.status as never) ? params.status : undefined;
  const activeEmail = params.email?.trim() || undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="text-sm text-muted-foreground">
          {counts.sent} sent · {failedTotal} failed
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Every lifecycle send is recorded here. <strong>Handed off</strong> means an upstream
        provider accepted the request without returning a delivery id — Supabase Auth mails
        invitations itself, so those rows never carry one.
      </p>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        <Link
          href={logHref({ template: activeTemplate, email: activeEmail })}
          className={
            !activeStatus
              ? 'rounded-full border bg-accent px-3 py-1 text-sm font-medium'
              : 'rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-accent'
          }
        >
          All
        </Link>
        {EMAIL_STATUSES.map((status) => (
          <Link
            key={status}
            href={logHref({ template: activeTemplate, status, email: activeEmail })}
            className={
              activeStatus === status
                ? 'rounded-full border bg-accent px-3 py-1 text-sm font-medium'
                : 'rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-accent'
            }
          >
            {status === 'sent' ? 'Sent' : 'Failed'}
          </Link>
        ))}
      </nav>

      <nav className="flex flex-wrap gap-2" aria-label="Filter by template">
        <Link
          href={logHref({ status: activeStatus, email: activeEmail })}
          className={
            !activeTemplate
              ? 'rounded-full border bg-accent px-3 py-1 text-xs font-medium'
              : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent'
          }
        >
          All templates
        </Link>
        {EMAIL_TEMPLATES.map((template) => (
          <Link
            key={template}
            href={logHref({ template, status: activeStatus, email: activeEmail })}
            className={
              activeTemplate === template
                ? 'rounded-full border bg-accent px-3 py-1 text-xs font-medium'
                : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent'
            }
          >
            {TEMPLATE_LABELS[template]}
          </Link>
        ))}
      </nav>

      <form method="GET" action="/admin/emails" className="flex flex-wrap items-center gap-2">
        {activeTemplate && <input type="hidden" name="template" value={activeTemplate} />}
        {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
        <label htmlFor="email-filter" className="text-sm text-muted-foreground">
          Recipient
        </label>
        <input
          id="email-filter"
          name="email"
          type="search"
          defaultValue={activeEmail ?? ''}
          placeholder="name@example.com"
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          Filter
        </button>
        {activeEmail && (
          <Link
            href={logHref({ template: activeTemplate, status: activeStatus })}
            className="text-sm text-muted-foreground hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No emails match these filters.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Sent at (UTC)</th>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Delivery</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const href = entityHref(row.entity_type, row.entity_id);
                return (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                      {utcStamp(row.created_at)}
                    </td>
                    <td className="px-4 py-2 break-all">{row.to_email}</td>
                    <td className="px-4 py-2">{TEMPLATE_LABELS[row.template] ?? row.template}</td>
                    <td className="px-4 py-2">
                      {row.entity_type ? (
                        href ? (
                          <Link href={href} className="hover:underline">
                            {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                          </Link>
                        ) : (
                          (ENTITY_LABELS[row.entity_type] ?? row.entity_type)
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={DELIVERY_BADGE[row.delivery]}>
                        {DELIVERY_LABELS[row.delivery]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {row.delivery === 'failed' ? (
                        (row.error ?? '—')
                      ) : row.delivery === 'handoff' ? (
                        'No provider id — sent by Supabase Auth'
                      ) : row.resend_id ? (
                        <span className="font-mono">{row.resend_id}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={logHref({
                template: activeTemplate,
                status: activeStatus,
                email: activeEmail,
                page: page - 1,
              })}
              className="hover:underline"
            >
              ← Prev
            </Link>
          ) : (
            <span aria-disabled="true" className="text-muted-foreground/60">
              ← Prev
            </span>
          )}
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} email{total === 1 ? '' : 's'}
          </span>
          {page < pageCount ? (
            <Link
              href={logHref({
                template: activeTemplate,
                status: activeStatus,
                email: activeEmail,
                page: page + 1,
              })}
              className="hover:underline"
            >
              Next →
            </Link>
          ) : (
            <span aria-disabled="true" className="text-muted-foreground/60">
              Next →
            </span>
          )}
        </div>
      )}
    </div>
  );
}
