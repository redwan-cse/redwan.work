import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  reviewDeliverableClientAction,
  signOrderRoeAction,
  submitClientReviewAction,
  submitOrderRequirementsAction,
} from '@/lib/crm/actions';
import { ContractLiveChat } from '@/components/panel/contract-live-chat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const { data: order } = await admin
    .from('orders')
    .select(
      '*, order_milestones(*), order_requirements(*), engagement_authorizations(*), deliverables(*, vault_files(*)), order_messages(*, author:profiles!order_messages_author_id_fkey(full_name, email, role)), client_reviews(*)'
    )
    .eq('id', id)
    .maybeSingle();

  if (!order || (session.role !== 'admin' && order.client_id !== session.userId)) {
    notFound();
  }

  const milestones = Array.isArray(order.order_milestones) ? order.order_milestones : [];
  const deliverables = Array.isArray(order.deliverables) ? order.deliverables : [];
  const messages = (Array.isArray(order.order_messages) ? order.order_messages : []).filter(
    (m: { is_internal_note?: boolean }) => !m.is_internal_note
  );
  const reqRecord = Array.isArray(order.order_requirements)
    ? order.order_requirements[0]
    : order.order_requirements;
  const roeRecord = Array.isArray(order.engagement_authorizations)
    ? order.engagement_authorizations[0]
    : order.engagement_authorizations;
  const existingReview = Array.isArray(order.client_reviews)
    ? order.client_reviews[0]
    : order.client_reviews;

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

      {/* C|EH Rules of Engagement Signer (when requires_roe is true) */}
      {order.requires_roe && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              {order.roe_signed_at ? (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              )}
              C|EH Rules of Engagement & Written Target Authorization
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
                  <div className="mt-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                    Signed {new Date(roeRecord.signed_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Authorized Targets</div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {(roeRecord.authorized_targets ?? []).join(', ')}
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Emergency SOC Contact</div>
                  <div className="text-muted-foreground">
                    {roeRecord.emergency_contact_name} • {roeRecord.emergency_contact_phone}
                  </div>
                </div>
              </div>
            ) : (
              <form action={signOrderRoeAction} className="space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <p className="text-muted-foreground">
                  Before active penetration testing, vulnerability scanning, or forensic recovery begins, EC-Council C|EH compliance requires explicit written authorization of the target assets you own or control.
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
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Name *</Label>
                    <Input name="emergency_contact_name" required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Phone *</Label>
                    <Input name="emergency_contact_phone" required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Your Full Legal Name *</Label>
                    <Input
                      name="signer_full_name"
                      defaultValue={session.fullName ?? ''}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Your Role / Title</Label>
                    <Input name="signer_title" placeholder="CTO / Founder" className="h-8 text-xs" />
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
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Deliverables, Milestones & Requirements */}
        <div className="space-y-6 lg:col-span-7">
          {/* Deliverables & Client Acceptance Sign-off */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Versioned Deliverables & Acceptance Sign-Off ({deliverables.length})
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
                  client_feedback: string | null;
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
                              <div>
                                <div className="font-mono font-medium">{f.filename}</div>
                                {f.sha256_checksum && (
                                  <div className="font-mono text-[10px] text-muted-foreground">
                                    SHA-256: {f.sha256_checksum.slice(0, 24)}…
                                  </div>
                                )}
                              </div>
                              <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
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
                        <form
                          action={reviewDeliverableClientAction}
                          className="mt-3 space-y-2 border-t border-border/60 pt-3"
                        >
                          <input type="hidden" name="deliverable_id" value={del.id} />
                          <input type="hidden" name="order_id" value={order.id} />
                          <Input
                            name="feedback"
                            placeholder="Optional sign-off note or specific revision feedback..."
                            className="h-8 text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="submit"
                              name="decision"
                              value="accepted"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Accept Deliverable & Sign Off
                            </Button>
                            <Button
                              type="submit"
                              name="decision"
                              value="revision_requested"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Request Revision
                            </Button>
                          </div>
                        </form>
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

          {/* Milestones */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">
                Execution Milestones ({milestones.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
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
            </CardContent>
          </Card>

          {/* Project Requirements Intake */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">
                Project Requirements & Technical Intake
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitOrderRequirementsAction} className="space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <div className="space-y-1">
                  <Label className="text-xs">Target Scope, Architecture & Endpoints</Label>
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
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right 5 Cols: Order Chat & Client Review */}
        <div className="space-y-6 lg:col-span-5">
          <ContractLiveChat
            viewerId={session.userId}
            viewerRole={session.role === 'admin' ? 'admin' : 'client'}
            contracts={[
              {
                id: order.id,
                code: order.code,
                title: order.title,
                status: order.status,
              },
            ]}
          />

          {/* Client Review & Testimonial */}
          <Card className="border-border/80 bg-card/85">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Star className="h-4 w-4 text-amber-500" />
                Engagement Feedback & Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitClientReviewAction} className="space-y-3">
                <input type="hidden" name="order_id" value={order.id} />
                <div className="space-y-1">
                  <Label className="text-xs">Overall Rating (1 to 5 Stars)</Label>
                  <select
                    name="rating_overall"
                    defaultValue={String(existingReview?.rating_overall ?? 5)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="5">★★★★★ (5/5 — Exceptional)</option>
                    <option value="4">★★★★☆ (4/5 — Very Good)</option>
                    <option value="3">★★★☆☆ (3/5 — Satisfactory)</option>
                    <option value="2">★★☆☆☆ (2/5 — Subpar)</option>
                    <option value="1">★☆☆☆☆ (1/5 — Poor)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Headline</Label>
                  <Input
                    name="headline"
                    defaultValue={existingReview?.headline ?? ''}
                    placeholder="Thorough VAPT audit and fast remediation support"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
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
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
