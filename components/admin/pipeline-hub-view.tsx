import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  Inbox,
  Send,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { AdminPagination, paginateItems } from '@/components/admin/admin-pagination';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ProposalMilestonesEditor } from '@/components/admin/proposal-milestones-editor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormCheckbox } from '@/components/ui/form-checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createProposalAction,
  inviteOrProvisionClientAction,
  sendDraftProposalAction,
  updateInquiryStatusAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export async function PipelineHubView({
  activeTab,
  inquiryId,
  statusFilter = '',
  pageParam,
  basePath = '/admin/pipeline',
}: {
  activeTab: 'inquiries' | 'proposals';
  inquiryId?: string;
  statusFilter?: string;
  pageParam?: string;
  basePath?: string;
}) {
  const admin = getSupabaseAdmin();

  let inquiriesQuery = admin
    .from('inquiries')
    .select(
      'id, code, ticket_number, name, email, company, country, whatsapp_e164, services, service_pillar, project_summary, budget_min, budget_max, nda_required, urgency, status, consent_policy_version, created_at, converted_client_id, attachments:inquiry_attachments(id, filename, mime, size_bytes, r2_key)'
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (activeTab === 'inquiries' && statusFilter) {
    inquiriesQuery = inquiriesQuery.eq('status', statusFilter);
  }

  let proposalsQuery = admin
    .from('proposals')
    .select(
      'id, code, recipient_name, recipient_email, title, pillar, total_cents, currency, deposit_percent, requires_roe, status, decline_reason, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (activeTab === 'proposals' && statusFilter) {
    proposalsQuery = proposalsQuery.eq('status', statusFilter);
  }

  const [
    { data: inquiries },
    { data: proposals },
    { count: newInqExactCount },
    { count: openPropExactCount },
    { data: clients },
    prefillInquiryRes,
  ] = await Promise.all([
    inquiriesQuery,
    proposalsQuery,
    admin.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    admin
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'sent', 'viewed']),
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
    inquiryId
      ? admin
          .from('inquiries')
          .select(
            'id, name, email, company, service_pillar, project_summary, budget_max, nda_required, converted_client_id'
          )
          .eq('id', inquiryId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const prefill = prefillInquiryRes.data;
  const sortedInquiries = [...(inquiries ?? [])];
  if (activeTab === 'inquiries' && inquiryId) {
    const idx = sortedInquiries.findIndex((i) => i.id === inquiryId);
    if (idx > 0) {
      const [found] = sortedInquiries.splice(idx, 1);
      sortedInquiries.unshift(found);
    }
  }
  const pagedInquiries = paginateItems(sortedInquiries, activeTab === 'inquiries' ? pageParam : undefined, 15);
  const pagedProposals = paginateItems(proposals ?? [], activeTab === 'proposals' ? pageParam : undefined, 20);

  const proposalIds = pagedProposals.items.map((p) => p.id);
  const { data: proposalOrders } =
    proposalIds.length > 0
      ? await admin.from('orders').select('id, proposal_id').in('proposal_id', proposalIds)
      : { data: [] as Array<{ id: string; proposal_id: string | null }> };
  const orderIdByProposalId = new Map(
    (proposalOrders ?? [])
      .filter((o) => Boolean(o.proposal_id))
      .map((o) => [o.proposal_id as string, o.id])
  );
  const newInqCount = newInqExactCount ?? 0;
  const openPropCount = openPropExactCount ?? 0;

  const tabs = [
    {
      id: 'inquiries',
      label: 'Service Inquiries (INQ)',
      href: basePath === '/admin/inquiries' ? '/admin/inquiries' : '/admin/pipeline?tab=inquiries',
      count: newInqCount,
    },
    {
      id: 'proposals',
      label: 'Proposals & Quotations (PRP)',
      href: basePath === '/admin/proposals' ? '/admin/proposals' : '/admin/pipeline?tab=proposals',
      count: openPropCount,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="COMMERCIAL PIPELINE HUB"
        title="Leads, Inquiries & Scope Proposals"
        description="Triage inbound service requests, verify consent & scope attachments, and issue multi-milestone fixed-price proposals with one-click order conversion."
        tabs={tabs}
        activeTab={activeTab}
      />

      {activeTab === 'inquiries' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">
              Showing {pagedInquiries.totalItems} inquiry record(s)
              {statusFilter ? ` · status: ${statusFilter}` : ` (${newInqCount} new)`}
            </span>
            <form method="get" className="flex items-center gap-2">
              {basePath !== '/admin/inquiries' && <input type="hidden" name="tab" value="inquiries" />}
              <select
                name="status"
                aria-label="Filter inquiries by status"
                defaultValue={statusFilter}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-base font-sans transition-colors hover:border-muted-foreground/45"
              >
                <option value="">All Statuses</option>
                <option value="new">new</option>
                <option value="reviewing">reviewing</option>
                <option value="proposal_sent">proposal_sent</option>
                <option value="converted">converted</option>
                <option value="archived">archived</option>
              </select>
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                Filter
              </Button>
            </form>
          </div>
          {pagedInquiries.items.length > 0 ? (
            pagedInquiries.items.map((inq) => (
              <Card
                key={inq.id}
                className={
                  inquiryId && inq.id === inquiryId
                    ? 'border-primary/60 ring-1 ring-primary/30'
                    : 'border-border/80'
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {inq.code ?? `INQ-${inq.ticket_number}`}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {inq.status}
                      </Badge>
                      {inq.service_pillar && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {inq.service_pillar}
                        </Badge>
                      )}
                      {inq.nda_required && (
                        <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
                          <ShieldCheck className="h-3 w-3" />
                          NDA Requested
                        </Badge>
                      )}
                      {inq.urgency && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {inq.urgency}
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <CardTitle className="mt-1.5 text-lg">
                    {inq.name}{' '}
                    {inq.company ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({inq.company})
                      </span>
                    ) : null}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                    <span>Email: {inq.email}</span>
                    {inq.whatsapp_e164 && <span>WhatsApp: {inq.whatsapp_e164}</span>}
                    {inq.country && <span>Country: {inq.country}</span>}
                    {(inq.budget_min || inq.budget_max) && (
                      <span>
                        Budget: ${inq.budget_min ?? 0}–${inq.budget_max ?? 'Open'} USD
                      </span>
                    )}
                    {inq.consent_policy_version && (
                      <span>Consent: {inq.consent_policy_version}</span>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {Array.isArray(inq.services) && inq.services.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {inq.services.map((svc: string) => (
                        <Badge key={svc} variant="outline" className="text-[10px]">
                          {svc}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs leading-relaxed whitespace-pre-wrap">
                    {inq.project_summary}
                  </div>

                  {Array.isArray(inq.attachments) && inq.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {inq.attachments.map(
                        (att: {
                          id: string;
                          filename: string;
                          mime: string;
                          size_bytes: number;
                        }) => (
                          <a
                            key={att.id}
                            href={`/api/files/${att.id}/download`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 font-mono text-[11px] text-primary hover:bg-muted/50 hover:underline"
                          >
                            <Download className="h-3 w-3 shrink-0" />
                            <span className="break-all">{att.filename}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({(att.size_bytes / 1024).toFixed(1)} KB)
                            </span>
                          </a>
                        )
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                    <ActionFeedbackForm
                      action={updateInquiryStatusAction}
                      successMessage="Inquiry status updated."
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="inquiry_id" value={inq.id} />
                      <select
                        name="status"
                        aria-label="Update inquiry status"
                        defaultValue={inq.status}
                        className="h-9 rounded-md border border-input bg-background px-2.5 text-base font-sans transition-colors hover:border-muted-foreground/45"
                      >
                        <option value="new">new</option>
                        <option value="reviewing">reviewing</option>
                        <option value="proposal_sent">proposal_sent</option>
                        <option value="converted">converted</option>
                        <option value="archived">archived</option>
                      </select>
                      <Button type="submit" variant="outline" size="sm" className="h-8 text-xs">
                        Save Status
                      </Button>
                    </ActionFeedbackForm>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="outline" size="sm" className="h-8 gap-1 rounded-full text-xs">
                        <Link href={`/admin/pipeline?tab=proposals&inquiry_id=${inq.id}`}>
                          <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                          Build Proposal
                        </Link>
                      </Button>

                      {inq.converted_client_id ? (
                        <Button asChild variant="secondary" size="sm" className="h-8 rounded-full text-xs">
                          <Link href={`/admin/clients/${inq.converted_client_id}`}>
                            View Client →
                          </Link>
                        </Button>
                      ) : (
                        <ActionFeedbackForm
                          action={inviteOrProvisionClientAction}
                          successMessage="Client portal invite issued."
                        >
                          <input type="hidden" name="inquiry_id" value={inq.id} />
                          <input type="hidden" name="email" value={inq.email} />
                          <input type="hidden" name="full_name" value={inq.name} />
                          <input type="hidden" name="company" value={inq.company ?? ''} />
                          <input type="hidden" name="tier" value="standard" />
                          <Button type="submit" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                            <UserPlus className="h-3.5 w-3.5" />
                            Convert &amp; Invite to Portal
                          </Button>
                        </ActionFeedbackForm>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Inbox className="h-6 w-6 text-muted-foreground/60" />
                <span>
                  {statusFilter
                    ? 'No inquiries match the selected status filter.'
                    : 'No service inquiries recorded yet.'}
                </span>
              </CardContent>
            </Card>
          )}
          <AdminPagination
            basePath={basePath}
            page={pagedInquiries.page}
            totalPages={pagedInquiries.totalPages}
            totalItems={pagedInquiries.totalItems}
            startIndex={pagedInquiries.startIndex}
            endIndex={pagedInquiries.endIndex}
            query={{
              tab: basePath !== '/admin/inquiries' ? 'inquiries' : undefined,
              status: statusFilter || undefined,
            }}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Proposal Builder Form */}
          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle className="text-base">
                {prefill ? `Create Proposal for ${prefill.name}` : 'Create & Send Proposal'}
              </CardTitle>
              <CardDescription className="text-xs">
                Generates PRP-XXXX, optionally splits custom milestones, notifies client, and queues transactional email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={createProposalAction}
                successMessage="Proposal saved and processed."
                resetOnSuccess
                className="space-y-4"
              >
                {prefill ? <input type="hidden" name="inquiry_id" value={prefill.id} /> : null}

                <div className="space-y-1.5">
                  <Label htmlFor="prop-client-id" className="text-sm font-medium">Portal Client (or auto-match by email)</Label>
                  <select
                    id="prop-client-id"
                    name="client_id"
                    aria-label="Portal client"
                    defaultValue={prefill?.converted_client_id ?? ''}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                  >
                    <option value="">— Auto-match by Recipient Email or select client —</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-recipient-name" className="text-sm font-medium">Recipient Name *</Label>
                    <Input
                      id="prop-recipient-name"
                      name="recipient_name"
                      required
                      defaultValue={prefill?.name ?? ''}
                      placeholder="Alex Morgan"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-recipient-email" className="text-sm font-medium">Recipient Email *</Label>
                    <Input
                      id="prop-recipient-email"
                      name="recipient_email"
                      type="email"
                      required
                      defaultValue={prefill?.email ?? ''}
                      placeholder="alex@company.com"
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prop-title" className="text-sm font-medium">Proposal Title *</Label>
                  <Input
                    id="prop-title"
                    name="title"
                    required
                    defaultValue={
                      prefill?.company ? `${prefill.company} Security & Engineering Proposal` : ''
                    }
                    placeholder="Full-Scope Web & API Penetration Test (VAPT)"
                    className="h-10"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-pillar" className="text-sm font-medium">Pillar</Label>
                    <select
                      id="prop-pillar"
                      name="pillar"
                      aria-label="Service pillar"
                      defaultValue={prefill?.service_pillar ?? 'cybersecurity'}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                    >
                      <option value="cybersecurity">Cybersecurity</option>
                      <option value="development">Full-Stack Dev</option>
                      <option value="cloud_devops">Cloud &amp; Linux</option>
                      <option value="ai_ml">AI &amp; ML</option>
                      <option value="tech_support">Advisory</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-currency" className="text-sm font-medium">Currency</Label>
                    <select
                      id="prop-currency"
                      name="currency"
                      aria-label="Proposal currency"
                      defaultValue="USD"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                    >
                      <option value="USD">USD</option>
                      <option value="BDT">BDT</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-total-usd" className="text-sm font-medium">Total *</Label>
                    <Input
                      id="prop-total-usd"
                      name="total_usd"
                      aria-label="Proposal total amount"
                      type="number"
                      step="0.01"
                      required
                      min="1"
                      defaultValue={prefill?.budget_max ?? 1200}
                      className="h-10 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-fx-rate" className="text-sm font-medium">FX→USD</Label>
                    <Input
                      id="prop-fx-rate"
                      name="fx_rate_to_usd"
                      aria-label="Exchange rate to USD"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      defaultValue="1.0"
                      className="h-10 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-deposit-pct" className="text-sm font-medium">Deposit %</Label>
                    <Input
                      id="prop-deposit-pct"
                      name="deposit_percent"
                      aria-label="Proposal deposit percentage"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue="50"
                      className="h-10 tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="prop-delivery-days" className="text-sm font-medium">Est. Delivery Days</Label>
                    <Input
                      id="prop-delivery-days"
                      name="estimated_delivery_days"
                      aria-label="Estimated delivery days"
                      type="number"
                      defaultValue="10"
                      className="h-10 tabular-nums"
                    />
                  </div>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium">
                    <FormCheckbox
                      name="requires_roe"
                      defaultChecked={prefill?.nda_required ?? false}
                    />
                    Requires RoE Signature
                  </label>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prop-exec-summary" className="text-sm font-medium">Executive Summary *</Label>
                  <Textarea
                    id="prop-exec-summary"
                    name="executive_summary"
                    required
                    rows={3}
                    defaultValue={prefill?.project_summary ?? ''}
                    placeholder="Scope boundaries, objectives, methodologies, and business outcomes..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prop-scope-items" className="text-sm font-medium">Deliverables / Scope Items (One per line)</Label>
                  <Textarea
                    id="prop-scope-items"
                    name="scope_items"
                    rows={3}
                    placeholder="OWASP API Top 10 Manual Exploitation&#10;Executive PDF & CVSS v3.1 Matrix&#10;1x Retest Patch Verification"
                  />
                </div>

                <ProposalMilestonesEditor />

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="submit" name="proposal_status" value="sent" className="flex-1 gap-1.5 rounded-full">
                    <Send className="h-3.5 w-3.5" />
                    Send Proposal
                  </Button>
                  <Button
                    type="submit"
                    name="proposal_status"
                    value="draft"
                    variant="outline"
                    className="rounded-full"
                  >
                    Save Draft
                  </Button>
                </div>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          {/* Issued Proposals List */}
          <Card className="xl:col-span-7">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Issued &amp; Draft Proposals ({pagedProposals.totalItems})
                </CardTitle>
                <CardDescription className="text-xs">
                  Inspect milestone breakdown, send drafts, or trace declined/accepted deals.
                </CardDescription>
              </div>
              <form method="get" className="flex items-center gap-2">
                {basePath !== '/admin/proposals' && <input type="hidden" name="tab" value="proposals" />}
                <select
                  name="status"
                  aria-label="Filter proposals by status"
                  defaultValue={statusFilter}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-base font-sans transition-colors hover:border-muted-foreground/45"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="viewed">viewed</option>
                  <option value="accepted">accepted</option>
                  <option value="declined">declined</option>
                  <option value="expired">expired</option>
                </select>
                <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                  Filter
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              {pagedProposals.items.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {pagedProposals.items.map((prop) => (
                    <div key={prop.id} className="space-y-2 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/proposals/${prop.id}`}
                            className="font-mono text-xs font-bold text-primary hover:underline"
                          >
                            {prop.code ?? prop.id.slice(0, 8)}
                          </Link>
                          <Badge
                            variant={prop.status === 'declined' ? 'destructive' : 'outline'}
                            className="font-mono text-[10px]"
                          >
                            {prop.status}
                          </Badge>
                          {prop.requires_roe && (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              RoE Required
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-xs font-bold">
                          {formatMoney(prop.total_cents, prop.currency)} ({prop.deposit_percent}% deposit)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/admin/proposals/${prop.id}`}
                          className="text-sm font-semibold hover:text-primary"
                        >
                          {prop.title}
                        </Link>
                        {prop.status === 'draft' && (
                          <ActionFeedbackForm
                            action={sendDraftProposalAction}
                            successMessage="Proposal sent to client."
                          >
                            <input type="hidden" name="proposal_id" value={prop.id} />
                            <Button type="submit" size="sm" className="h-7 rounded-full text-[11px]">
                              Send Draft Now
                            </Button>
                          </ActionFeedbackForm>
                        )}
                      </div>

                      {prop.decline_reason && (
                        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                          Declined reason: {prop.decline_reason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          To: {prop.recipient_name} ({prop.recipient_email}) ·{' '}
                          {formatDistanceToNow(new Date(prop.created_at), { addSuffix: true })}
                        </span>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/proposals/${prop.id}`}
                            className="font-mono text-primary hover:underline"
                          >
                            Inspect →
                          </Link>
                          {orderIdByProposalId.get(prop.id) && (
                            <Link
                              href={`/admin/orders/${orderIdByProposalId.get(prop.id)}`}
                              className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                            >
                              Order <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {statusFilter
                    ? 'No proposals match the selected status filter.'
                    : 'No proposals created yet.'}
                </p>
              )}
              <AdminPagination
                basePath={basePath}
                page={pagedProposals.page}
                totalPages={pagedProposals.totalPages}
                totalItems={pagedProposals.totalItems}
                startIndex={pagedProposals.startIndex}
                endIndex={pagedProposals.endIndex}
                query={{
                  tab: basePath !== '/admin/proposals' ? 'proposals' : undefined,
                  status: statusFilter || undefined,
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
