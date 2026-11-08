import { redirect } from 'next/navigation';
import { CheckCircle2, Handshake, ShieldAlert, Sparkles } from 'lucide-react';
import { getCurrentSession } from '@/lib/auth/session';
import { placePortalPackageOrderAction } from '@/lib/crm/actions';
import { SERVICE_PILLARS } from '@/lib/content/site';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function ClientPortalNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    tier?: string;
    budget?: string;
    requirements?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  if (!session) {
    const qs = new URLSearchParams();
    if (params.service) qs.set('service', params.service);
    if (params.tier) qs.set('tier', params.tier);
    if (params.budget) qs.set('budget', params.budget);
    if (params.requirements) qs.set('requirements', params.requirements);
    const nextTarget = qs.toString()
      ? `/portal/orders/new?${qs.toString()}`
      : '/portal/orders/new';
    redirect(`/login?next=${encodeURIComponent(nextTarget)}`);
  }

  const catalog = await getPublicServicesCatalog();

  const selectedService =
    catalog.find((s) => s.slug === params.service) ?? catalog[0];
  const isCustomDefault = params.tier === 'custom';
  const isUnselectedDefault = params.tier === 'unselected';
  const selectedPkg =
    selectedService?.packages.find((p) => p.tier === params.tier) ??
    selectedService?.packages.find((p) => p.popular) ??
    selectedService?.packages[0];

  const defaultTierValue = isUnselectedDefault
    ? 'unselected'
    : isCustomDefault
      ? 'custom'
      : (selectedPkg?.tier ?? 'standard');

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 font-mono text-xs">
          In-Portal Service Store &amp; Custom Deal Desk
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Order a Package or Offer a Custom Budget
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a Starter, Standard, or Enterprise package (with its standard price or your own custom budget offer), or unselect packages and specify your custom requirements to launch an interactive contract workspace immediately.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Instant Order & Custom Deal Form */}
        <Card className="border-primary/30 bg-card/90 lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              Configure &amp; Launch Contract
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={placePortalPackageOrderAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Service Offering *</Label>
                <select
                  name="service_slug"
                  defaultValue={selectedService?.slug}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  {catalog.map((service) => {
                    const pillar = SERVICE_PILLARS[service.pillar];
                    return (
                      <option key={service.slug} value={service.slug}>
                        [{pillar?.shortLabel}] {service.title}
                      </option>
                    );
                  })}
                  <option value="other-custom-engagement">
                    [Custom / Multi-Disciplinary] Custom Technical Engagement
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Package Selection (or Unselect for Custom Scope) *</Label>
                <select
                  name="tier"
                  defaultValue={defaultTierValue}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="starter">Starter Tier (Basic / South Asian Freelancer Standard Rate)</option>
                  <option value="standard">Standard Tier (Most Popular)</option>
                  <option value="enterprise">Enterprise Tier (Full Production / Multi-Target)</option>
                  <option value="unselected">No Package Selected (Custom Scope &amp; Requirements Only)</option>
                  <option value="custom">✨ Offer a Custom Deal (Custom Budget &amp; Timeline)</option>
                </select>
              </div>

              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Handshake className="h-3.5 w-3.5" />
                  Custom Budget Offer (Optional with any package or unselected tier)
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Custom Budget Offer (USD)</Label>
                    <Input
                      name="custom_budget_usd"
                      type="number"
                      min={25}
                      step={5}
                      defaultValue={params.budget ?? ''}
                      placeholder="Leave blank for package price"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Desired Delivery (Days)</Label>
                    <Input
                      name="custom_delivery_days"
                      type="number"
                      min={1}
                      max={365}
                      placeholder="e.g. 7"
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Custom Project Title (Optional)</Label>
                <Input
                  name="title"
                  placeholder={
                    selectedService && selectedPkg && !isUnselectedDefault
                      ? `${selectedService.title} — ${selectedPkg.name}`
                      : 'Custom Engagement Title'
                  }
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Project Requirements, Scope &amp; Deal Terms</Label>
                <Textarea
                  name="description"
                  rows={3}
                  defaultValue={params.requirements ?? ''}
                  placeholder="Add your specific requirements, deliverables, timeline, or custom budget notes..."
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target Domains / Repos / Scope Notes</Label>
                <Textarea
                  name="target_scope_notes"
                  rows={3}
                  placeholder="List target URLs, APIs, cloud accounts, or repository links..."
                  className="font-mono text-xs"
                />
              </div>

              <Button type="submit" className="w-full gap-1.5">
                <Sparkles className="h-4 w-4" />
                Launch Contract &amp; Open Live Chat Workspace
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Right: Live Database Catalog Reference */}
        <div className="space-y-4 lg:col-span-7">
          {catalog.map((service) => {
            const pillar = SERVICE_PILLARS[service.pillar];
            return (
              <Card key={service.slug} className="border-border/80 bg-card/85">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {pillar?.shortLabel}
                      </Badge>
                      {service.requiresRoe && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          <ShieldAlert className="mr-1 h-3 w-3" />
                          Requires Signed RoE
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {service.slug}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold">{service.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {service.packages.map((pkg) => (
                      <div
                        key={pkg.tier}
                        className="rounded-xl border border-border/70 bg-background/60 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold uppercase text-primary">
                            {pkg.tier}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {pkg.deliveryDays}d
                          </span>
                        </div>
                        <div className="mt-1 font-bold">{pkg.name}</div>
                        <div className="mt-1 font-mono text-base font-extrabold">
                          ${(pkg.priceCents / 100).toLocaleString()}
                        </div>
                        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                          {pkg.features.slice(0, 3).map((f) => (
                            <li key={f} className="flex items-start gap-1.5">
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
