import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Pin,
  Plus,
  Save,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requireAdminSession } from '@/lib/auth/session';
import {
  addTypedClientNoteAction,
  toggleClientActiveStatusAction,
  updateClientCrmAndNoteAction,
} from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const activeTab =
    query.tab === 'orders' ||
    query.tab === 'invoices' ||
    query.tab === 'tickets' ||
    query.tab === 'notes' ||
    query.tab === 'security'
      ? query.tab
      : 'overview';

  await requireAdminSession();
  const admin = getSupabaseAdmin();

  const [
    { data: profile },
    { data: crm },
    { data: notes },
    { data: orders },
    { data: proposals },
    { data: invoices },
    { data: creditNotes },
    { data: tickets },
    { data: retainers },
    { data: vaultFiles },
    { data: auditLogs },
  ] = await Promise.all([
    admin.from('profiles').select('*').eq('id', id).maybeSingle(),
    admin.from('client_profiles').select('*').eq('user_id', id).maybeSingle(),
    admin
      .from('client_notes')
      .select('*')
      .eq('client_id', id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
    admin
      .from('orders')
      .select('id, code, title, pillar, status, total_cents, currency, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('proposals')
      .select('id, code, title, status, total_cents, currency, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('invoices')
      .select('id, code, status, total_cents, amount_paid_cents, credited_cents, currency, issued_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('credit_notes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('tickets')
      .select('id, code, subject, status, priority, last_message_at')
      .eq('client_id', id)
      .order('last_message_at', { ascending: false }),
    admin
      .from('retainer_plans')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('vault_files')
      .select('size_bytes')
      .eq('owner_client_id', id)
      .is('archived_at', null),
    admin
      .from('audit_logs')
      .select('id, action, summary, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (!profile) notFound();

  const billingAddr = (crm?.billing_address ?? {}) as Record<string, string | undefined>;
  const vaultUsedBytes = (vaultFiles ?? []).reduce((sum, f) => sum + Number(f.size_bytes || 0), 0);

  const tabs = [
    { id: 'overview', label: 'Overview & CRM', href: `/admin/clients/${id}?tab=overview` },
    {
      id: 'orders',
      label: 'Orders & Proposals',
      href: `/admin/clients/${id}?tab=orders`,
      count: (orders?.length ?? 0) + (proposals?.length ?? 0),
    },
    {
      id: 'invoices',
      label: 'Invoices & Credits',
      href: `/admin/clients/${id}?tab=invoices`,
      count: invoices?.length ?? 0,
    },
    {
      id: 'tickets',
      label: 'Tickets & Retainers',
      href: `/admin/clients/${id}?tab=tickets`,
      count: (tickets?.length ?? 0) + (retainers?.length ?? 0),
    },
    {
      id: 'notes',
      label: 'Typed Notes',
      href: `/admin/clients/${id}?tab=notes`,
      count: notes?.length ?? 0,
    },
    { id: 'security', label: 'Security & Quota', href: `/admin/clients/${id}?tab=security` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clients"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clients Directory
        </Link>

        <AdminHubHeader
          eyebrow={`CLIENT 360° · ${(crm?.tier ?? 'standard').toUpperCase()} · ${profile.is_active ? 'ACTIVE' : 'DEACTIVATED'}`}
          title={profile.full_name || profile.email}
          description={`${profile.email} · LTV: ${formatMoney(crm?.lifetime_value_usd_cents ?? 0, 'USD')} · Completed Orders: ${crm?.completed_orders_count ?? 0}`}
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 rounded-full text-xs">
                <Link href={`/admin/invoices/new?client_id=${profile.id}`}>+ Draft Invoice</Link>
              </Button>
              <ConfirmActionButton
                action={toggleClientActiveStatusAction}
                hiddenFields={{
                  client_id: profile.id,
                  is_active: profile.is_active ? 'false' : 'true',
                }}
                triggerLabel={profile.is_active ? 'Deactivate' : 'Reactivate'}
                confirmTitle={profile.is_active ? 'Deactivate client account?' : 'Reactivate client account?'}
                confirmDescription={
                  profile.is_active
                    ? 'Revokes access tokens cleanly and blocks client portal sign-in until reactivated.'
                    : 'Restores portal login capability for this client.'
                }
                confirmLabel={profile.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                destructive={Boolean(profile.is_active)}
                variant={profile.is_active ? 'outline' : 'default'}
              />
            </div>
          }
        />
      </div>

      {/* TAB 1: OVERVIEW & CRM SETTINGS */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Relationship &amp; Retention Settings
              </CardTitle>
              <CardDescription className="text-xs">
                Private CRM tier, follow-up reminder, and executive summary.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={updateClientCrmAndNoteAction}
                successMessage="CRM settings updated."
                className="space-y-3.5"
              >
                <input type="hidden" name="client_id" value={profile.id} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Client Tier</Label>
                    <select
                      name="tier"
                      aria-label="Client CRM tier"
                      defaultValue={crm?.tier ?? 'standard'}
                      className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                    >
                      <option value="standard">standard</option>
                      <option value="vip">vip</option>
                      <option value="retainer">retainer</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      name="company_name"
                      defaultValue={crm?.company_name ?? ''}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Next Follow-Up Date
                  </Label>
                  <Input
                    name="next_followup_at"
                    type="date"
                    defaultValue={crm?.next_followup_at ? crm.next_followup_at.slice(0, 10) : ''}
                    className="h-9 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Executive Relationship Summary</Label>
                  <Textarea
                    name="relationship_summary"
                    rows={3}
                    defaultValue={crm?.relationship_summary ?? ''}
                    placeholder="Key preferences, tech stack, renewal window..."
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Quick Note (Optional)</Label>
                  <Textarea
                    name="note_body"
                    rows={2}
                    placeholder="Optional quick log entry..."
                    className="text-xs"
                  />
                </div>

                <Button type="submit" className="w-full gap-1.5 rounded-full">
                  <Save className="h-4 w-4" />
                  Save CRM Profile
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Organization, Tax &amp; Billing Address</CardTitle>
              <CardDescription className="text-xs">
                Maintained by the client in their Profile &amp; Security settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Company Role:</span>{' '}
                  <span className="font-medium">{crm?.company_role || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tax / VAT ID:</span>{' '}
                  <span className="font-mono font-medium">{crm?.tax_id || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone / WhatsApp:</span>{' '}
                  <span className="font-mono font-medium">{profile.phone || profile.whatsapp || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Preferred Currency:</span>{' '}
                  <span className="font-mono font-medium">{crm?.preferred_currency ?? 'USD'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Timezone:</span>{' '}
                  <span className="font-mono font-medium">{profile.timezone ?? 'UTC'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Website:</span>{' '}
                  <span className="font-mono">{crm?.website_url || '—'}</span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4">
                <div className="mb-1 font-semibold">Formal Billing Address (for A4 Invoices)</div>
                {billingAddr.line1 ? (
                  <p className="text-muted-foreground">
                    {[
                      billingAddr.line1,
                      billingAddr.line2,
                      billingAddr.city,
                      billingAddr.state,
                      billingAddr.postal_code,
                      billingAddr.country,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No structured billing address saved by client yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: ORDERS & PROPOSALS */}
      {activeTab === 'orders' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Orders ({orders?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {orders && orders.length > 0 ? (
                orders.map((ord) => (
                  <Link
                    key={ord.id}
                    href={`/admin/orders/${ord.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/70 p-3 hover:border-primary/40"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{ord.code}</span>
                      <div className="font-medium">{ord.title}</div>
                      <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                        {ord.status}
                      </Badge>
                    </div>
                    <span className="font-mono font-bold">
                      {formatMoney(ord.total_cents, ord.currency)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No orders yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Proposals ({proposals?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {proposals && proposals.length > 0 ? (
                proposals.map((prop) => (
                  <Link
                    key={prop.id}
                    href={`/admin/proposals/${prop.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/70 p-3 hover:border-primary/40"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{prop.code}</span>
                      <div className="font-medium">{prop.title}</div>
                      <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                        {prop.status}
                      </Badge>
                    </div>
                    <span className="font-mono font-bold">
                      {formatMoney(prop.total_cents, prop.currency)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No proposals issued.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: INVOICES & CREDIT NOTES */}
      {activeTab === 'invoices' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Invoices ({invoices?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {invoices && invoices.length > 0 ? (
                invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/70 p-3 hover:border-primary/40"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{inv.code}</span>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {inv.status} · Paid {formatMoney(inv.amount_paid_cents, inv.currency)}
                      </div>
                    </div>
                    <span className="font-mono font-bold">
                      {formatMoney(inv.total_cents, inv.currency)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No invoices yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Credit Notes ({creditNotes?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {creditNotes && creditNotes.length > 0 ? (
                creditNotes.map((cn) => (
                  <Link
                    key={cn.id}
                    href={`/admin/invoices/${cn.invoice_id}`}
                    className="flex items-center justify-between rounded-lg border border-border/70 p-3 hover:border-primary/40"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{cn.code}</span>
                      <div className="text-muted-foreground">{cn.reason}</div>
                    </div>
                    <span className="font-mono font-bold">
                      {formatMoney(cn.amount_cents, cn.currency)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No credit notes issued.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: TICKETS & RETAINERS */}
      {activeTab === 'tickets' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Support Tickets ({tickets?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {tickets && tickets.length > 0 ? (
                tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/tickets/${t.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/70 p-3 hover:border-primary/40"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{t.code}</span>
                      <div className="font-medium">{t.subject}</div>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {t.status} · {t.priority}
                    </Badge>
                  </Link>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No support tickets.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Retainer Plans ({retainers?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {retainers && retainers.length > 0 ? (
                retainers.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{r.title}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {formatMoney(r.monthly_fee_cents, r.currency)}/mo · {r.hours_used_current_period}/{r.hours_per_month}h used
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No retainer subscriptions.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: TYPED NOTES */}
      {activeTab === 'notes' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Log Typed Relationship Note</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={addTypedClientNoteAction}
                successMessage="Client note saved."
                resetOnSuccess
                className="space-y-3"
              >
                <input type="hidden" name="client_id" value={profile.id} />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Note Type</Label>
                    <select
                      name="note_type"
                      aria-label="Client CRM note type"
                      defaultValue="general"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
                    >
                      <option value="general">general</option>
                      <option value="call">call</option>
                      <option value="followup">followup</option>
                      <option value="risk">risk</option>
                      <option value="win">win</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Follow-Up Date</Label>
                    <Input name="followup_date" type="date" className="h-9 font-mono text-xs" />
                  </div>
                </div>
                <Textarea
                  name="body"
                  required
                  rows={4}
                  placeholder="Call notes, expansion opportunity, SLA escalation..."
                  className="text-xs"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="is_pinned" className="h-4 w-4 rounded" />
                  Pin note to top
                </label>
                <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                  <Plus className="h-3.5 w-3.5" />
                  Add Typed Note
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes Timeline ({notes?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              {notes && notes.length > 0 ? (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3 ${
                      n.is_pinned ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-muted/20'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-1.5">
                        {n.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                        <Badge variant="outline" className="font-mono text-[9px] uppercase">
                          {n.note_type}
                        </Badge>
                        {n.followup_date && (
                          <span className="text-muted-foreground">Follow-up: {n.followup_date}</span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No internal notes recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 6: SECURITY, TOKENS & QUOTA */}
      {activeTab === 'security' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Account Security &amp; Vault Quota
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 font-mono text-xs">
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Account Active</span>
                <span>{profile.is_active ? 'true' : 'false'}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Token Revocation Cutoff</span>
                <span>
                  {profile.tokens_valid_after
                    ? new Date(Number(profile.tokens_valid_after) * 1000).toISOString()
                    : 'None'}
                </span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Account Created</span>
                <span>{new Date(profile.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Private Vault Used</span>
                <span>
                  {(vaultUsedBytes / (1024 * 1024)).toFixed(2)} MB / 500 MB
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Client Security / Audit Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <div>
                      <Badge variant="outline" className="mr-2 font-mono text-[9px]">
                        {log.action}
                      </Badge>
                      <span>{log.summary}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-muted-foreground">No client audit history yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
