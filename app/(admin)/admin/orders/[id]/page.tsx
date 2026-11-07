import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  Lock,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  addOrderTaskAction,
  submitOrderDeliverableAction,
  toggleOrderTaskAction,
  updateOrderStatusAndProgressAction,
} from '@/lib/crm/actions';
import { ContractLiveChat } from '@/components/panel/contract-live-chat';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  const admin = getSupabaseAdmin();

  const [
    { data: order },
    { data: requirements },
    { data: roe },
    { data: milestones },
    { data: tasks },
    { data: deliverables },
    { data: vaultFiles },
  ] = await Promise.all([
    admin.from('orders').select('*').eq('id', id).maybeSingle(),
    admin.from('order_requirements').select('*').eq('order_id', id).maybeSingle(),
    admin.from('engagement_authorizations').select('*').eq('order_id', id).maybeSingle(),
    admin.from('order_milestones').select('*').eq('order_id', id).order('position'),
    admin.from('order_tasks').select('*').eq('order_id', id).order('created_at'),
    admin
      .from('deliverables')
      .select('*')
      .eq('order_id', id)
      .order('submitted_at', { ascending: false }),
    admin
      .from('vault_files')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!order) notFound();

  const { data: clientProfile } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', order.client_id)
    .maybeSingle();

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Orders Pipeline
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-lg font-bold text-primary">{order.code}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {order.status.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              {order.pillar}
            </Badge>
            {order.is_custom_deal && (
              <Badge className="font-mono text-xs">Custom Deal Offer</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{order.title}</h1>
          <p className="text-xs text-muted-foreground">
            Client:{' '}
            <Link
              href={`/admin/clients/${order.client_id}`}
              className="font-medium text-foreground underline hover:text-primary"
            >
              {clientProfile?.full_name || clientProfile?.email}
            </Link>{' '}
            · Total: <strong className="font-mono">{formatMoney(order.total_cents, order.currency)}</strong> · Revisions: {order.revisions_used}/{order.revisions_included}
          </p>
        </div>

        {/* Status & Progress Controller */}
        <Card className="w-full sm:w-auto">
          <CardContent className="p-4">
            <form
              action={updateOrderStatusAndProgressAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <div className="space-y-1">
                <Label className="text-[11px]">Order Status</Label>
                <select
                  name="status"
                  defaultValue={order.status}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="awaiting_requirements">awaiting_requirements</option>
                  <option value="awaiting_payment">awaiting_payment</option>
                  <option value="awaiting_roe">awaiting_roe</option>
                  <option value="in_progress">in_progress</option>
                  <option value="in_review">in_review</option>
                  <option value="delivered">delivered</option>
                  <option value="revision_requested">revision_requested</option>
                  <option value="completed">completed</option>
                  <option value="on_hold">on_hold</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Progress %</Label>
                <Input
                  name="progress_percent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={order.progress_percent}
                  className="h-9 w-20 font-mono text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="h-9 rounded-full">
                Update Order
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Rules of Engagement & Client Requirements Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={order.requires_roe ? 'border-primary/40' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Rules of Engagement (RoE) Authorization
              </CardTitle>
              <Badge variant={roe ? 'default' : 'outline'} className="font-mono text-[10px]">
                {roe ? 'SIGNED & VERIFIED' : order.requires_roe ? 'SIGNATURE REQUIRED' : 'OPTIONAL'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs">
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
                {roe.excluded_systems && (
                  <div>
                    <span className="font-semibold">Exclusions:</span> {roe.excluded_systems}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Emergency Contact:</span>{' '}
                  {roe.emergency_contact_name} ({roe.emergency_contact_phone})
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {order.requires_roe
                  ? 'Waiting for the client to digitally sign the Rules of Engagement in their Portal before active testing transitions to in_progress.'
                  : 'This engagement does not require an offensive security RoE authorization.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Client Scope &amp; Requirements Intake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {requirements ? (
              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div>
                  <span className="font-semibold text-foreground">Target Scope Notes:</span>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {requirements.target_scope_notes || 'None provided'}
                  </p>
                </div>
                {requirements.access_instructions && (
                  <div>
                    <span className="font-semibold text-foreground">Environment / Access Notes:</span>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {requirements.access_instructions}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                Client has not submitted additional requirements yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deliverable Publisher & Milestones/Tasks */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Publish Versioned R2 Deliverable */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck2 className="h-5 w-5 text-primary" />
              Publish Versioned Deliverable (`DLV-XXXX`)
            </CardTitle>
            <CardDescription className="text-xs">
              Upload report/archive to the Encrypted Deliverables Vault and notify the client for sign-off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submitOrderDeliverableAction} className="space-y-4">
              <input type="hidden" name="order_id" value={order.id} />
              <input type="hidden" name="client_id" value={order.client_id} />

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Deliverable Title *</Label>
                  <Input
                    name="title"
                    required
                    placeholder="VAPT Final Technical & Executive Report"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Version</Label>
                  <Input
                    name="version_label"
                    defaultValue={`v1.${deliverables?.length ?? 0}`}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Release Notes / Remediation Summary</Label>
                <Textarea
                  name="release_notes"
                  rows={3}
                  placeholder="Summarize key findings, patches, or deployment instructions..."
                  className="text-xs"
                />
              </div>

              <R2FileUploader
                category="deliverable"
                clientId={order.client_id}
                label="Upload Deliverable File to Encrypted Deliverables Vault"
              />

              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="is_final_delivery"
                  defaultChecked
                  className="h-4 w-4 rounded border-border"
                />
                Mark as Final Delivery (Starts {order.auto_accept_days}-day client review timer)
              </label>

              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Send className="h-4 w-4" />
                Publish Deliverable to Client Portal
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Published Deliverables & Tasks Checklist */}
        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Published Deliverables &amp; Encrypted Vault Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliverables && deliverables.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {deliverables.map((dlv) => {
                    const linkedFiles = (vaultFiles ?? []).filter(
                      (vf) => vf.deliverable_id === dlv.id
                    );
                    return (
                      <div key={dlv.id} className="space-y-2 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary">
                              {dlv.code}
                            </span>
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {dlv.version_label}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {dlv.status}
                            </Badge>
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(dlv.submitted_at), {
                              addSuffix: true,
                            })}
                          </span>
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
                <p className="py-4 text-xs text-muted-foreground">
                  No deliverables published for this order yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Milestones & Execution Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Milestones &amp; Execution Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {milestones && milestones.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs"
                    >
                      <div className="font-semibold">{m.title}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {formatMoney(m.amount_cents, m.currency)} · {m.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {(tasks ?? []).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`h-4 w-4 ${task.is_completed ? 'text-primary' : 'text-muted-foreground/40'}`}
                      />
                      <span className={task.is_completed ? 'line-through text-muted-foreground' : ''}>
                        {task.title}
                      </span>
                    </div>
                    <form action={toggleOrderTaskAction}>
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
                    </form>
                  </div>
                ))}
              </div>

              <form action={addOrderTaskAction} className="flex flex-wrap items-center gap-2 pt-2">
                <input type="hidden" name="order_id" value={order.id} />
                <Input
                  name="title"
                  placeholder="Add execution task..."
                  className="h-9 min-w-[200px] flex-1 text-xs"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="is_client_visible"
                    defaultChecked
                    className="h-3.5 w-3.5 rounded"
                  />
                  Client-visible
                </label>
                <Button type="submit" variant="outline" size="sm" className="h-9 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add Task
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Contextual Order Discussion Thread */}
      <ContractLiveChat
        viewerId={session?.userId ?? order.client_id}
        viewerRole="admin"
        contracts={[
          {
            id: order.id,
            code: order.code,
            title: order.title,
            status: order.status,
          },
        ]}
      />
    </div>
  );
}
