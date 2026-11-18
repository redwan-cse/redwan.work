import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { requireAdminSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendDraftProposalAction } from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminSession();
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: proposal }, { data: milestones }, { data: convertedOrder }] = await Promise.all([
    admin.from('proposals').select('*').eq('id', id).maybeSingle(),
    admin.from('proposal_milestones').select('*').eq('proposal_id', id).order('position'),
    admin.from('orders').select('id').eq('proposal_id', id).maybeSingle(),
  ]);

  if (!proposal) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/admin/pipeline?tab=proposals"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Proposals Pipeline
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="font-mono text-base font-bold text-primary">
              {proposal.code ?? proposal.id.slice(0, 8)}
            </span>
            <Badge
              variant={proposal.status === 'declined' ? 'destructive' : 'outline'}
              className="font-mono text-[10px]"
            >
              {proposal.status}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {proposal.pillar}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{proposal.title}</h1>
          <p className="text-xs text-muted-foreground">
            Recipient: {proposal.recipient_name} ({proposal.recipient_email}) ·{' '}
            {formatMoney(proposal.total_cents, proposal.currency)} ({proposal.deposit_percent}% deposit)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {proposal.status === 'draft' && (
            <ActionFeedbackForm
              action={sendDraftProposalAction}
              successMessage="Proposal sent to client."
            >
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <Button type="submit" size="sm" className="rounded-full text-xs">
                Send Draft to Client
              </Button>
            </ActionFeedbackForm>
          )}
          {convertedOrder && (
            <Button asChild size="sm" className="gap-1.5 rounded-full text-xs">
              <Link href={`/admin/orders/${convertedOrder.id}`}>
                Open Converted Order <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {proposal.decline_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-xs text-destructive">
            <strong>Client Decline Feedback:</strong> {proposal.decline_reason}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Executive Scope &amp; Deliverables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs leading-relaxed">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 whitespace-pre-wrap">
              {proposal.scope_summary}
            </div>
            {proposal.deliverables_summary && (
              <div>
                <div className="mb-1.5 font-semibold text-foreground">Deliverables Included:</div>
                <div className="rounded-xl border border-border/70 bg-card p-3.5 whitespace-pre-wrap text-muted-foreground">
                  {proposal.deliverables_summary}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Milestone Schedule ({milestones?.length ?? 0})</CardTitle>
            <CardDescription className="text-xs">
              Est. delivery: {proposal.estimated_days} days · Revisions included: {proposal.revisions_included}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            {(milestones ?? []).map((ms) => (
              <div
                key={ms.id}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5"
              >
                <div>
                  <div className="font-semibold">{ms.title}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    +{ms.due_days_offset ?? 7}d target
                  </div>
                </div>
                <span className="font-mono font-bold text-primary">
                  {formatMoney(ms.amount_cents, proposal.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
