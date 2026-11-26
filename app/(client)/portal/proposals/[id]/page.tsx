import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  acceptProposalClientAction,
  declineProposalClientAction,
} from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function ClientProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/proposals');

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: proposal }, { data: milestones }, { data: convertedOrder }] = await Promise.all([
    admin.from('proposals').select('*').eq('id', id).maybeSingle(),
    admin.from('proposal_milestones').select('*').eq('proposal_id', id).order('position'),
    admin.from('orders').select('id').eq('proposal_id', id).maybeSingle(),
  ]);

  if (
    !proposal ||
    proposal.status === 'draft' ||
    (session.role !== 'admin' && proposal.client_id !== session.userId)
  ) {
    notFound();
  }

  let effectiveStatus = proposal.status;
  if (session.role === 'client' && proposal.status === 'sent') {
    const { error: viewErr } = await admin
      .from('proposals')
      .update({ status: 'viewed' })
      .eq('id', proposal.id)
      .eq('status', 'sent');
    if (!viewErr) {
      effectiveStatus = 'viewed';
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const isExpired =
    (effectiveStatus === 'sent' || effectiveStatus === 'viewed') &&
    Boolean(proposal.valid_until && proposal.valid_until < todayIso);
  const canRespond = (effectiveStatus === 'sent' || effectiveStatus === 'viewed') && !isExpired;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/portal/proposals"
            className="inline-flex min-h-6 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Proposals
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-primary">{proposal.code}</span>
            <Badge
              variant={effectiveStatus === 'declined' || isExpired ? 'destructive' : 'outline'}
              className="font-mono text-xs uppercase"
            >
              {isExpired && (effectiveStatus === 'sent' || effectiveStatus === 'viewed') ? 'expired' : effectiveStatus}
            </Badge>
            {proposal.requires_roe && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-800 dark:text-amber-300">
                <ShieldAlert className="mr-1 h-3 w-3" />
                Requires Signed RoE
              </Badge>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{proposal.title}</h1>
        </div>

        <div className="text-right font-mono">
          <div className="text-2xl font-extrabold">
            {proposal.currency} {(proposal.total_cents / 100).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            {proposal.deposit_percent}% kickoff deposit · {proposal.estimated_days}d estimate
          </div>
        </div>
      </div>

      {proposal.decline_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-xs text-destructive">
            <strong>Decline Feedback Submitted:</strong> {proposal.decline_reason}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Scope Summary &amp; Deliverables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs leading-relaxed">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 whitespace-pre-wrap">
              {proposal.scope_summary}
            </div>
            {proposal.deliverables_summary && (
              <div>
                <div className="mb-1.5 font-semibold">Included Deliverables:</div>
                <div className="rounded-xl border border-border/70 bg-card p-4 whitespace-pre-wrap text-muted-foreground">
                  {proposal.deliverables_summary}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Milestone Payment Schedule</CardTitle>
            <CardDescription className="text-xs">
              Includes {proposal.revisions_included} revision round(s).
              {proposal.valid_until ? ` Valid until ${proposal.valid_until}.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {(milestones ?? []).map((ms) => (
              <div
                key={ms.id}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-3"
              >
                <div>
                  <div className="font-semibold">{ms.title}</div>
                  {ms.description && <div className="text-muted-foreground">{ms.description}</div>}
                </div>
                <span className="font-mono font-bold text-primary">
                  {proposal.currency} {(ms.amount_cents / 100).toLocaleString()}
                </span>
              </div>
            ))}

            {convertedOrder && (
              <Button asChild className="w-full rounded-full">
                <Link href={`/portal/orders/${convertedOrder.id}`}>
                  Open Converted Order Workspace →
                </Link>
              </Button>
            )}

            {canRespond && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <ActionFeedbackForm action={acceptProposalClientAction}>
                  <input type="hidden" name="proposal_id" value={proposal.id} />
                  <Button type="submit" className="w-full gap-1.5 rounded-full">
                    <CheckCircle2 className="h-4 w-4" />
                    Accept Proposal &amp; Start Order
                  </Button>
                </ActionFeedbackForm>

                <ConfirmActionButton
                  action={declineProposalClientAction}
                  hiddenFields={{ proposal_id: proposal.id }}
                  triggerLabel="Decline Proposal"
                  confirmTitle={`Decline ${proposal.code}?`}
                  confirmDescription="Share optional feedback so we can tailor an updated quote if needed."
                  confirmLabel="Confirm Decline"
                  successMessage="Proposal declined."
                  destructive
                  variant="outline"
                  className="w-full rounded-full"
                  extraContent={
                    <div className="space-y-1">
                      <Label htmlFor="proposal-decline-reason" className="text-sm">Feedback (Optional)</Label>
                      <Textarea
                        id="proposal-decline-reason"
                        name="decline_reason"
                        rows={3}
                        placeholder="Budget constraints, scope shift, or timeline adjustment..."
                      />
                    </div>
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
