import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Activity, FolderLock, Mail, Settings } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
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
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function OpsHubView({
  actionFilter = '',
  qFilter = '',
  pageParam,
}: {
  actionFilter?: string;
  qFilter?: string;
  pageParam?: string;
}) {
  const admin = getSupabaseAdmin();
  const [
    { data: logs },
    { count: queuedEmailsCount },
    { count: failedEmailsCount },
    { count: vaultCount },
  ] = await Promise.all([
    admin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(250),
    admin.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('email_outbox').select('id', { count: 'exact', head: true }).in('status', ['failed', 'dead_letter']),
    admin.from('vault_files').select('id', { count: 'exact', head: true }).is('deleted_from_r2_at', null),
  ]);

  const lowerQ = qFilter.trim().toLowerCase();
  const filteredLogs = (logs ?? []).filter((entry) => {
    if (actionFilter && entry.action !== actionFilter) return false;
    if (lowerQ) {
      const hay = `${entry.action} ${entry.summary} ${entry.entity_type}`.toLowerCase();
      if (!hay.includes(lowerQ)) return false;
    }
    return true;
  });

  const pagedLogs = paginateItems(filteredLogs, pageParam);

  const uniqueActions = Array.from(new Set((logs ?? []).map((l) => l.action))).slice(0, 30);

  const tabs = [
    { id: 'audit', label: 'Immutable Audit Log', href: '/admin/ops', count: logs?.length ?? 0 },
    {
      id: 'outbox',
      label: 'Email Outbox & Queue',
      href: '/admin/emails/outbox',
      count: (queuedEmailsCount ?? 0) + (failedEmailsCount ?? 0),
    },
    { id: 'recovery', label: 'R2 Vault Recovery', href: '/admin/recovery', count: vaultCount ?? 0 },
    { id: 'settings', label: 'Consent & Security Settings', href: '/admin/settings' },
  ];

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="SECURITY, COMPLIANCE & INFRASTRUCTURE OPS"
        title="Security & Operations Center"
        description="Inspect append-only audit logs, monitor transactional email outbox queues, manage encrypted R2 vault retention/recovery, and administer consent policies & admin credentials."
        tabs={tabs}
        activeTab="audit"
      />

      {/* Quick Console Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Transactional Email Outbox</span>
              <Mail className="h-3.5 w-3.5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="font-mono text-xs">
              <strong>{queuedEmailsCount ?? 0}</strong> pending ·{' '}
              <strong className={(failedEmailsCount ?? 0) > 0 ? 'text-destructive' : ''}>
                {failedEmailsCount ?? 0}
              </strong>{' '}
              failed
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs">
              <Link href="/admin/emails/outbox">Open Outbox →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Encrypted R2 Vault Files</span>
              <FolderLock className="h-3.5 w-3.5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="font-mono text-xs">
              <strong>{vaultCount ?? 0}</strong> active objects
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs">
              <Link href="/admin/recovery">Vault &amp; Recovery →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Consent Policies &amp; Security</span>
              <Settings className="h-3.5 w-3.5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Policies, MFA &amp; Password</span>
            <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs">
              <Link href="/admin/settings">Settings →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Immutable Audit Ledger */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Immutable Audit Log ({filteredLogs.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Protected by database immutability trigger — records cannot be edited or deleted.
            </CardDescription>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={qFilter}
              placeholder="Search summary/action..."
              className="h-8 w-44 text-xs"
            />
            <select
              name="action"
              aria-label="Filter by audit action"
              defaultValue={actionFilter}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">All Actions</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
              Filter
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs">Actor Role</TableHead>
                  <TableHead className="text-xs">Summary</TableHead>
                  <TableHead className="text-right text-xs">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedLogs.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {entry.actor_role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{entry.summary}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No audit events match the selected filter.
            </p>
          )}
          <AdminPagination
            basePath="/admin/ops"
            page={pagedLogs.page}
            totalPages={pagedLogs.totalPages}
            totalItems={pagedLogs.totalItems}
            startIndex={pagedLogs.startIndex}
            endIndex={pagedLogs.endIndex}
            query={{ action: actionFilter || undefined, q: qFilter || undefined }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
