import Link from 'next/link';
import { ArrowLeft, Download, FolderArchive, Pin, ShieldAlert, TimerReset } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  extendVaultRetentionAction,
  purgeOrphanPrivateObjectAction,
} from '@/lib/admin/ops-actions';
import { requireAdminSession } from '@/lib/auth/session';
import { deleteDeliverableOrVaultFileAction } from '@/lib/crm/actions';
import {
  CLIENT_VAULT_QUOTA_BYTES,
  isR2Configured,
  listPrivateVaultObjects,
  type R2ObjectSummary,
} from '@/lib/r2';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminRecoveryPage() {
  await requireAdminSession();
  const admin = getSupabaseAdmin();
  const r2Ready = isR2Configured();

  const [{ data: vaultFiles }, { data: clients }, { data: orders }, r2PrivateList] =
    await Promise.all([
      admin
        .from('vault_files')
        .select('*')
        .is('archived_at', null)
        .order('retention_until', { ascending: true, nullsFirst: false })
        .limit(100),
      admin.from('profiles').select('id, full_name, email').eq('role', 'client'),
      admin
        .from('orders')
        .select('id, code, title, client_id')
        .order('created_at', { ascending: false })
        .limit(30),
      r2Ready ? listPrivateVaultObjects().catch(() => [] as R2ObjectSummary[]) : Promise.resolve([]),
    ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.full_name || c.email]));
  const quotaByClient = new Map<string, number>();
  const fileCountByOrder = new Map<string, number>();
  const trackedKeys = new Set<string>();

  for (const vf of vaultFiles ?? []) {
    trackedKeys.add(vf.r2_key);
    if (vf.owner_client_id && !vf.archived_at) {
      quotaByClient.set(
        vf.owner_client_id,
        (quotaByClient.get(vf.owner_client_id) ?? 0) + Number(vf.size_bytes || 0)
      );
    }
    if (vf.order_id && !vf.archived_at) {
      fileCountByOrder.set(vf.order_id, (fileCountByOrder.get(vf.order_id) ?? 0) + 1);
    }
  }

  const orphanObjects = (r2PrivateList ?? [])
    .filter((obj) => !trackedKeys.has(obj.key))
    .slice(0, 40);

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
          eyebrow="PRIVATE R2 VAULT GOVERNANCE & DISASTER RECOVERY"
          title="Vault Quotas, Retention Controls & ZIP Recovery"
          description="Inspect per-client encrypted storage consumption, extend or pin expiring security deliverables (90-day default), purge orphan keys, and download ZIP bundles per order."
        />
      </div>

      {/* Per-Client Quotas + Project ZIP Recovery Export */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Client Storage Quota Usage (500 MB Cap)</CardTitle>
            <CardDescription className="text-xs">
              Active non-archived private vault footprint per client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {(clients ?? []).filter((c) => (quotaByClient.get(c.id) ?? 0) > 0).length > 0 ? (
              (clients ?? [])
                .filter((c) => (quotaByClient.get(c.id) ?? 0) > 0)
                .map((client) => {
                  const used = quotaByClient.get(client.id) ?? 0;
                  const pct = Math.min(100, Math.round((used / CLIENT_VAULT_QUOTA_BYTES) * 100));
                  return (
                    <div key={client.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {client.full_name || client.email}
                        </Link>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {(used / (1024 * 1024)).toFixed(2)} MB ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            ) : (
              <p className="py-4 text-muted-foreground">No client vault objects stored yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderArchive className="h-4 w-4 text-primary" />
              Order Vault ZIP Recovery Export
            </CardTitle>
            <CardDescription className="text-xs">
              Download all active private deliverables &amp; scope documents for any order in one ZIP archive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(orders ?? []).filter((o) => (fileCountByOrder.get(o.id) ?? 0) > 0).length > 0 ? (
              (orders ?? [])
                .filter((o) => (fileCountByOrder.get(o.id) ?? 0) > 0)
                .map((ord) => (
                  <div
                    key={ord.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-primary">{ord.code}</span>{' '}
                      <span className="truncate font-medium">{ord.title}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        ({fileCountByOrder.get(ord.id)} files)
                      </span>
                    </div>
                    <Button asChild size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]">
                      <a href={`/api/admin/recovery/export?order_id=${ord.id}`}>
                        <Download className="h-3 w-3" />
                        Export ZIP
                      </a>
                    </Button>
                  </div>
                ))
            ) : (
              <p className="py-4 text-muted-foreground">No order-linked files available for ZIP export.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tracked Vault Files & Retention Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Encrypted Vault Objects ({vaultFiles?.length ?? 0})
          </CardTitle>
          <CardDescription className="text-xs">
            Extend retention by +90 days or pin forever to protect critical reports from scheduled R2 cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {vaultFiles && vaultFiles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Filename / Category</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs">Retention Until</TableHead>
                  <TableHead className="text-right text-xs">Size</TableHead>
                  <TableHead className="text-right text-xs">Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vaultFiles.map((vf) => (
                  <TableRow key={vf.id}>
                    <TableCell>
                      <a
                        href={`/api/files/${vf.id}/download`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {vf.filename}
                      </a>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Badge variant="secondary" className="font-mono text-[9px] uppercase">
                          {vf.category}
                        </Badge>
                        {vf.archived_at && (
                          <Badge variant="outline" className="font-mono text-[9px]">
                            archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {vf.owner_client_id ? (clientMap.get(vf.owner_client_id) ?? 'Client') : 'System'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {vf.retention_until ? (
                        new Date(vf.retention_until).toLocaleDateString()
                      ) : (
                        <Badge variant="default" className="font-mono text-[9px]">
                          PINNED
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {(vf.size_bytes / 1024).toFixed(1)} KB
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <ActionFeedbackForm
                          action={extendVaultRetentionAction}
                          successMessage="Retention extended +90 days."
                        >
                          <input type="hidden" name="file_id" value={vf.id} />
                          <input type="hidden" name="mode" value="extend_90d" />
                          <Button type="submit" size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
                            <TimerReset className="h-3 w-3" />
                            +90d
                          </Button>
                        </ActionFeedbackForm>

                        {vf.retention_until !== null && (
                          <ActionFeedbackForm
                            action={extendVaultRetentionAction}
                            successMessage="File pinned forever."
                          >
                            <input type="hidden" name="file_id" value={vf.id} />
                            <input type="hidden" name="mode" value="pin_forever" />
                            <Button type="submit" size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
                              <Pin className="h-3 w-3" />
                              Pin
                            </Button>
                          </ActionFeedbackForm>
                        )}

                        {!vf.deliverable_id && (
                          <ConfirmActionButton
                            action={deleteDeliverableOrVaultFileAction}
                            hiddenFields={{ vault_file_id: vf.id }}
                            triggerLabel="Purge"
                            confirmTitle={`Purge ${vf.filename}?`}
                            confirmDescription="Permanently deletes this file from Private R2 storage and removes the record."
                            destructive
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-destructive"
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No tracked vault objects.</p>
          )}
        </CardContent>
      </Card>

      {/* Unlinked Orphan R2 Keys */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Orphan R2 Storage Inventory ({orphanObjects.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Objects present in R2 Private bucket without an active tracking row in PostgreSQL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {!r2Ready ? (
            <p className="text-muted-foreground">Private R2 bucket environment variables are not set.</p>
          ) : orphanObjects.length > 0 ? (
            orphanObjects.map((obj) => (
              <div
                key={obj.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="min-w-0 font-mono">
                  <div className="break-all text-[11px] font-semibold">{obj.key}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(obj.size / 1024).toFixed(1)} KB · Last modified {obj.lastModified.toISOString()}
                  </div>
                </div>
                <ConfirmActionButton
                  action={purgeOrphanPrivateObjectAction}
                  hiddenFields={{ r2_key: obj.key }}
                  triggerLabel="Purge Orphan"
                  confirmTitle="Purge untracked R2 object?"
                  confirmDescription={`Deletes ${obj.key} permanently from Private R2 storage.`}
                  destructive
                  variant="outline"
                />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Zero untracked orphan objects detected in R2 inventory.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
