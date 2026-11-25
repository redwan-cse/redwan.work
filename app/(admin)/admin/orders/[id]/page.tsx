import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { OrderLiveChatServer } from '@/components/panel/order-live-chat-server';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requireAdminSession } from '@/lib/auth/session';
import {
  addOrderMilestoneAction,
  addOrderTaskAction,
  attachOrderRequirementFileAction,
  createPaidRevisionInvoiceAction,
  deleteDeliverableOrVaultFileAction,
  deleteOrderMilestoneAction,
  deleteOrderTaskAction,
  editOrderMilestoneDetailsAction,
  generateMilestoneInvoiceAction,
  resolveCancellationRequestAction,
  submitOrderDeliverableAction,
  toggleOrderRequirementsLockAction,
  toggleOrderTaskAction,
  updateOrderMilestoneAction,
  updateOrderStatusAndProgressAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const activeTab =
    query.tab === 'scope' ||
    query.tab === 'milestones' ||
    query.tab === 'revisions' ||
    query.tab === 'thread'
      ? query.tab
      : 'delivery';

  const session = await requireAdminSession();
  const admin = getSupabaseAdmin();

  const needVaultFiles = activeTab === 'delivery' || activeTab === 'scope';
  const needLinkedInvoices = activeTab === 'delivery' || activeTab === 'milestones';

  const [
    { data: order },
    { data: roe },
    { data: requirements },
    milestonesRes,
    tasksRes,
    deliverablesRes,
    vaultFilesRes,
    cancellationsRes,
    linkedInvoicesRes,
  ] = await Promise.all([
    admin.from('orders').select('*').eq('id', id).maybeSingle(),
    admin.from('engagement_authorizations').select('*').eq('order_id', id).maybeSingle(),
    admin.from('order_requirements').select('*').eq('order_id', id).maybeSingle(),
    activeTab === 'milestones'
      ? admin.from('order_milestones').select('*').eq('order_id', id).order('position')
      : admin.from('order_milestones').select('id', { count: 'exact', head: true }).eq('order_id', id),
    activeTab === 'milestones'
      ? admin.from('order_tasks').select('*').eq('order_id', id).order('created_at')
      : Promise.resolve({ data: null }),
    activeTab === 'delivery'
      ? admin
          .from('deliverables')
          .select('*')
          .eq('order_id', id)
          .order('submitted_at', { ascending: false })
      : admin.from('deliverables').select('id', { count: 'exact', head: true }).eq('order_id', id),
    needVaultFiles
      ? admin
          .from('vault_files')
          .select('*')
          .eq('order_id', id)
          .order('created_at', { ascending: false })
      : admin
          .from('vault_files')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', id)
          .in('category', ['requirement_attachment', 'order_attachment']),
    activeTab === 'revisions'
      ? admin
          .from('cancellation_requests')
          .select('*')
          .eq('order_id', id)
          .order('created_at', { ascending: false })
      : admin
          .from('cancellation_requests')
          .select('id, status, reason, resolution_notes, created_at')
          .eq('order_id', id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
    needLinkedInvoices
      ? admin
          .from('invoices')
          .select('id, code, milestone_id, status, total_cents, currency')
          .eq('order_id', id)
          .neq('status', 'void')
      : Promise.resolve({ data: null }),
  ]);

  if (!order) notFound();

  const milestones = activeTab === 'milestones' ? (milestonesRes.data ?? []) : [];
  const tasks = activeTab === 'milestones' ? (tasksRes.data ?? []) : [];
  const deliverables = activeTab === 'delivery' ? (deliverablesRes.data ?? []) : [];
  const vaultFiles = needVaultFiles ? (vaultFilesRes.data ?? []) : [];
  const cancellations = cancellationsRes.data ?? [];
  const linkedInvoices = needLinkedInvoices ? (linkedInvoicesRes.data ?? []) : [];

  const { data: clientProfile } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', order.client_id)
    .maybeSingle();

  const milestoneInvoiceMap = new Map<string, { id: string; code: string | null; status: string }>();
  for (const inv of linkedInvoices) {
    if (inv.milestone_id) {
      milestoneInvoiceMap.set(inv.milestone_id, {
        id: inv.id,
        code: inv.code,
        status: inv.status,
      });
    }
  }

  const requirementFiles = vaultFiles.filter(
    (vf) => vf.category === 'requirement_attachment' || vf.category === 'order_attachment'
  );
  const pendingCancels = cancellations.filter((c) => c.status === 'pending');

  const deliverablesCount =
    activeTab === 'delivery' ? deliverables.length : (deliverablesRes.count ?? 0);
  const requirementFilesCount = needVaultFiles
    ? requirementFiles.length
    : (vaultFilesRes.count ?? 0);
  const milestonesCount =
    activeTab === 'milestones' ? milestones.length : (milestonesRes.count ?? 0);

  const tabs = [
    { id: 'delivery', label: 'Delivery & Vault', href: `/admin/orders/${order.id}?tab=delivery`, count: deliverablesCount },
    { id: 'scope', label: 'Requirements & RoE', href: `/admin/orders/${order.id}?tab=scope`, count: requirementFilesCount },
    { id: 'milestones', label: 'Milestones & Tasks', href: `/admin/orders/${order.id}?tab=milestones`, count: milestonesCount },
    { id: 'revisions', label: 'Revisions & Cancel', href: `/admin/orders/${order.id}?tab=revisions`, count: pendingCancels.length },
    { id: 'thread', label: 'Thread & Notes', href: `/admin/orders/${order.id}?tab=thread` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Orders Pipeline
        </Link>

        <AdminHubHeader
          eyebrow={`${order.code} · ${order.pillar} · ${order.status.replace(/_/g, ' ')}`}
          title={order.title}
          description={`Client: ${clientProfile?.full_name || clientProfile?.email || order.client_id} · Total: ${formatMoney(order.total_cents, order.currency)} · Revisions: ${order.revisions_used}/${order.revisions_included} · Progress: ${order.progress_percent}%`}
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={roe ? 'default' : 'outline'} className="font-mono text-[10px]">
                {roe ? 'SIGNED & VERIFIED' : order.requires_roe ? 'SIGNATURE REQUIRED' : 'ROE OPTIONAL'}
              </Badge>
              <Badge variant={order.nda_accepted_at ? 'secondary' : 'outline'} className="font-mono text-[10px]">
                {order.nda_accepted_at ? 'NDA EXECUTED' : 'NDA PENDING'}
              </Badge>
              {order.is_custom_deal && (
                <Badge variant="outline" className="font-mono text-[10px]">Custom Deal</Badge>
              )}
              <Button asChild variant="outline" size="sm" className="h-8 rounded-full text-xs">
                <Link href={`/admin/clients/${order.client_id}`}>Client 360°</Link>
              </Button>
            </div>
          }
        />
      </div>

      {/* Pending Cancellation Alert */}
      {pendingCancels.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Client Requested Order Cancellation
              </div>
              <p className="text-muted-foreground">{pendingCancels[0].reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <ConfirmActionButton
                action={resolveCancellationRequestAction}
                hiddenFields={{ request_id: pendingCancels[0].id, decision: 'approved' }}
                triggerLabel="Approve Cancel"
                confirmTitle="Approve Order Cancellation?"
                confirmDescription="This transitions the order status to cancelled cleanly and records audit evidence."
                confirmLabel="Approve & Cancel Order"
                destructive
                variant="destructive"
              />
              <ActionFeedbackForm action={resolveCancellationRequestAction} successMessage="Cancellation declined.">
                <input type="hidden" name="request_id" value={pendingCancels[0].id} />
                <input type="hidden" name="decision" value="declined" />
                <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                  Decline Request
                </Button>
              </ActionFeedbackForm>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact Status & Progress Controller Bar */}
      <Card>
        <CardContent className="p-3.5">
          <ActionFeedbackForm
            action={updateOrderStatusAndProgressAction}
            successMessage="Order status and progress saved."
            className="flex flex-wrap items-end justify-between gap-3"
          >
            <input type="hidden" name="order_id" value={order.id} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="admin-order-status" className="text-[11px]">Order Status</Label>
                <select
                  id="admin-order-status"
                  name="status"
                  aria-label="Order lifecycle status"
                  defaultValue={order.status}
                  className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                >
                  <option value="awaiting_payment">awaiting_payment</option>
                  <option value="pending_requirements">pending_requirements</option>
                  <option value="queued">queued</option>
                  <option value="in_progress">in_progress</option>
                  <option value="in_review">in_review</option>
                  <option value="revision_requested">revision_requested</option>
                  <option value="delivered">delivered</option>
                  <option value="completed">completed</option>
                  <option value="on_hold">on_hold</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="admin-order-progress" className="text-[11px]">Progress %</Label>
                <Input
                  id="admin-order-progress"
                  name="progress_percent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={order.progress_percent}
                  className="h-8 w-20 font-mono text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="h-8 rounded-full text-xs">
                Update Order
              </Button>
            </div>

            <div className="font-mono text-[11px] text-muted-foreground">
              Auto-accept window: {order.auto_accept_days} days · Requirements:{' '}
              {requirements?.verified_by_admin_at ? 'Locked & Verified' : 'Open for client edit'}
            </div>
          </ActionFeedbackForm>
        </CardContent>
      </Card>

      {/* TAB 1: DELIVERY & VAULT (DEFAULT) */}
      {activeTab === 'delivery' && (
        <div className="space-y-6">
          {/* Linked Order Invoices Strip */}
          <Card className="border-border/80">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase text-muted-foreground">
                  Linked Invoices ({linkedInvoices?.length ?? 0}):
                </span>
                {(linkedInvoices ?? []).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/invoices/${inv.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-2.5 py-1 font-mono text-[11px] hover:border-primary/50"
                  >
                    <span className="font-bold text-primary">{inv.code}</span>
                    <span>{formatMoney(inv.total_cents, inv.currency)}</span>
                    <Badge variant="outline" className="px-1 py-0 text-[9px] uppercase">
                      {inv.status}
                    </Badge>
                  </Link>
                ))}
                {(!linkedInvoices || linkedInvoices.length === 0) && (
                  <span className="text-muted-foreground">No active invoices linked yet.</span>
                )}
              </div>
              <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-[11px]">
                <Link href={`/admin/invoices/new?client_id=${order.client_id}&order_id=${order.id}`}>
                  + New Order Invoice
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Publish Versioned R2 Deliverable */}
            <Card className="lg:col-span-5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  Publish Versioned Deliverable (DLV-XXXX)
                </CardTitle>
                <CardDescription className="text-xs">
                  Upload report/archive to the Encrypted Deliverables Vault and notify the client for sign-off.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionFeedbackForm
                  action={submitOrderDeliverableAction}
                  successMessage="Deliverable published to client portal."
                  resetOnSuccess
                  className="space-y-3.5"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <input type="hidden" name="client_id" value={order.client_id} />

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="dlv-title" className="text-xs">Deliverable Title *</Label>
                      <Input
                        id="dlv-title"
                        name="title"
                        required
                        placeholder="VAPT Final Technical & Executive Report"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlv-version" className="text-xs">Version</Label>
                      <Input
                        id="dlv-version"
                        name="version_label"
                        defaultValue={`v1.${deliverables?.length ?? 0}`}
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="dlv-release-notes" className="text-xs">Release Notes / Remediation Summary</Label>
                    <Textarea
                      id="dlv-release-notes"
                      name="release_notes"
                      rows={3}
                      placeholder="Summarize key findings, patches, or deployment instructions..."
                      className="text-xs"
                    />
                  </div>

                  <R2FileUploader
                    category="deliverable"
                    clientId={order.client_id}
                    orderId={order.id}
                    label="Upload Deliverable File to Encrypted Deliverables Vault"
                  />

                  <label className="flex min-h-7 cursor-pointer items-center gap-2.5 text-xs font-medium">
                    <input
                      type="checkbox"
                      name="is_final_delivery"
                      defaultChecked
                      className="h-6 w-6 shrink-0 rounded border-border accent-primary"
                    />
                    Mark as Final Delivery (Starts {order.auto_accept_days}-day client review timer)
                  </label>

                  <Button type="submit" className="w-full gap-1.5 rounded-full">
                    <Send className="h-4 w-4" />
                    Publish Deliverable to Client Portal
                  </Button>
                </ActionFeedbackForm>
              </CardContent>
            </Card>

            {/* Published Deliverables List */}
            <Card className="lg:col-span-7">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Published Deliverables &amp; Encrypted Vault Files ({deliverables?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deliverables && deliverables.length > 0 ? (
                  <div className="divide-y divide-border/70">
                    {deliverables.map((dlv) => {
                      const linkedFiles = (vaultFiles ?? []).filter(
                        (vf) => vf.deliverable_id === dlv.id
                      );
                      return (
                        <div key={dlv.id} className="space-y-2 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-primary">
                                {dlv.code}
                              </span>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {dlv.version_label}
                              </Badge>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {dlv.status}
                              </Badge>
                              {dlv.auto_accept_at && dlv.status === 'submitted' && (
                                <span className="font-mono text-[10px] text-amber-800 dark:text-amber-300">
                                  Auto-accept {new Date(dlv.auto_accept_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {formatDistanceToNow(new Date(dlv.submitted_at), { addSuffix: true })}
                              </span>
                              {dlv.status !== 'accepted' && (
                                <ConfirmActionButton
                                  action={deleteDeliverableOrVaultFileAction}
                                  hiddenFields={{ deliverable_id: dlv.id, order_id: order.id }}
                                  triggerLabel="Delete"
                                  confirmTitle="Delete unaccepted deliverable?"
                                  confirmDescription="Removes this draft/unaccepted deliverable and purges its private R2 objects."
                                  confirmLabel="Delete Deliverable"
                                  destructive
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                />
                              )}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{dlv.title}</div>
                          {dlv.release_notes && (
                            <p className="text-xs text-muted-foreground">{dlv.release_notes}</p>
                          )}
                          {dlv.client_feedback && (
                            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
                              <strong>Client Feedback:</strong> {dlv.client_feedback}
                            </div>
                          )}
                          {linkedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {linkedFiles.map((vf) => (
                                <Button
                                  key={vf.id}
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1.5 rounded-full font-mono text-[11px]"
                                >
                                  <a href={`/api/files/${vf.id}/download`}>
                                    <Download className="h-3 w-3 text-primary" />
                                    {vf.filename} ({vf.download_count} dl)
                                  </a>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No deliverables published for this order yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: REQUIREMENTS & ROE */}
      {activeTab === 'scope' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className={order.requires_roe ? 'border-primary/40' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Rules of Engagement &amp; NDA Evidence
                </CardTitle>
                <Badge variant={roe ? 'default' : 'outline'} className="font-mono text-[10px]">
                  {roe ? 'EXECUTED & VERIFIED' : order.requires_roe ? 'SIGNATURE REQUIRED' : 'OPTIONAL'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <span className="font-semibold">Confidentiality NDA: </span>
                {order.nda_accepted_at ? (
                  <span className="font-mono text-emerald-800 dark:text-emerald-300">
                    Executed on {new Date(order.nda_accepted_at).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Awaiting explicit client NDA acceptance</span>
                )}
              </div>

              {roe ? (
                <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div>
                    <span className="font-semibold">Signer:</span> {roe.signer_full_name}{' '}
                    {roe.signer_title ? `(${roe.signer_title})` : ''} on{' '}
                    {new Date(roe.signed_at).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold">Authorized Targets:</span>{' '}
                    <span className="font-mono text-primary">
                      {roe.authorized_targets.join(', ')}
                    </span>
                  </div>
                  {(roe.testing_window_start || roe.testing_window_end) && (
                    <div>
                      <span className="font-semibold">Authorized Testing Window:</span>{' '}
                      <span className="font-mono">
                        {roe.testing_window_start ?? 'Immediate'} → {roe.testing_window_end ?? 'Completion'}
                      </span>
                    </div>
                  )}
                  {roe.excluded_systems && (
                    <div>
                      <span className="font-semibold">Exclusions:</span> {roe.excluded_systems}
                    </div>
                  )}
                  <div>
                    <span className="font-semibold">Emergency Contact:</span>{' '}
                    {roe.emergency_contact_name} ({roe.emergency_contact_phone})
                  </div>
                  {roe.signer_ip_hash && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      Signer IP Hash: {roe.signer_ip_hash}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {order.requires_roe
                    ? 'Waiting for client digital RoE signature before transitioning to in_progress.'
                    : 'Offensive security RoE authorization is not required for this order.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Client Requirements &amp; Vault Attachments</CardTitle>
                <CardDescription className="text-xs">
                  Verify scope to lock requirements against post-intake changes.
                </CardDescription>
              </div>
              <ActionFeedbackForm
                action={toggleOrderRequirementsLockAction}
                successMessage={
                  requirements?.verified_by_admin_at ? 'Requirements unlocked.' : 'Requirements verified & locked.'
                }
              >
                <input type="hidden" name="order_id" value={order.id} />
                <input
                  type="hidden"
                  name="lock"
                  value={requirements?.verified_by_admin_at ? 'false' : 'true'}
                />
                <Button type="submit" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  {requirements?.verified_by_admin_at ? (
                    <>
                      <Unlock className="h-3.5 w-3.5" /> Unlock Scope
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Lock &amp; Verify
                    </>
                  )}
                </Button>
              </ActionFeedbackForm>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {requirements ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3.5">
                  <div>
                    <span className="font-semibold">Target Scope Notes:</span>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {requirements.target_scope_notes || 'None provided'}
                    </p>
                  </div>
                  {requirements.access_instructions && (
                    <div>
                      <span className="font-semibold">Access / Environment Instructions:</span>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {requirements.access_instructions}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No client requirements submitted yet.</p>
              )}

              {requirementFiles.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold">Uploaded Intake / Attachment Files:</div>
                  <div className="space-y-1.5">
                    {requirementFiles.map((vf) => (
                      <div
                        key={vf.id}
                        className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-1.5"
                      >
                        <a
                          href={`/api/files/${vf.id}/download`}
                          className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {vf.filename}
                        </a>
                        <ConfirmActionButton
                          action={deleteDeliverableOrVaultFileAction}
                          hiddenFields={{ vault_file_id: vf.id, order_id: order.id }}
                          triggerLabel="Remove"
                          confirmTitle="Remove requirement file?"
                          confirmDescription="Deletes the stored R2 object and database file record."
                          destructive
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-destructive"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ActionFeedbackForm
                action={attachOrderRequirementFileAction}
                successMessage="File attached to order vault."
                resetOnSuccess
                className="space-y-2 border-t border-border/60 pt-3"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <R2FileUploader
                  category="requirement_attachment"
                  clientId={order.client_id}
                  orderId={order.id}
                  label="Attach Brief / Specification File"
                />
                <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full text-xs">
                  Save Attached File
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: MILESTONES & TASKS */}
      {activeTab === 'milestones' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Milestones &amp; 1-Click Invoicing</CardTitle>
              <CardDescription className="text-xs">
                Add, update, or generate an official issued invoice directly from any order milestone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(milestones ?? []).map((ms) => {
                const linkedInv = milestoneInvoiceMap.get(ms.id);
                return (
                  <div key={ms.id} className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{ms.title}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {formatMoney(ms.amount_cents, ms.currency)} · {ms.status}
                          {ms.due_date ? ` · Due ${ms.due_date}` : ''}
                        </div>
                      </div>
                      {linkedInv ? (
                        <Link
                          href={`/admin/invoices/${linkedInv.id}`}
                          className="font-mono text-[11px] font-semibold text-primary hover:underline"
                        >
                          {linkedInv.code ?? 'Invoice'} ({linkedInv.status})
                        </Link>
                      ) : ms.amount_cents > 0 ? (
                        <ActionFeedbackForm
                          action={generateMilestoneInvoiceAction}
                          successMessage="Milestone invoice issued."
                        >
                          <input type="hidden" name="milestone_id" value={ms.id} />
                          <input type="hidden" name="order_id" value={order.id} />
                          <Button type="submit" size="sm" variant="outline" className="h-7 rounded-full text-[11px]">
                            Generate Invoice
                          </Button>
                        </ActionFeedbackForm>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
                      <ActionFeedbackForm
                        action={updateOrderMilestoneAction}
                        successMessage="Milestone status updated."
                        className="flex items-center gap-1.5"
                      >
                        <input type="hidden" name="milestone_id" value={ms.id} />
                        <input type="hidden" name="order_id" value={order.id} />
                        <select
                          name="status"
                          aria-label="Milestone status"
                          defaultValue={ms.status}
                          className="h-7 rounded border border-border bg-background px-2 text-[11px]"
                        >
                          <option value="pending">pending</option>
                          <option value="in_progress">in_progress</option>
                          <option value="delivered">delivered</option>
                          <option value="approved">approved</option>
                        </select>
                        <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                          Save
                        </Button>
                      </ActionFeedbackForm>

                      {!linkedInv && (
                        <ConfirmActionButton
                          action={deleteOrderMilestoneAction}
                          hiddenFields={{ milestone_id: ms.id, order_id: order.id }}
                          triggerLabel="Delete"
                          confirmTitle="Delete milestone?"
                          confirmDescription="Removes this uninvoiced milestone from the schedule."
                          destructive
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-destructive"
                        />
                      )}
                    </div>

                    <details className="border-t border-border/40 pt-1.5">
                      <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground hover:text-primary">
                        Edit Milestone Details (Title / Amount / Due Date)
                      </summary>
                      <ActionFeedbackForm
                        action={editOrderMilestoneDetailsAction}
                        successMessage="Milestone details updated."
                        className="mt-2 grid gap-2 sm:grid-cols-4"
                      >
                        <input type="hidden" name="milestone_id" value={ms.id} />
                        <input type="hidden" name="order_id" value={order.id} />
                        <Input
                          name="title"
                          defaultValue={ms.title}
                          required
                          aria-label="Milestone title"
                          className="h-7 text-[11px] sm:col-span-2"
                        />
                        <Input
                          name="amount_major"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={(ms.amount_cents / 100).toFixed(2)}
                          disabled={Boolean(linkedInv)}
                          aria-label="Milestone amount"
                          className="h-7 font-mono text-[11px]"
                        />
                        <Input
                          name="due_date"
                          type="date"
                          defaultValue={ms.due_date ?? ''}
                          aria-label="Milestone due date"
                          className="h-7 font-mono text-[11px]"
                        />
                        <div className="flex items-center justify-between gap-2 sm:col-span-4">
                          <span className="text-[10px] text-muted-foreground">
                            {linkedInv ? 'Amount locked because an invoice is already linked.' : 'Uninvoiced milestone amount can be adjusted.'}
                          </span>
                          <Button type="submit" size="sm" variant="secondary" className="h-6 px-2.5 text-[10px]">
                            Save Details
                          </Button>
                        </div>
                      </ActionFeedbackForm>
                    </details>
                  </div>
                );
              })}

              <ActionFeedbackForm
                action={addOrderMilestoneAction}
                successMessage="Milestone added."
                resetOnSuccess
                className="space-y-2.5 border-t border-border/60 pt-3"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    name="title"
                    aria-label="New milestone title"
                    required
                    placeholder="New milestone title"
                    className="h-8 sm:col-span-2 text-xs"
                  />
                  <Input
                    name="amount_usd"
                    aria-label="New milestone amount"
                    type="number"
                    min="0"
                    defaultValue="250"
                    placeholder="Amount"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline" className="h-8 gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add Milestone
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Execution Checklist (Auto-Syncs Progress %)
              </CardTitle>
              <CardDescription className="text-xs">
                Toggling or deleting tasks automatically updates order progress % via DB trigger.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {(tasks ?? []).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2
                        className={`h-4 w-4 shrink-0 ${
                          task.is_completed ? 'text-primary' : 'text-muted-foreground/40'
                        }`}
                      />
                      <span
                        className={`truncate ${
                          task.is_completed ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.is_client_visible && (
                        <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
                          Visible
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ActionFeedbackForm action={toggleOrderTaskAction} successMessage="Task updated.">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="order_id" value={order.id} />
                        <input
                          type="hidden"
                          name="is_completed"
                          value={task.is_completed ? 'false' : 'true'}
                        />
                        <Button type="submit" variant="ghost" size="sm" className="h-7 text-[11px]">
                          {task.is_completed ? 'Reopen' : 'Complete'}
                        </Button>
                      </ActionFeedbackForm>
                      <ActionFeedbackForm action={deleteOrderTaskAction} successMessage="Task removed.">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="order_id" value={order.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </ActionFeedbackForm>
                    </div>
                  </div>
                ))}
              </div>

              <ActionFeedbackForm
                action={addOrderTaskAction}
                successMessage="Task added."
                resetOnSuccess
                className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <Input
                  name="title"
                  aria-label="New execution task title"
                  required
                  placeholder="Add execution task..."
                  className="h-8 min-w-[180px] flex-1 text-xs"
                />
                <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="is_client_visible"
                    defaultChecked
                    className="h-6 w-6 rounded border-border accent-primary"
                  />
                  Client-visible
                </label>
                <Button type="submit" variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add Task
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: REVISIONS & CANCELLATIONS */}
      {activeTab === 'revisions' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Issue Paid Revision Addendum</CardTitle>
              <CardDescription className="text-xs">
                Grants extra revision rounds atomically once the generated addendum invoice is paid. Current usage: {order.revisions_used}/{order.revisions_included}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={createPaidRevisionInvoiceAction}
                successMessage="Paid revision invoice issued to client."
                resetOnSuccess
                className="space-y-3"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="rev-extra-rounds" className="text-xs">Extra Revision Rounds *</Label>
                    <Input
                      id="rev-extra-rounds"
                      name="extra_revisions"
                      type="number"
                      min="1"
                      max="20"
                      defaultValue="2"
                      required
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rev-fee-major" className="text-xs">Addendum Fee ({order.currency}) *</Label>
                    <Input
                      id="rev-fee-major"
                      name="fee_major"
                      type="number"
                      step="0.01"
                      min="1"
                      defaultValue="150"
                      required
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rev-summary" className="text-xs">Revision Scope Description *</Label>
                  <Textarea
                    id="rev-summary"
                    name="summary"
                    rows={3}
                    required
                    placeholder="Additional 2 retest/redesign cycles beyond contract allowance..."
                    className="text-xs"
                  />
                </div>
                <Button type="submit" size="sm" className="rounded-full">
                  Issue Paid Revision Invoice
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Cancellation History ({cancellations?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {cancellations && cancellations.length > 0 ? (
                cancellations.map((req) => (
                  <div key={req.id} className="space-y-1.5 rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={req.status === 'pending' ? 'destructive' : 'outline'} className="font-mono text-[10px]">
                        {req.status}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p>{req.reason}</p>
                    {req.resolution_notes && (
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Resolution: {req.resolution_notes}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">
                  No cancellation requests filed on this engagement.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: CONTEXTUAL THREAD & INTERNAL NOTES */}
      {activeTab === 'thread' && (
        <Suspense
          fallback={
            <div className="h-72 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
          }
        >
          <OrderLiveChatServer
            orderId={order.id}
            orderCode={order.code}
            orderTitle={order.title}
            orderStatus={order.status}
            viewerId={session.userId}
            viewerRole="admin"
          />
        </Suspense>
      )}
    </div>
  );
}
