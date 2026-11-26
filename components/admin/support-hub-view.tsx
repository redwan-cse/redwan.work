import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { toggleReviewPublicApprovalAction } from '@/lib/crm/actions';

export async function SupportHubView({
  activeTab,
  statusFilter = '',
  priorityFilter = '',
  basePath = '/admin/support',
  pageParam,
}: {
  activeTab: 'tickets' | 'reviews';
  statusFilter?: string;
  priorityFilter?: string;
  basePath?: string;
  pageParam?: string;
}) {
  const admin = getSupabaseAdmin();
  let ticketsQuery = admin
    .from('tickets')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(250);
  if (statusFilter) {
    ticketsQuery = ticketsQuery.eq('status', statusFilter);
  }
  if (priorityFilter) {
    ticketsQuery = ticketsQuery.eq('priority', priorityFilter);
  }

  const [{ data: tickets }, { count: openTicketExactCount }, { data: reviews, count: totalReviewsCount }] =
    await Promise.all([
      ticketsQuery,
      admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']),
      admin
        .from('client_reviews')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false }),
    ]);

  const filteredTickets = tickets ?? [];
  const pagedTickets = paginateItems(filteredTickets, pageParam);

  const openTicketCount = openTicketExactCount ?? 0;

  const tabs = [
    {
      id: 'tickets',
      label: 'Support Helpdesk (TKT)',
      href: basePath === '/admin/tickets' ? '/admin/tickets' : '/admin/support?tab=tickets',
      count: openTicketCount,
    },
    {
      id: 'reviews',
      label: 'Verified Client Reviews',
      href: basePath === '/admin/reviews' ? '/admin/reviews' : '/admin/support?tab=reviews',
      count: totalReviewsCount ?? reviews?.length ?? 0,
    },
  ];

  const nowMs = new Date().getTime();

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="SUPPORT HELPDESK, SLA & REPUTATION"
        title="Support Tickets & Verified Client Reviews"
        description="Respond to technical support queues with attachment support, monitor SLA response age, and curate public client testimonials."
        tabs={tabs}
        activeTab={activeTab}
      />

      {activeTab === 'tickets' ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Tickets Queue ({filteredTickets.length})</CardTitle>
              <CardDescription className="text-xs">
                Items open &gt; 24 hours are highlighted with an SLA warning.
              </CardDescription>
            </div>
            <form method="get" className="flex flex-wrap items-center gap-2">
              {basePath !== '/admin/tickets' && <input type="hidden" name="tab" value="tickets" />}
              <select
                name="status"
                aria-label="Filter tickets by status"
                defaultValue={statusFilter}
                className="h-9 rounded-md border border-input bg-background px-2 text-base font-sans transition-colors hover:border-muted-foreground/45"
              >
                <option value="">All Statuses</option>
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="awaiting_client">awaiting_client</option>
                <option value="answered">answered</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
              </select>
              <select
                name="priority"
                aria-label="Filter tickets by priority"
                defaultValue={priorityFilter}
                className="h-9 rounded-md border border-input bg-background px-2 text-base font-sans transition-colors hover:border-muted-foreground/45"
              >
                <option value="">All Priorities</option>
                <option value="urgent">urgent</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                Filter
              </Button>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            {filteredTickets.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code / Subject</TableHead>
                    <TableHead className="text-xs">Category / Priority</TableHead>
                    <TableHead className="text-xs">Status &amp; SLA</TableHead>
                    <TableHead className="text-right text-xs">Activity</TableHead>
                    <TableHead className="text-right text-xs">Thread</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTickets.items.map((tkt) => {
                    const ageHours = (nowMs - new Date(tkt.last_message_at).getTime()) / 3600000;
                    const slaBreached =
                      (tkt.status === 'open' || tkt.status === 'in_progress') && ageHours >= 24;
                    return (
                      <TableRow key={tkt.id}>
                        <TableCell>
                          <Link
                            href={`/admin/tickets/${tkt.id}`}
                            className="font-mono text-xs font-bold text-primary hover:underline"
                          >
                            {tkt.code}
                          </Link>
                          <Link
                            href={`/admin/tickets/${tkt.id}`}
                            className="block font-medium hover:text-primary"
                          >
                            {tkt.subject}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {tkt.category}
                            </Badge>
                            <Badge
                              variant={
                                tkt.priority === 'urgent' || tkt.priority === 'high'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                              className="font-mono text-[10px] uppercase"
                            >
                              {tkt.priority}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {tkt.status}
                            </Badge>
                            {slaBreached && (
                              <Badge variant="destructive" className="font-mono text-[9px]">
                                SLA &gt; 24h
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(tkt.last_message_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <Link href={`/admin/tickets/${tkt.id}`}>
                              Open <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No support tickets match the selected filter.
              </p>
            )}
            <AdminPagination
              basePath={basePath}
              page={pagedTickets.page}
              totalPages={pagedTickets.totalPages}
              totalItems={pagedTickets.totalItems}
              startIndex={pagedTickets.startIndex}
              endIndex={pagedTickets.endIndex}
              query={{
                tab: basePath !== '/admin/tickets' ? 'tickets' : undefined,
                status: statusFilter || undefined,
                priority: priorityFilter || undefined,
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Submitted Client Reviews ({reviews?.length ?? 0})</CardTitle>
            <CardDescription className="text-xs">
              Approve verified 1–5 star engagement reviews for public website showcase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviews && reviews.length > 0 ? (
              <div className="divide-y divide-border/70">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                  >
                    <div className="max-w-2xl space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {'★'.repeat(rev.rating_overall)} ({rev.rating_overall}/5)
                        </span>
                        <Badge
                          variant={rev.is_public_approved ? 'default' : 'outline'}
                          className="font-mono text-[10px]"
                        >
                          {rev.is_public_approved ? 'Public' : 'Private'}
                        </Badge>
                      </div>
                      {rev.headline && <div className="text-sm font-bold">{rev.headline}</div>}
                      <p className="text-xs text-muted-foreground">{rev.review_text}</p>
                    </div>

                    <ConfirmActionButton
                      action={toggleReviewPublicApprovalAction}
                      hiddenFields={{
                        review_id: rev.id,
                        is_public_approved: rev.is_public_approved ? 'false' : 'true',
                      }}
                      triggerLabel={rev.is_public_approved ? 'Hide from Public' : 'Approve for Public'}
                      confirmTitle={
                        rev.is_public_approved
                          ? 'Unpublish testimonial?'
                          : 'Approve review for public display?'
                      }
                      confirmDescription="Updates public homepage and service page testimonial visibility immediately."
                      successMessage={
                        rev.is_public_approved ? 'Review hidden from public site.' : 'Review published.'
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No client reviews submitted yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
