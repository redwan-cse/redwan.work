import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  acceptOrderNdaAction,
  attachOrderRequirementFileAction,
  reviewDeliverableClientAction,
  signOrderRoeAction,
  submitCancellationRequestAction,
  submitClientReviewAction,
  submitOrderRequirementsAction,
} from '@/lib/crm/actions';
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

export const dynamic = 'force-dynamic';

export default async function ClientOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/orders');

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [
    { data: order },
    { data: visibleTasks },
    { data: requirementAttachments },
    { data: cancellationHistory },
  ] = await Promise.all([
    admin
      .from('orders')
      .select(
        '*, order_milestones(*), order_requirements(*), engagement_authorizations(*), deliverables(*, vault_files(*)), client_reviews(*)'
      )
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('order_tasks')
      .select('id, title, is_completed, completed_at')
      .eq('order_id', id)
      .eq('is_client_visible', true)
      .order('created_at'),
    admin
      .from('vault_files')
      .select('id, filename, size_bytes, created_at')
      .eq('order_id', id)
      .in('category', ['requirement_attachment', 'order_attachment'])
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    admin
      .from('cancellation_requests')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    notFound();
  }

  const milestones = Array.isArray(order.order_milestones) ? order.order_milestones : [];
  const deliverables = Array.isArray(order.deliverables) ? order.deliverables : [];
  const reqRecord = Array.isArray(order.order_requirements)
    ? order.order_requirements[0]
    : order.order_requirements;
  const roeRecord = Array.isArray(order.engagement_authorizations)
    ? order.engagement_authorizations[0]
    : order.engagement_authorizations;
  const existingReview = Array.isArray(order.client_reviews)
    ? order.client_reviews[0]
    : order.client_reviews;

  const isReqLocked = Boolean(reqRecord?.verified_by_admin_at);
  const canRequestCancellation =
    session.role === 'client' &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    !(cancellationHistory ?? []).some((c) => c.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/portal/orders"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to My Orders
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-primary">{order.code}</span>
            <Badge variant="outline" className="font-mono text-xs uppercase">
              {order.status.replace(/_/g, ' ')}
            </Badge>
            {order.is_custom_deal && (
              <Badge className="font-mono text-xs">Custom Deal Offer</Badge>
            )}
            <Badge variant="secondary" className="font-mono text-xs">
              Progress: {order.progress_percent}%
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{order.title}</h1>
        </div>

        <div className="text-right">
          <div className="font-mono text-xl font-extrabold">
            {order.currency} {(order.total_cents / 100).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            Revisions: {order.revisions_used} / {order.revisions_included} used
          </div>
        </div>
      </div>

      {/* Explicit Mutual Confidentiality NDA Panel */}
      <Card className={order.nda_accepted_at ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-border/80 bg-card/85'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck
              className={`h-4 w-4 shrink-0 ${
                order.nda_accepted_at ? 'text-emerald-500' : 'text-primary'
              }`}
            />
            <div>
              <div className="font-semibold">
                Confidentiality &amp; Mutual Non-Disclosure Agreement (NDA)
              </div>
              <div className="text-muted-foreground">
                {order.nda_accepted_at
                  ? `Executed cleanly on ${new Date(order.nda_accepted_at).toLocaleString()}.`
                  : 'All files, reports, and codebase assets are handled under strict NDA terms. Record explicit acceptance if required for procurement compliance.'}
              </div>
            </div>
          </div>
          {!order.nda_accepted_at && session.role === 'client' && (
            <ConfirmActionButton
              action={acceptOrderNdaAction}
              hiddenFields={{ order_id: order.id }}
              triggerLabel="Accept Mutual NDA"
              confirmTitle="Accept Mutual NDA Agreement?"
              confirmDescription="Records your authenticated consent timestamp to mutual non-disclosure terms for this engagement."
              confirmLabel="Sign & Accept NDA"
              successMessage="Mutual NDA executed."
            />
          )}
        </CardContent>
      </Card>

      {/* Rules of Engagement Signer (when requires_roe is true) */}
      {order.requires_roe && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              {order.roe_signed_at ? (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              )}
              Rules of Engagement &amp; Written Target Authorization
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {roeRecord ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="font-semibold">Authorized Signer</div>
                  <div className="text-muted-foreground">
                    {roeRecord.signer_full_name} ({roeRecord.signer_title || 'Authorized Representative'})
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-emerald-800 dark:text-emerald-300">
                    Signed {new Date(roeRecord.signed_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Authorized Targets</div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {(roeRecord.authorized_targets ?? []).join(', ')}
                  </div>
                  {(roeRecord.testing_window_start || roeRecord.testing_window_end) && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      Window: {roeRecord.testing_window_start ?? 'Immediate'} → {roeRecord.testing_window_end ?? 'Completion'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold">Emergency SOC Contact</div>
                  <div className="text-muted-foreground">
                    {roeRecord.emergency_contact_name} · {roeRecord.emergency_contact_phone}
                  </div>
                </div>
              </div>
            ) : (
              <ActionFeedbackForm
                action={signOrderRoeAction}
                successMessage="Rules of Engagement signed cleanly."
                className="space-y-3"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <p className="text-muted-foreground">
                  Before active penetration testing, vulnerability scanning, or forensic recovery begins, OWASP/PTES operational governance requires explicit written authorization of the target assets you own or control.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Authorized Domains / IPs / Repos (one per line) *</Label>
                    <Textarea
                      name="authorized_targets"
                      rows={3}
                      required
                      placeholder="app.example.com&#10;api.example.com&#10;203.0.113.0/28"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Out-of-Scope / Excluded Systems</Label>
                    <Textarea
                      name="excluded_systems"
                      rows={3}
                      placeholder="Third-party payment gateways, production ERP..."
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Testing Window Start (Optional)</Label>
                    <Input name="testing_window_start" type="date" className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Testing Window End (Optional)</Label>
                    <Input name="testing_window_end" type="date" className="h-9 font-mono text-xs" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex flex-col justify-end gap-1.5">
                    <Label className="mb-auto text-xs">Emergency Contact Name *</Label>
                    <Input name="emergency_contact_name" required className="h-9 text-xs" />
                  </div>
                  <div className="flex flex-col justify-end gap-1.5">
                    <Label className="mb-auto text-xs">Emergency Phone *</Label>
                    <Input name="emergency_contact_phone" required className="h-9 text-xs" />
                  </div>
                  <div className="flex flex-col justify-end gap-1.5">
                    <Label className="mb-auto text-xs">Your Full Legal Name *</Label>
                    <Input
                      name="signer_full_name"
                      defaultValue={session.fullName ?? ''}
                      required
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-1.5">
                    <Label className="mb-auto text-xs">Your Role / Title</Label>
                    <Input name="signer_title" placeholder="CTO / Founder" className="h-9 text-xs" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" name="ownership_attested" required className="rounded" />
                  I attest that I am legally authorized to grant testing/access permission for the targets listed above.
                </label>
                <Button type="submit" size="sm" className="gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Digitally Sign Rules of Engagement
                </Button>
              </ActionFeedbackForm>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 7 Cols */}
        <div className="space-y-6 lg:col-span-7">
          {/* Deliverables & Client Acceptance Sign-off */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Versioned Deliverables &amp; Acceptance Sign-Off ({deliverables.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliverables.map(
                (del: {
                  id: string;
                  code: string;
                  version_label: string;
                  title: string;
                  status: string;
                  release_notes: string | null;
                  auto_accept_at?: string | null;
                  vault_files?: Array<{ id: string; filename: string; size_bytes: number; sha256_checksum: string | null }>;
                }) => {
                  const files = Array.isArray(del.vault_files) ? del.vault_files : [];
                  return (
                    <div
                      key={del.id}
                      className="rounded-xl border border-border/70 bg-background/60 p-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{del.code}</span>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {del.version_label}
                          </Badge>
                          <span className="font-semibold">{del.title}</span>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {del.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      {del.auto_accept_at && del.status === 'submitted' && (
                        <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] text-amber-800 dark:text-amber-300">
                          <Clock className="h-3 w-3" />
                          Auto-accept deadline: {new Date(del.auto_accept_at).toLocaleDateString()}
                        </div>
                      )}

                      {del.release_notes && (
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {del.release_notes}
                        </p>
                      )}

                      {files.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {files.map((f) => (
                            <div
                              key={f.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="break-all font-mono font-medium">{f.filename}</div>
                                {f.sha256_checksum && (
                                  <div className="break-all font-mono text-[10px] text-muted-foreground">
                                    SHA-256: {f.sha256_checksum}
                                  </div>
                                )}
                              </div>
                              <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                                <a href={`/api/files/${f.id}/download`}>
                                  <Download className="h-3.5 w-3.5" />
                                  Download ({(f.size_bytes / 1024).toFixed(1)} KB)
                                </a>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {del.status === 'submitted' && (
                        <ActionFeedbackForm
                          action={reviewDeliverableClientAction}
                          successMessage="Deliverable review submitted."
                          className="mt-3 space-y-2 border-t border-border/60 pt-3"
                        >
                          <input type="hidden" name="deliverable_id" value={del.id} />
                          <input type="hidden" name="order_id" value={order.id} />
                          <Input
                            name="feedback"
                            placeholder="Optional sign-off note or specific revision feedback..."
                            className="h-9 text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="submit"
                              name="decision"
                              value="accepted"
                              size="sm"
                              className="h-9 gap-1.5 text-xs"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Accept Deliverable &amp; Sign Off
                            </Button>
                            <Button
                              type="submit"
                              name="decision"
                              value="revision_requested"
                              size="sm"
                              variant="outline"
                              disabled={order.revisions_used >= order.revisions_included}
                              className="h-9 gap-1.5 text-xs"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Request Revision ({Math.max(0, order.revisions_included - order.revisions_used)} left)
                            </Button>
                          </div>
                          {order.revisions_used >= order.revisions_included && (
                            <p className="text-[11px] text-muted-foreground">
                              All {order.revisions_included} included revision(s) used. Message us below to request a Paid Revision Addendum invoice.
                            </p>
                          )}
                        </ActionFeedbackForm>
                      )}
                    </div>
                  );
                }
              )}

              {deliverables.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No deliverables published yet. You will receive an instant notification as soon as v1.0 is uploaded.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Milestones & Visible Execution Checklist */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">
                Milestones &amp; Live Progress ({milestones.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {milestones.map(
                  (ms: { id: string; title: string; status: string; weight_percent: number }) => (
                    <div
                      key={ms.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3 text-xs"
                    >
                      <span className="font-semibold">{ms.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{ms.weight_percent}%</span>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {ms.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  )
                )}
              </div>

              {visibleTasks && visibleTasks.length > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="font-mono text-[11px] font-semibold uppercase text-muted-foreground">
                    Live Execution Tasks ({visibleTasks.filter((t) => t.is_completed).length}/{visibleTasks.length} Done)
                  </div>
                  {visibleTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          task.is_completed ? 'text-primary' : 'text-muted-foreground/40'
                        }`}
                      />
                      <span className={task.is_completed ? 'line-through text-muted-foreground' : ''}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Requirements Intake & Vault File Upload */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold">
                Project Requirements &amp; Technical Intake
              </CardTitle>
              {isReqLocked && (
                <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                  <Lock className="h-3 w-3" /> Verified &amp; Locked
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isReqLocked ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                  <div>
                    <strong>Target Scope Notes:</strong>{' '}
                    <span className="text-muted-foreground">{reqRecord?.target_scope_notes || '—'}</span>
                  </div>
                  <div>
                    <strong>Access Instructions:</strong>{' '}
                    <span className="text-muted-foreground">{reqRecord?.access_instructions || '—'}</span>
                  </div>
                </div>
              ) : (
                <ActionFeedbackForm
                  action={submitOrderRequirementsAction}
                  successMessage="Project requirements saved."
                  className="space-y-3"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="space-y-1">
                    <Label className="text-xs">Target Scope, Architecture &amp; Endpoints</Label>
                    <Textarea
                      name="target_scope_notes"
                      rows={3}
                      defaultValue={reqRecord?.target_scope_notes ?? ''}
                      placeholder="Provide target URLs, repo links, staging environments, or business requirements..."
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Secure Access / Testing Instructions</Label>
                    <Textarea
                      name="access_instructions"
                      rows={2}
                      defaultValue={reqRecord?.access_instructions ?? ''}
                      placeholder="Test account roles, VPN/IP whitelisting notes (do not paste raw production secrets in plain text)..."
                      className="text-xs"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Save Project Requirements
                  </Button>
                </ActionFeedbackForm>
              )}

              {/* Attached Requirement Scope Files */}
              {requirementAttachments && requirementAttachments.length > 0 && (
                <div className="space-y-1.5 border-t border-border/60 pt-3 text-xs">
                  <div className="font-semibold">Uploaded Intake Documents</div>
                  {requirementAttachments.map((vf) => (
                    <div key={vf.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5">
                      <span className="truncate font-mono">{vf.filename}</span>
                      <a
                        href={`/api/files/${vf.id}/download`}
                        className="font-mono text-primary hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {!isReqLocked && (
                <ActionFeedbackForm
                  action={attachOrderRequirementFileAction}
                  successMessage="Requirement document uploaded to Vault."
                  resetOnSuccess
                  className="space-y-2 border-t border-border/60 pt-3"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <R2FileUploader
                    category="requirement_attachment"
                    orderId={order.id}
                    label="Attach Architecture Diagram / OpenAPI Spec / Test Credentials Doc"
                  />
                  <Button type="submit" size="sm" variant="outline" className="rounded-full text-xs">
                    Upload Scope File
                  </Button>
                </ActionFeedbackForm>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 5 Cols */}
        <div className="space-y-6 lg:col-span-5">
          <OrderLiveChatServer
            orderId={order.id}
            orderCode={order.code ?? 'ORD-XXXX'}
            orderTitle={order.title}
            orderStatus={order.status}
            viewerId={session.userId}
            viewerRole={session.role === 'admin' ? 'admin' : 'client'}
          />

          {/* Client Review & Testimonial */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Star className="h-4 w-4 text-amber-500" />
                Engagement Feedback &amp; Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.status !== 'completed' && !existingReview ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Engagement reviews unlock automatically once all deliverables are accepted and the order is marked completed.
                </p>
              ) : (
                <ActionFeedbackForm
                  action={submitClientReviewAction}
                  successMessage={existingReview ? 'Engagement review updated.' : 'Engagement review submitted.'}
                  className="space-y-3"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Overall Rating (1 to 5 Stars)</Label>
                    <select
                      name="rating_overall"
                      aria-label="Overall rating"
                      defaultValue={String(existingReview?.rating_overall ?? 5)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="5">★★★★★ (5/5 — Exceptional)</option>
                      <option value="4">★★★★☆ (4/5 — Very Good)</option>
                      <option value="3">★★★☆☆ (3/5 — Satisfactory)</option>
                      <option value="2">★★☆☆☆ (2/5 — Subpar)</option>
                      <option value="1">★☆☆☆☆ (1/5 — Poor)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Headline</Label>
                    <Input
                      name="headline"
                      defaultValue={existingReview?.headline ?? ''}
                      placeholder="Thorough VAPT audit and fast remediation support"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Written Review *</Label>
                    <Textarea
                      name="review_text"
                      rows={3}
                      required
                      defaultValue={existingReview?.review_text ?? ''}
                      placeholder="Share your experience working on this engagement..."
                      className="text-xs"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="w-full">
                    {existingReview ? 'Update Review' : 'Submit Engagement Review'}
                  </Button>
                </ActionFeedbackForm>
              )}
            </CardContent>
          </Card>

          {/* Cancellation Request Panel */}
          {(canRequestCancellation || (cancellationHistory && cancellationHistory.length > 0)) && (
            <Card className="border-border/80 bg-card/85">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  Order Cancellation / Scope Hold
                </CardTitle>
                <CardDescription className="text-xs">
                  Need to cancel or pause this contract? Submit a formal request for review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {(cancellationHistory ?? []).map((req) => (
                  <div key={req.id} className="rounded-lg border border-border/70 p-2.5">
                    <div className="flex items-center justify-between">
                      <Badge variant={req.status === 'pending' ? 'destructive' : 'outline'} className="font-mono text-[10px]">
                        {req.status}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1">{req.reason}</p>
                    {req.resolution_notes && (
                      <p className="mt-1 text-muted-foreground">Note: {req.resolution_notes}</p>
                    )}
                  </div>
                ))}

                {canRequestCancellation && (
                  <ActionFeedbackForm
                    action={submitCancellationRequestAction}
                    successMessage="Cancellation request sent for admin review."
                    resetOnSuccess
                    className="space-y-2.5"
                  >
                    <input type="hidden" name="order_id" value={order.id} />
                    <Textarea
                      name="reason"
                      required
                      minLength={5}
                      rows={2}
                      placeholder="Reason for requesting order cancellation..."
                      className="text-xs"
                    />
                    <Button type="submit" size="sm" variant="outline" className="w-full text-xs text-destructive hover:text-destructive">
                      Request Order Cancellation
                    </Button>
                  </ActionFeedbackForm>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
