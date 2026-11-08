'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  CloudCog,
  Code2,
  DollarSign,
  FileText,
  LifeBuoy,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InteractiveCard, ScrollReveal } from '@/components/motion/reveal';
import {
  SERVICE_CATALOG,
  SERVICE_PILLARS,
  type ServiceCatalogItem,
  type ServicePillarKey,
} from '@/lib/content/site';
import { cn } from '@/lib/utils';

const PILLAR_TABS: Array<{
  key: 'all' | ServicePillarKey;
  label: string;
  icon: typeof ShieldAlert;
}> = [
  { key: 'all', label: 'All 5 Pillars', icon: Sparkles },
  { key: 'cybersecurity', label: 'Cybersecurity & VAPT', icon: ShieldAlert },
  { key: 'development', label: 'Full-Stack Engineering', icon: Code2 },
  { key: 'cloud_devops', label: 'Cloud & Linux Ops', icon: CloudCog },
  { key: 'ai_ml', label: 'AI/ML & Automation', icon: Bot },
  { key: 'tech_support', label: 'Tech Support & Retainers', icon: LifeBuoy },
];

interface ServiceDraftConfig {
  selectedTier: string | null; // 'starter' | 'standard' | 'enterprise' | null (unselected)
  customBudgetUsd: string;
  requirements: string;
}

