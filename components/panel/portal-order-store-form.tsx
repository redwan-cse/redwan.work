'use client';

import * as React from 'react';
import { CheckCircle2, Handshake, ShieldAlert, Sparkles } from 'lucide-react';
import { placePortalPackageOrderAction } from '@/lib/crm/actions';
import { SERVICE_PILLARS, type ServiceCatalogItem } from '@/lib/content/site';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCheckbox } from '@/components/ui/form-checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function PortalOrderStoreClient({
  catalog,
  initialServiceSlug,
  initialTier,
  initialBudget,
  initialRequirements,
}: {
  catalog: ServiceCatalogItem[];
  initialServiceSlug: string;
  initialTier: string;
  initialBudget: string;
  initialRequirements: string;
}) {
  const [serviceSlug, setServiceSlug] = React.useState(initialServiceSlug);
  const [tier, setTier] = React.useState(initialTier);
  const [customBudget, setCustomBudget] = React.useState(initialBudget);

  const selectedService =
    serviceSlug === 'other-custom-engagement'
      ? undefined
      : (catalog.find((s) => s.slug === serviceSlug) ?? catalog[0]);
  const selectedPkg =
    selectedService && tier !== 'custom' && tier !== 'unselected'
      ? (selectedService.packages.find((p) => p.tier === tier) ?? selectedService.packages[0])
      : undefined;

  const parsedBudget = Number(customBudget);
  const hasCustomBudget = customBudget.trim() !== '' && Number.isFinite(parsedBudget) && parsedBudget > 0;
  const isCustomQuoteFlow =
    serviceSlug === 'other-custom-engagement' ||
    tier === 'custom' ||
    tier === 'unselected' ||
    hasCustomBudget;

  const estimatedTotalUsd = hasCustomBudget
    ? Math.round(parsedBudget)
    : Math.round((selectedPkg?.priceCents ?? selectedService?.startingPriceCents ?? 25000) / 100);
  const depositPercent = selectedPkg?.depositPercent ?? 50;
  const depositUsd = Math.round((estimatedTotalUsd * depositPercent) / 100);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Instant Order & Custom Deal Form */}
      <Card className="min-w-0 border-primary/30 bg-card/90 lg:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" />
            Configure &amp; Launch Contract
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActionFeedbackForm
            action={placePortalPackageOrderAction}
            successMessage="Order workspace created."
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="store-service-slug" className="text-xs">Service Offering *</Label>
              <select
                id="store-service-slug"
                name="service_slug"
                aria-label="Service category selection"
                value={serviceSlug}
                onChange={(e) => setServiceSlug(e.target.value)}
                className="flex h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
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
              <Label htmlFor="store-tier" className="text-xs">Package Selection (or Unselect for Custom Scope) *</Label>
              <select
                id="store-tier"
                name="tier"
                aria-label="Package selection tier"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="flex h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
              >
                <option value="starter">Starter Tier — Essential Scope</option>
                <option value="standard">Standard Tier (Most Popular)</option>
                <option value="enterprise">Enterprise Tier (Full Production / Multi-Target)</option>
                <option value="unselected">No Package Selected (Custom Scope &amp; Requirements Only)</option>
                <option value="custom">Offer a Custom Deal (Custom Budget &amp; Timeline)</option>
              </select>
            </div>

            {/* Live Selection Summary */}
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase text-primary">
                  {isCustomQuoteFlow ? 'Custom Quote Pipeline' : 'Instant Fixed-Scope Contract'}
                </span>
                {selectedService?.requiresRoe && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-800 dark:text-amber-300"
                  >
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    Requires RoE
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 font-mono">
                <span className="text-base font-extrabold">
                  ${estimatedTotalUsd.toLocaleString()} USD
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {isCustomQuoteFlow
                    ? 'Scoped into formal proposal (PRP)'
                    : `${depositPercent}% deposit ($${depositUsd.toLocaleString()}) · ${selectedPkg?.deliveryDays ?? 7}d · ${selectedPkg?.revisions ?? 2} rev`}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Handshake className="h-3.5 w-3.5" />
                Custom Budget Offer (Optional with any package or unselected tier)
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="store-custom-budget" className="text-xs font-medium">Custom Budget Offer (USD)</Label>
                  <Input
                    id="store-custom-budget"
                    name="custom_budget_usd"
                    type="number"
                    min={25}
                    step={5}
                    value={customBudget}
                    onChange={(e) => setCustomBudget(e.target.value)}
                    placeholder="e.g. 850 (optional)"
                    className="h-10 font-mono md:h-9"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="store-custom-days" className="text-xs font-medium">Desired Delivery (Days)</Label>
                  <Input
                    id="store-custom-days"
                    name="custom_delivery_days"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="e.g. 7"
                    className="h-10 font-mono md:h-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store-custom-title" className="text-xs font-medium">Custom Project Title (Optional)</Label>
              <Input
                id="store-custom-title"
                name="title"
                placeholder={
                  selectedService && selectedPkg
                    ? `${selectedService.title} — ${selectedPkg.name}`
                    : 'Custom Engagement Title'
                }
                className="h-10 md:h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store-description" className="text-xs font-medium">Project Requirements, Scope &amp; Deal Terms</Label>
              <Textarea
                id="store-description"
                name="description"
                rows={3}
                defaultValue={initialRequirements}
                placeholder="Add your specific requirements, deliverables, timeline, or custom budget notes..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="store-scope-notes" className="text-xs font-medium">Target Domains / Repos / Scope Notes</Label>
              <Textarea
                id="store-scope-notes"
                name="target_scope_notes"
                rows={3}
                placeholder="List target URLs, APIs, cloud accounts, or repository links..."
                className="font-mono"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/80 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <FormCheckbox
                name="consent_accepted"
                value="true"
                required={isCustomQuoteFlow}
                wrapperClassName="mt-0.5"
              />
              <span>
                I agree to the active Data &amp; Privacy Policy for processing these scope details (required for custom quote requests).
              </span>
            </label>

            <Button type="submit" className="w-full gap-1.5">
              <Sparkles className="h-4 w-4" />
              {isCustomQuoteFlow
                ? 'Submit Custom Quote Request'
                : 'Launch Contract & Open Live Chat Workspace'}
            </Button>
          </ActionFeedbackForm>
        </CardContent>
      </Card>

      {/* Right: Interactive Live Database Catalog Reference */}
      <div className="min-w-0 space-y-4 lg:col-span-7">
        {catalog.map((service) => {
          const pillar = SERVICE_PILLARS[service.pillar];
          const isServiceActive = service.slug === serviceSlug;
          return (
            <Card
              key={service.slug}
              className={cn(
                'border-border/80 bg-card/85 transition-colors',
                isServiceActive && 'border-primary/50'
              )}
            >
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {pillar?.shortLabel}
                    </Badge>
                    {service.requiresRoe && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-800 dark:text-amber-300"
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

                <h2 className="mt-2 text-base font-bold">{service.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {service.packages.map((pkg) => {
                    const isSelectedCard =
                      isServiceActive && tier === pkg.tier && !hasCustomBudget;
                    return (
                      <button
                        type="button"
                        key={pkg.tier}
                        aria-pressed={isSelectedCard}
                        onClick={() => {
                          setServiceSlug(service.slug);
                          setTier(pkg.tier);
                          setCustomBudget('');
                        }}
                        className={cn(
                          'rounded-xl border p-3 text-left text-xs transition-colors',
                          isSelectedCard
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-border/70 bg-background/60 hover:border-primary/40'
                        )}
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
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
