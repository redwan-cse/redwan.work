import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Inbox, ShieldCheck, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  inviteOrProvisionClientAction,
  updateInquiryStatusAction,
} from '@/lib/crm/actions';

export const dynamic = 'force-dynamic';

export default async function AdminInquiriesPage() {
  const admin = getSupabaseAdmin();
  const { data: inquiries } = await admin
    .from('inquiries')
    .select(
      'id, code, ticket_number, name, email, company, country, whatsapp_e164, services, service_pillar, project_summary, budget_min, budget_max, nda_required, urgency, status, consent_policy_version, created_at, converted_client_id, attachments:inquiry_attachments(id, filename, mime, size_bytes, r2_key)'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
            <Inbox className="h-3.5 w-3.5" />
            LEAD &amp; INQUIRY TRIAGE
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">Service Inquiries (`INQ-XXXX`)</h1>
          <p className="text-sm text-muted-foreground">
            Review incoming requests, verify GDPR/Data consent evidence, and convert leads into Portal Clients or Proposals in one click.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/admin/proposals">Build Custom Proposal</Link>
        </Button>
      </div>

      <div className="space-y-4">
        {inquiries && inquiries.length > 0 ? (
          inquiries.map((inq) => (
            <Card key={inq.id} className="border-border/80">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">
                      {inq.code ?? `INQ-${inq.ticket_number}`}
                    </span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {inq.status}
                    </Badge>
                    {inq.service_pillar && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {inq.service_pillar}
                      </Badge>
                    )}
                    {inq.nda_required && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-xs text-primary">
                        <ShieldCheck className="h-3 w-3" />
                        NDA Requested
                      </Badge>
                    )}
                    {inq.urgency && (
                      <Badge variant="outline" className="font-mono text-xs">
                        Urgency: {inq.urgency}
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true })}
                  </span>
                </div>
                <CardTitle className="mt-2 text-xl">
                  {inq.name}{' '}
                  {inq.company ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({inq.company})
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                  <span>Email: {inq.email}</span>
                  {inq.whatsapp_e164 && <span>WhatsApp: {inq.whatsapp_e164}</span>}
                  {inq.country && <span>Country: {inq.country}</span>}
                  {(inq.budget_min || inq.budget_max) && (
                    <span>
                      Budget: ${inq.budget_min ?? 0} – ${inq.budget_max ?? 'Open'} USD
                    </span>
                  )}
                  {inq.consent_policy_version && (
                    <span>Consent: {inq.consent_policy_version}</span>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {Array.isArray(inq.services) && inq.services.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">Requested Services:</span>
                    {inq.services.map((svc: string) => (
                      <Badge key={svc} variant="outline" className="text-[11px]">
                        {svc}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {inq.project_summary}
                </div>

                {Array.isArray(inq.attachments) && inq.attachments.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="font-mono text-[11px] font-semibold text-muted-foreground">
                      Attached Scope Documents ({inq.attachments.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {inq.attachments.map(
                        (att: {
                          id: string;
                          filename: string;
                          mime: string;
                          size_bytes: number;
                          r2_key: string;
                        }) => (
                          <div
                            key={att.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1 font-mono text-xs"
                          >
                            <span>{att.filename}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({(att.size_bytes / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                  {/* Update Status Form */}
                  <form action={updateInquiryStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="inquiry_id" value={inq.id} />
                    <select
                      name="status"
                      defaultValue={inq.status}
                      className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
                    >
                      <option value="new">new</option>
                      <option value="reviewing">reviewing</option>
                      <option value="proposal_sent">proposal_sent</option>
                      <option value="converted">converted</option>
                      <option value="archived">archived</option>
                    </select>
                    <Button type="submit" variant="outline" size="sm" className="h-9 text-xs">
                      Save Status
                    </Button>
                  </form>

                  {/* 1-Click Provision Client Account */}
                  <div className="flex flex-wrap items-center gap-2">
                    {inq.converted_client_id ? (
                      <Button asChild variant="secondary" size="sm" className="rounded-full text-xs">
                        <Link href={`/admin/clients/${inq.converted_client_id}`}>
                          View Client Profile →
                        </Link>
                      </Button>
                    ) : (
                      <form action={inviteOrProvisionClientAction}>
                        <input type="hidden" name="inquiry_id" value={inq.id} />
                        <input type="hidden" name="email" value={inq.email} />
                        <input type="hidden" name="full_name" value={inq.name} />
                        <input type="hidden" name="company" value={inq.company ?? ''} />
                        <input type="hidden" name="tier" value="standard" />
                        <Button type="submit" size="sm" className="gap-1.5 rounded-full text-xs">
                          <UserPlus className="h-3.5 w-3.5" />
                          Convert &amp; Invite to Portal
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No inquiries submitted yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
