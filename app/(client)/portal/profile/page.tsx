import { redirect } from 'next/navigation';
import { UserCheck } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { updateClientProfileAction } from '@/lib/crm/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/portal/profile');

  const admin = getSupabaseAdmin();
  const [{ data: profile }, { data: clientProfile }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', session.userId).maybeSingle(),
    admin.from('client_profiles').select('*').eq('user_id', session.userId).maybeSingle(),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account & Billing Profile</h1>
        <p className="text-sm text-muted-foreground">
          Keep your organization details, timezone, and preferred billing currency up to date for invoices and engagement authorizations.
        </p>
      </div>

      <Card className="border-border/80 bg-card/85">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <UserCheck className="h-4 w-4 text-primary" />
            Client Identity & Organization Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateClientProfileAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input
                  name="full_name"
                  defaultValue={profile?.full_name ?? session.fullName ?? ''}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Email (Verified)</Label>
                <Input
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
              <div className="space-y-1.5">
                <Label className="text-xs">Company Website</Label>
                <Input
                  name="website_url"
                  defaultValue={clientProfile?.website_url ?? ''}
                  placeholder="https://example.com"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">VAT / Tax ID</Label>
                <Input
                  name="tax_id"
                  defaultValue={clientProfile?.tax_id ?? ''}
                  placeholder="Optional for invoices"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preferred Billing Currency</Label>
                <select
                  name="preferred_currency"
                  defaultValue={clientProfile?.preferred_currency ?? 'USD'}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="USD">USD ($)</option>
                  <option value="BDT">BDT (৳)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <Button type="submit" size="sm">
              Save Profile Settings
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
