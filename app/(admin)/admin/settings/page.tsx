import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { PasswordChangeCard } from '@/components/panel/password-change-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { publishConsentPolicyAction } from '@/lib/admin/ops-actions';
import { requireAdminSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await requireAdminSession();
  const admin = getSupabaseAdmin();

  const { data: policies } = await admin
    .from('consent_policies')
    .select('*')
    .order('created_at', { ascending: false });

  const activePolicy = (policies ?? []).find((p) => p.is_active);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/ops"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Security &amp; Ops Hub
        </Link>

        <AdminHubHeader
          eyebrow="GOVERNANCE, PRIVACY CONSENT & ADMIN CREDENTIALS"
          title="Policies & Security Settings"
          description="Publish cryptographic consent policy versions enforced on public inquiry intake forms and update your AAL2 Administrator password."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Publish Active Consent Policy Version
              </CardTitle>
              <CardDescription className="text-xs">
                Stores exact canonical text + SHA-256 hash and switches the single active enforcement policy atomically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={publishConsentPolicyAction}
                successMessage="Consent policy published and activated."
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Version Identifier *</Label>
                  <Input
                    name="version"
                    required
                    defaultValue={activePolicy ? `${activePolicy.version}-rev` : 'v2-2026'}
                    placeholder="v2-2026-11"
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Canonical Legal Consent Text *</Label>
                  <Textarea
                    name="canonical"
                    aria-label="Canonical legal consent policy text"
                    rows={4}
                    required
                    defaultValue={
                      activePolicy?.canonical ??
                      'I consent to redwan.work processing my inquiry details and attached scope files strictly for security & engineering project evaluation in accordance with the Privacy Policy.'
                    }
                    className="text-xs"
                  />
                </div>
                <Button type="submit" size="sm" className="rounded-full">
                  Publish &amp; Activate Policy Version
                </Button>
              </ActionFeedbackForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Policy Version History ({policies?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              {(policies ?? []).map((p) => (
                <div key={p.version} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary">{p.version}</span>
                      <Badge variant={p.is_active ? 'default' : 'outline'} className="font-mono text-[10px]">
                        {p.is_active ? 'ACTIVE' : 'ARCHIVED'}
                      </Badge>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      SHA-256: {p.hash.slice(0, 14)}…
                    </span>
                  </div>
                  <p className="mt-1.5 text-muted-foreground">{p.canonical}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Admin Session Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Operator</span>
                <span>{session.email}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Role / Assurance</span>
                <span>admin (AAL2 Enforced)</span>
              </div>
            </CardContent>
          </Card>

          <PasswordChangeCard />
        </div>
      </div>
    </div>
  );
}
