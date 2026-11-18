import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Mail, Play, RotateCw } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { drainEmailOutboxAction, retryOutboxEmailAction } from '@/lib/admin/ops-actions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function EmailsConsoleView({
  activeTab,
  statusFilter = '',
  qFilter = '',
}: {
  activeTab: 'outbox' | 'logs';
  statusFilter?: string;
  qFilter?: string;
}) {
  const admin = getSupabaseAdmin();
  const [{ data: outboxRows }, { data: emailLogs }] = await Promise.all([
    admin.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(80),
    admin.from('email_log').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  const lowerQ = qFilter.trim().toLowerCase();
  const filteredOutbox = (outboxRows ?? []).filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (lowerQ && !`${row.to_email} ${row.subject} ${row.template}`.toLowerCase().includes(lowerQ)) {
      return false;
    }
    return true;
  });

  const filteredLogs = (emailLogs ?? []).filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (lowerQ && !`${row.to_email} ${row.subject} ${row.template}`.toLowerCase().includes(lowerQ)) {
      return false;
    }
    return true;
  });

  const pendingCount = (outboxRows ?? []).filter(
    (r) => r.status === 'pending' || r.status === 'processing'
  ).length;
  const failedCount = (outboxRows ?? []).filter(
    (r) => r.status === 'failed' || r.status === 'dead_letter'
  ).length;

  const tabs = [
    {
      id: 'outbox',
      label: 'Outbox Queue & Retries',
      href: '/admin/emails/outbox',
      count: pendingCount + failedCount,
    },
    {
      id: 'logs',
      label: 'Delivery History (email_log)',
      href: '/admin/emails',
      count: emailLogs?.length ?? 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/ops"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Security &amp; Ops Hub
        </Link>

        <AdminHubHeader
          eyebrow="TRANSACTIONAL EMAIL INFRASTRUCTURE"
          title="Email Outbox Queue & Delivery Logs"
          description="Monitor durable Resend outbox dispatches, retry failed/dead-lettered messages cleanly, and drain pending notifications immediately."
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <ActionFeedbackForm
              action={drainEmailOutboxAction}
              successMessage="Processed pending outbox items."
            >
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Play className="h-3.5 w-3.5" />
                Drain Outbox Now ({pendingCount})
              </Button>
            </ActionFeedbackForm>
          }
        />
      </div>

      {/* Filter Bar */}
      <form method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card p-3">
        <Input
          name="q"
          defaultValue={qFilter}
          placeholder="Search recipient, subject, or template..."
          className="h-8 min-w-[200px] flex-1 text-xs"
        />
        <select
          name="status"
          aria-label="Filter outbox by status"
          defaultValue={statusFilter}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="pending">pending</option>
          <option value="processing">processing</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
          Filter
        </Button>
      </form>

      {activeTab === 'outbox' ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              Outbox Queue ({filteredOutbox.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Automatic exponential backoff up to 5 attempts, with manual zero-attempt reset here.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredOutbox.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Recipient / Subject</TableHead>
                    <TableHead className="text-xs">Template</TableHead>
                    <TableHead className="text-xs">Status / Attempts</TableHead>
                    <TableHead className="text-right text-xs">Updated</TableHead>
                    <TableHead className="text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOutbox.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-mono text-xs font-semibold">{row.to_email}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{row.subject}</div>
                        {row.last_error && (
                          <div className="mt-0.5 text-[11px] text-destructive">{row.last_error}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {row.template}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              row.status === 'sent'
                                ? 'secondary'
                                : row.status === 'failed' || row.status === 'dead_letter'
                                  ? 'destructive'
                                  : 'outline'
                            }
                            className="font-mono text-[10px]"
                          >
                            {row.status}
                          </Badge>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {row.attempts}/5
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status !== 'sent' && (
                          <ActionFeedbackForm
                            action={retryOutboxEmailAction}
                            successMessage="Reset outbox attempts and queued retry."
                          >
                            <input type="hidden" name="outbox_id" value={row.id} />
                            <Button type="submit" variant="outline" size="sm" className="h-7 gap-1 text-[11px]">
                              <RotateCw className="h-3 w-3" />
                              Retry
                            </Button>
                          </ActionFeedbackForm>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No outbox items match the selected filter.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Audit Email Logs ({filteredLogs.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Recipient / Subject</TableHead>
                    <TableHead className="text-xs">Template</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-mono text-xs font-semibold">{log.to_email}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{log.subject}</div>
                        {log.error && <div className="text-[11px] text-destructive">{log.error}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {log.template}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.status === 'sent' ? 'secondary' : 'destructive'}
                          className="font-mono text-[10px]"
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No email log records found.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