export function ServicesShowcase({
  initialServices = SERVICE_CATALOG,
}: {
  initialServices?: ServiceCatalogItem[];
}) {
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const urlPillar = searchParams?.get('pillar') as ServicePillarKey | null;

  const [selectedPillar, setSelectedPillar] = useState<'all' | ServicePillarKey>(
    urlPillar && urlPillar in SERVICE_PILLARS ? urlPillar : 'all'
  );

  // Per-service interactive package selection, custom budget offer & requirements state
  const [drafts, setDrafts] = useState<Record<string, ServiceDraftConfig>>({});

  const getDraft = (service: ServiceCatalogItem): ServiceDraftConfig => {
    const existing = drafts[service.slug];
    if (existing) return existing;
    const popularPkg =
      service.packages.find((p) => p.popular) ?? service.packages[0];
    return {
      selectedTier: popularPkg?.tier ?? 'starter',
      customBudgetUsd: '',
      requirements: '',
    };
  };

  const updateDraft = (
    service: ServiceCatalogItem,
    patch: Partial<ServiceDraftConfig>
  ) => {
    setDrafts((prev) => {
      const current = getDraft(service);
      return {
        ...prev,
        [service.slug]: { ...current, ...patch },
      };
    });
  };

  const togglePackageTier = (service: ServiceCatalogItem, tier: string) => {
    const current = getDraft(service);
    updateDraft(service, {
      selectedTier: current.selectedTier === tier ? null : tier,
    });
  };

  const buildPortalOrderHref = (
    service: ServiceCatalogItem,
    overrideTier?: string | null
  ): string => {
    const draft = getDraft(service);
    const effectiveTier =
      overrideTier !== undefined ? overrideTier : draft.selectedTier;
    const params = new URLSearchParams();
    params.set('service', service.slug);
    params.set('tier', effectiveTier ?? 'unselected');
    if (draft.customBudgetUsd.trim()) {
      params.set('budget', draft.customBudgetUsd.trim());
    }
    if (draft.requirements.trim()) {
      params.set('requirements', draft.requirements.trim());
    }
    return `/portal/orders/new?${params.toString()}`;
  };

  const filteredServices = useMemo(() => {
    if (selectedPillar === 'all') return initialServices;
    return initialServices.filter((s) => s.pillar === selectedPillar);
  }, [initialServices, selectedPillar]);

  return (
    <div id="packages" className="space-y-12">
      {/* Pillar Filter Bar with Antigravity Shared-Layout Indicator */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PILLAR_TABS.map(({ key, label, icon: Icon }) => {
          const isActive = selectedPillar === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedPillar(key)}
              className={cn(
                'relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors sm:text-sm',
                isActive
                  ? 'border-primary text-primary-foreground'
                  : 'border-border/80 bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {isActive &&
                (prefersReducedMotion ? (
                  <span className="absolute inset-0 rounded-full bg-primary" />
                ) : (
                  <motion.span
                    layoutId="service-pillar-pill"
                    transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                ))}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Service Catalog Blocks */}
      <div className="space-y-14">
        {filteredServices.map((service) => {
          const draft = getDraft(service);
          const selectedPkg = service.packages.find(
            (p) => p.tier === draft.selectedTier
          );

          return (
            <ScrollReveal key={service.slug}>
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60 p-6 shadow-xs sm:p-8">
                {/* Service Header */}
                <div className="flex flex-col justify-between gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-start">
                  <div className="max-w-3xl space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs text-primary">
                        {service.pillarLabel}
                      </Badge>
                      {service.requiresRoe && (
                        <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/20">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Requires Signed RoE
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        Delivery: {service.deliveryDaysMin}–{service.deliveryDaysMax} days
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                      {service.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {service.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                    <Button asChild size="sm" className="gap-1.5 rounded-full">
                      <Link href={buildPortalOrderHref(service)}>
                        <Lock className="h-3.5 w-3.5" />
                        Order Service Now
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={`/contact?service=${service.slug}&tier=custom`}>
                        Ask a Question
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Key Highlights */}
                <div className="grid gap-3 border-b border-border/60 py-5 sm:grid-cols-2 lg:grid-cols-4">
                  {service.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex items-start gap-2 text-xs text-foreground/90"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>

                {/* Tiered Packages Grid */}
                <div
                  className={cn(
                    'mt-6 grid gap-6',
                    service.packages.length === 3
                      ? 'lg:grid-cols-3'
                      : 'lg:grid-cols-2'
                  )}
                >
                  {service.packages.map((pkg) => {
                    const isSelected = draft.selectedTier === pkg.tier;
                    return (
                      <InteractiveCard
                        key={pkg.tier}
                        className={cn(
                          'flex flex-col justify-between p-6 transition-all',
                          isSelected
                            ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/30'
                            : pkg.popular
                              ? 'border-primary/40'
                              : ''
                        )}
                      >
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'rounded-md px-2.5 py-0.5 font-mono text-xs font-semibold uppercase',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-foreground'
                              )}
                            >
                              {pkg.tier}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {pkg.popular && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                                  <Sparkles className="h-3 w-3" />
                                  Most Popular
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => togglePackageTier(service, pkg.tier)}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                                )}
                              >
                                {isSelected ? (
                                  <>
                                    <Check className="h-3 w-3" /> Selected (Click to Unselect)
                                  </>
                                ) : (
                                  'Select Package'
                                )}
                              </button>
                            </div>
                          </div>

                          <h3 className="text-lg font-bold">{pkg.name}</h3>
                          <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="font-mono text-3xl font-bold tracking-tight">
                              ${(pkg.priceCents / 100).toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground">USD</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {pkg.summary}
                          </p>

                          {/* Delivery & Deposit Meta */}
                          <div className="mt-4 flex flex-wrap gap-3 border-y border-border/60 py-2.5 font-mono text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              {pkg.deliveryDays}d turnaround
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <RefreshCw className="h-3.5 w-3.5 text-primary" />
                              {pkg.revisions} revision{pkg.revisions > 1 ? 's' : ''}
                            </span>
                            <span>{pkg.depositPercent}% kickoff deposit</span>
                          </div>

                          {/* Deliverables Checklist */}
                          <ul className="mt-4 space-y-2 text-xs text-foreground/90">
                            {pkg.features.map((feat) => (
                              <li key={feat} className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-2 border-t border-border/60 pt-4 sm:grid-cols-2">
                          <Button
                            asChild
                            variant={isSelected || pkg.popular ? 'default' : 'secondary'}
                            size="sm"
                            className="w-full gap-1.5 rounded-full text-xs"
                          >
                            <Link href={buildPortalOrderHref(service, pkg.tier)}>
                              <Lock className="h-3.5 w-3.5" />
                              Order Package
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => togglePackageTier(service, pkg.tier)}
                            className="w-full gap-1 rounded-full text-xs"
                          >
                            {isSelected ? 'Unselect Tier' : 'Customize Offer'}
                          </Button>
                        </div>
                      </InteractiveCard>
                    );
                  })}
                </div>

                {/* Interactive Package + Custom Budget Offer & Requirements Configurator */}
                <div className="mt-6 rounded-xl border border-primary/25 bg-background/80 p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Selected Configuration:
                      </span>
                      {selectedPkg ? (
                        <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/20">
                          {selectedPkg.tier.toUpperCase()} — {selectedPkg.name} ($
                          {(selectedPkg.priceCents / 100).toLocaleString()})
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-xs">
                          No Fixed Package Selected (Custom Requirements Only)
                        </Badge>
                      )}
                      {selectedPkg && (
                        <button
                          type="button"
                          onClick={() => updateDraft(service, { selectedTier: null })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Unselect Package
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Propose a custom budget or add requirements before ordering in the Portal
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-12 md:items-end">
                    <div className="space-y-1.5 md:col-span-3">
                      <label
                        htmlFor={`budget-${service.slug}`}
                        className="flex items-center gap-1 text-xs font-medium text-foreground"
                      >
                        <DollarSign className="h-3.5 w-3.5 text-primary" />
                        Custom Budget Offer (USD)
                      </label>
                      <Input
                        id={`budget-${service.slug}`}
                        type="number"
                        min={25}
                        step={5}
                        value={draft.customBudgetUsd}
                        onChange={(e) =>
                          updateDraft(service, { customBudgetUsd: e.target.value })
                        }
                        placeholder={
                          selectedPkg
                            ? `Default $${(selectedPkg.priceCents / 100).toLocaleString()} (or enter offer)`
                            : 'Enter your budget offer (USD)'
                        }
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-6">
                      <label
                        htmlFor={`req-${service.slug}`}
                        className="flex items-center gap-1 text-xs font-medium text-foreground"
                      >
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Additional Requirements / Scope Notes (Optional)
                      </label>
                      <Textarea
                        id={`req-${service.slug}`}
                        rows={1}
                        value={draft.requirements}
                        onChange={(e) =>
                          updateDraft(service, { requirements: e.target.value })
                        }
                        placeholder="Add specific features, target URLs, timeline, or custom requirements..."
                        className="min-h-[36px] py-1.5 text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row md:col-span-3">
                      <Button asChild size="sm" className="h-9 w-full gap-1.5 text-xs">
                        <Link href={buildPortalOrderHref(service)}>
                          <Lock className="h-3.5 w-3.5" />
                          Proceed to Order
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </div>
  );
}
