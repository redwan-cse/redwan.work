import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { FileSpreadsheet, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createProposalAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminProposalsPage() {
  const admin = getSupabaseAdmin();
  const [{ data: proposals }, { data: clients }] = await Promise.all([
    admin
      .from('proposals')
      .select(
        'id, code, recipient_name, recipient_email, title, pillar, total_cents, currency, deposit_percent, requires_roe, status, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          PROPOSAL ENGINE
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Proposals &amp; Scope Quotations (`PRP-XXXX`)
        </h1>
        <p className="text-sm text-muted-foreground">
          Author structured proposals with milestone breakdowns and RoE requirements. Clients can accept in 1 click inside the Portal to auto-create their Order and Deposit Invoice.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-12">
        {/* Proposal Builder Form */}
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Create &amp; Send Proposal</CardTitle>
            <CardDescription>
              Generates `PRP-XXXX`, notifies the client, and queues a transactional email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProposalAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Assign to Existing Portal Client (or auto-match by email)</Label>
                <select
                  name="client_id"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
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
                  <Label className="text-xs">Recipient Name *</Label>
                  <Input name="recipient_name" required placeholder="Alex Morgan" className="h-9 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient Email *</Label>
                  <Input
                    name="recipient_email"
                    type="email"
                    required
                    placeholder="alex@company.com"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Proposal Title *</Label>
                <Input
                  name="title"
                  required
                  placeholder="Full-Scope Web & API Penetration Test (VAPT)"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Service Pillar</Label>
                  <select
                    name="pillar"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="cybersecurity">Cybersecurity &amp; VAPT</option>
                    <option value="development">Full-Stack Dev</option>
                    <option value="cloud_devops">Cloud &amp; Linux Ops</option>
                    <option value="ai_ml">AI/ML &amp; Automation</option>
                    <option value="tech_support">Tech Support &amp; Recovery</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Total Price (USD) *</Label>
                  <Input
                    name="total_usd"
                    type="number"
                    min="50"
                    step="1"
                    required
                    defaultValue="1150"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Label className="mb-auto text-xs">Deposit %</Label>
                  <Input
                    name="deposit_percent"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="50"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimated Delivery (Days)</Label>
                  <Input
                    name="estimated_delivery_days"
                    type="number"
                    min="1"
                    defaultValue="10"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      name="requires_roe"
                      defaultChecked
                      className="h-4 w-4 rounded border-border"
                    />
                    Requires Signed RoE
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Executive Summary *</Label>
                <Textarea
                  name="executive_summary"
                  required
                  rows={3}
                  placeholder="Outline the objective, methodology, and business value..."
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Scope &amp; Deliverables (One item per line)</Label>
                <Textarea
                  name="scope_items"
                  rows={4}
                  placeholder={'OWASP Top 10 & API authorization assessment\nCVSS v3.1 technical remediation report\n1 round of post-patch verification re-testing'}
                  className="font-mono text-xs"
                />
              </div>

              <Button type="submit" className="w-full gap-1.5 rounded-full">
                <Send className="h-4 w-4" />
                Issue &amp; Send Proposal
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sent Proposals List */}
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Issued Proposals</CardTitle>
            <CardDescription>Track client views, acceptance, and converted orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {proposals && proposals.length > 0 ? (
              <div className="divide-y divide-border/70">
                {proposals.map((prop) => (
                  <div key={prop.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {prop.code}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {prop.status}
                        </Badge>
                        {prop.requires_roe && (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            RoE Required
                          </Badge>
                        )}
                      </div>
                      <span className="font-mono text-sm font-bold">
                        {formatMoney(prop.total_cents, prop.currency)} ({prop.deposit_percent}% deposit)
                      </span>
                    </div>

                    <div className="text-sm font-semibold">{prop.title}</div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        To: {prop.recipient_name} ({prop.recipient_email}) ·{' '}
                        {formatDistanceToNow(new Date(prop.created_at), { addSuffix: true })}
                      </span>
                      {prop.status === 'accepted' && (
                        <Link
                          href="/admin/orders"
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          View Accepted Order →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No proposals created yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
