import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  acceptProposalClientAction,
  declineProposalClientAction,
} from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { SERVICE_PILLARS, type ServicePillarKey } from '@/lib/content/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function ClientProposalsPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/proposals');

  const admin = getSupabaseAdmin();
  const [{ data: proposals }, { data: proposalOrders }] = await Promise.all([
    admin
      .from('proposals')
      .select(
        'id, code, title, pillar, scope_summary, status, requires_roe, estimated_days, deposit_percent, total_cents, currency, valid_until, accepted_at, decline_reason, created_at, proposal_milestones(id, title, description, amount_cents, weight_percent, due_days_offset)'
      )
      .eq('client_id', session.userId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false }),
    admin
      .from('orders')
      .select('id, proposal_id')
      .eq('client_id', session.userId)
      .not('proposal_id', 'is', null),
  ]);

  const orderIdByProposalId = new Map(
    (proposalOrders ?? [])
      .filter((o) => Boolean(o.proposal_id))
      .map((o) => [o.proposal_id as string, o.id])
  );
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Custom Proposals</h1>
        <p className="text-sm text-muted-foreground">
          Review tailored scopes of work from Md Redwan Ahmed. Accepting a proposal automatically launches your order workspace and kickoff deposit invoice.
        </p>
      </div>

      <div className="space-y-4">
        {(proposals ?? []).map((prp) => {
          const pillarMeta = SERVICE_PILLARS[prp.pillar as ServicePillarKey];
          const isExpired = Boolean(prp.valid_until && prp.valid_until < todayIso);
          const canRespond = (prp.status === 'sent' || prp.status === 'viewed') && !isExpired;
          const convertedOrderId = orderIdByProposalId.get(prp.id) ?? null;
          const items = Array.isArray(prp.proposal_milestones) ? prp.proposal_milestones : [];

          return (
            <Card key={prp.id} className="border-border/80 bg-card/85">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/portal/proposals/${prp.id}`}
                      className="inline-flex min-h-6 items-center font-mono text-xs font-bold text-primary hover:underline"
                    >
                      {prp.code}
                    </Link>
                    <Badge
                      variant={prp.status === 'declined' || isExpired ? 'destructive' : 'outline'}
                      className="font-mono text-[10px] uppercase"
                    >
                      {isExpired && (prp.status === 'sent' || prp.status === 'viewed') ? 'expired' : prp.status}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {pillarMeta?.shortLabel ?? prp.pillar}
                    </Badge>
                    {prp.requires_roe && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-800 dark:text-amber-300"
                      >
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        Requires Signed RoE
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-lg font-extrabold">
                    {prp.currency} {(prp.total_cents / 100).toLocaleString()}
                  </div>
                </div>
                <CardTitle className="mt-2 text-lg font-bold">
                  <Link href={`/portal/proposals/${prp.id}`} className="inline-flex min-h-6 items-center hover:text-primary">
                    {prp.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {prp.scope_summary}
                </p>

                {prp.decline_reason && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Decline feedback: {prp.decline_reason}
                  </p>
                )}

                {items.length > 0 && (
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3.5">
                    <div className="mb-2 font-mono text-[11px] font-semibold uppercase text-muted-foreground">
                      Deliverable Line Items &amp; Milestones
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between border-b border-border/40 pb-2 text-xs last:border-0 last:pb-0"
                        >
                          <div>
                            <div className="font-semibold">{item.title}</div>
                            {item.description && (
                              <div className="text-[11px] text-muted-foreground">
                                {item.description}
                              </div>
                            )}
                          </div>
                          <div className="font-mono font-semibold">
                            {prp.currency} {((item.amount_cents ?? 0) / 100).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-4">
                    <span>Estimated Delivery: {prp.estimated_days} days</span>
                    <span>Kickoff Deposit: {prp.deposit_percent}%</span>
                    {prp.valid_until && (
                      <span>
                        Valid Until: {new Date(prp.valid_until).toLocaleDateString()}
                      </span>
                    )}
                    <Link
                      href={`/portal/proposals/${prp.id}`}
                      className="inline-flex min-h-6 items-center font-semibold text-primary hover:underline"
                    >
                      Open Full Brief →
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {convertedOrderId && (
                      <Button asChild size="sm" variant="secondary" className="text-xs">
                        <Link href={`/portal/orders/${convertedOrderId}`}>
                          Open Order Workspace →
                        </Link>
                      </Button>
                    )}

                    {canRespond && (
                      <>
                        <ConfirmActionButton
                          action={declineProposalClientAction}
                          hiddenFields={{ proposal_id: prp.id }}
                          triggerLabel="Decline"
                          confirmTitle={`Decline proposal ${prp.code}?`}
                          confirmDescription="Optionally share feedback (e.g., timeline or budget adjustment) so we can revise the quote."
                          confirmLabel="Decline Proposal"
                          successMessage="Proposal declined."
                          destructive
                          variant="outline"
                          extraContent={
                            <div className="space-y-1">
                              <Label htmlFor={`proposal-decline-${prp.id}`} className="text-xs">Reason / Feedback (Optional)</Label>
                              <Textarea
                                id={`proposal-decline-${prp.id}`}
                                name="decline_reason"
                                rows={3}
                                placeholder="Budget target, timing shift, or different scope needed..."
                                className="text-base md:text-xs"
                              />
                            </div>
                          }
                        />

                        <ActionFeedbackForm action={acceptProposalClientAction}>
                          <input type="hidden" name="proposal_id" value={prp.id} />
                          <Button type="submit" size="sm" className="gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Accept Proposal &amp; Start Order
                          </Button>
                        </ActionFeedbackForm>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(proposals ?? []).length === 0 && (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">No custom proposals yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                When you request a custom quote or enterprise scope, your itemized proposal will appear here for 1-click acceptance.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
