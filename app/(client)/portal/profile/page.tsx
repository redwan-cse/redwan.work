import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Activity, UserCheck } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { updateClientProfileAction } from '@/lib/crm/actions';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ClientMfaCard } from '@/components/panel/client-mfa-card';
import { PasswordChangeCard } from '@/components/panel/password-change-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/profile');

  const admin = getSupabaseAdmin();
  const [{ data: profile }, { data: clientProfile }, { data: securityLogs }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', session.userId).maybeSingle(),
    admin.from('client_profiles').select('*').eq('user_id', session.userId).maybeSingle(),
    admin
      .from('audit_logs')
      .select('id, action, summary, created_at')
      .eq('client_id', session.userId)
      .not('action', 'like', 'crm.%')
      .not(
        'action',
        'in',
        '("client.crm_updated","client.note_added","client.note_deleted","client.tier_updated","client.followup_updated","order.internal_note_added","admin.internal_note")'
      )
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const billingAddr = (clientProfile?.billing_address ?? {}) as Record<string, string | undefined>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account, Billing &amp; Security</h1>
        <p className="text-sm text-muted-foreground">
          Keep your organization details, formal A4 invoice billing address, timezone, password, and optional 2FA up to date.
        </p>
      </div>

      <Card className="border-border/80 bg-card/85">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <UserCheck className="h-4 w-4 text-primary" />
            Client Identity &amp; Formal Billing Profile
          </CardTitle>
          <CardDescription className="text-xs">
            Details saved here appear automatically on formal A4 PDF invoices and Rules of Engagement headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionFeedbackForm
            action={updateClientProfileAction}
            successMessage="Profile and billing address saved."
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input
                  name="full_name"
                  aria-label="Full Name"
                  defaultValue={profile?.full_name ?? session.fullName ?? ''}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Email (Verified)</Label>
                <Input
                  aria-label="Account Email"
                  value={session.email}
                  disabled
                  className="h-9 font-mono text-xs opacity-70"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone / WhatsApp (E.164)</Label>
                <Input
                  name="phone_e164"
                  defaultValue={profile?.phone ?? ''}
                  placeholder="+14155550199"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Timezone</Label>
                <Input
                  name="timezone"
                  defaultValue={profile?.timezone ?? 'UTC'}
                  placeholder="UTC / Asia/Dhaka / America/New_York"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Company / Organization Name</Label>
                <Input
                  name="company_name"
                  defaultValue={clientProfile?.company_name ?? ''}
                  placeholder="Acme Security Inc."
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Your Role / Title</Label>
                <Input
                  name="company_role"
                  defaultValue={clientProfile?.company_role ?? ''}
                  placeholder="CTO / Engineering Lead"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col justify-end gap-1.5">
                <Label className="mb-auto text-xs">Company Website</Label>
                <Input
                  name="website_url"
                  defaultValue={clientProfile?.website_url ?? ''}
                  placeholder="https://example.com"
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <Label className="mb-auto text-xs">VAT / Tax ID</Label>
                <Input
                  name="tax_id"
                  defaultValue={clientProfile?.tax_id ?? ''}
                  placeholder="Optional for invoices"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <Label className="mb-auto text-xs">Preferred Billing Currency</Label>
                <select
                  name="preferred_currency"
                  aria-label="Preferred billing currency"
                  defaultValue={clientProfile?.preferred_currency ?? 'USD'}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="USD">USD ($)</option>
                  <option value="BDT">BDT (৳)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            {/* Structured Billing Address */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
              <div className="text-xs font-semibold">Formal Billing Address (Optional for Invoices)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  name="billing_line1"
                  defaultValue={billingAddr.line1 ?? ''}
                  placeholder="Street Address Line 1"
                  className="h-9 text-xs"
                />
                <Input
                  name="billing_line2"
                  defaultValue={billingAddr.line2 ?? ''}
                  placeholder="Suite / Unit (Optional)"
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Input
                  name="billing_city"
                  defaultValue={billingAddr.city ?? ''}
                  placeholder="City"
                  className="h-9 text-xs"
                />
                <Input
                  name="billing_state"
                  defaultValue={billingAddr.state ?? ''}
                  placeholder="State / Region"
                  className="h-9 text-xs"
                />
                <Input
                  name="billing_postal_code"
                  defaultValue={billingAddr.postal_code ?? ''}
                  placeholder="Postal Code"
                  className="h-9 font-mono text-xs"
                />
                <Input
                  name="billing_country"
                  defaultValue={billingAddr.country ?? ''}
                  placeholder="Country"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <Button type="submit" size="sm">
              Save Profile Settings
            </Button>
          </ActionFeedbackForm>
        </CardContent>
      </Card>

      <PasswordChangeCard />

      <ClientMfaCard />

      <Card className="border-border/80 bg-card/85">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Activity className="h-4 w-4 text-primary" />
            Recent Workspace Activity Log
          </CardTitle>
          <CardDescription className="text-xs">
            Auditable record of downloads, digital authorizations, and account actions on your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {securityLogs && securityLogs.length > 0 ? (
            securityLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {log.action}
                  </Badge>
                  <span>{log.summary}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-muted-foreground">No recent security activity recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
