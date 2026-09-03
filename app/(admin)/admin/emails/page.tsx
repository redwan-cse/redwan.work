import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  EMAIL_STATUSES,
  EMAIL_TEMPLATES,
  emailFilterValue,
  isStatusFilter,
  isTemplateFilter,
  listEmailLogs,
  pageNumber,
  type EmailDelivery,
} from '@/lib/crm/email-log';

export const dynamic = 'force-dynamic';

const TEMPLATE_LABELS: Record<(typeof EMAIL_TEMPLATES)[number], string> = {
  invite: 'Invite',
  'new-ticket': 'New ticket',
  'reply-posted': 'Reply posted',
  'status-changed': 'Status changed',
  'deliverable-uploaded': 'Deliverable uploaded',
  'invoice-issued': 'Invoice issued',
  'payment-confirmed': 'Payment confirmed',
};

const ENTITY_LABELS: Record<'client' | 'ticket' | 'invoice' | 'deliverable', string> = {
  client: 'Client',
  ticket: 'Ticket',
  invoice: 'Invoice',
  deliverable: 'Deliverable',
};

// Delivery is derived, not stored — `error` is polymorphic (see lib/crm/email-log.ts).
const DELIVERY_LABELS: Record<EmailDelivery, string> = {
  confirmed: 'Sent',
  handoff: 'Handed off',
  unconfirmed: 'Unconfirmed',
  failed: 'Failed',
};

const DELIVERY_BADGE: Record<EmailDelivery, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  handoff: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  unconfirmed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
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
  // Params arrive as `string | string[] | undefined`; a duplicated param must be
  // ignored, not crash the page. The module's guards do the narrowing.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = pageNumber(params.page);

  const { rows, total, pageCount, counts, applied } = await listEmailLogs(page, {
    template: params.template,
    status: params.status,
    email: params.email,
  });

  // Echo back only what the module actually applied, so a bogus or duplicated
  // query param cannot survive into the pagination links.
  const activeTemplate = applied.template;
  const activeStatus = applied.status;
  const activeEmail = applied.email;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="text-sm text-muted-foreground">
          {counts.sent} sent · {counts.failed} failed
          {activeTemplate || activeEmail ? ' (filtered)' : ''}
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
          aria-current={!activeStatus ? 'page' : undefined}
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
            aria-current={activeStatus === status ? 'page' : undefined}
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
          aria-current={!activeTemplate ? 'page' : undefined}
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
            aria-current={activeTemplate === template ? 'page' : undefined}
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
        <p className="text-sm text-muted-foreground">{activeTemplate || activeStatus || activeEmail ? 'No emails match these filters.' : 'No emails sent yet.'}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Sent at (UTC)</th>
                <th scope="col" className="px-4 py-2 font-medium">Recipient</th>
                <th scope="col" className="px-4 py-2 font-medium">Template</th>
                <th scope="col" className="px-4 py-2 font-medium">Entity</th>
                <th scope="col" className="px-4 py-2 font-medium">Delivery</th>
                <th scope="col" className="px-4 py-2 font-medium">Detail</th>
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
                      {row.delivery === 'failed' || row.delivery === 'unconfirmed' ? (
                        (row.error ?? '—')
                      ) : row.delivery === 'handoff' ? (
                        'No provider id — sent by Supabase Auth'
                      ) : row.resend_id ? (
                        <span className="font-mono">{row.resend_id}</span>
                      ) : (
                        'No provider id returned'
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
