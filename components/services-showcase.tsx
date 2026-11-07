'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  CloudCog,
  Code2,
  LifeBuoy,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        {filteredServices.map((service) => (
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
                  <Button asChild size="sm" variant="secondary" className="gap-1.5 rounded-full">
                    <Link href={`/portal/orders/new?service=${service.slug}&tier=custom`}>
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      Offer Custom Deal in Portal
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={`/contact?service=${service.slug}&tier=custom`}>
                      Propose Custom Scope
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
                {service.packages.map((pkg) => (
                  <InteractiveCard
                    key={pkg.tier}
                    className={cn(
                      'flex flex-col justify-between p-6',
                      pkg.popular && 'border-primary/60 ring-1 ring-primary/25'
                    )}
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="rounded-md bg-muted px-2.5 py-0.5 font-mono text-xs font-semibold uppercase text-foreground">
                          {pkg.tier}
                        </span>
                        {pkg.popular && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">
                            <Sparkles className="h-3 w-3" />
                            Most Selected
                          </span>
                        )}
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
                        <span>
                          {pkg.depositPercent}% kickoff deposit
                        </span>
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
                        variant={pkg.popular ? 'default' : 'secondary'}
                        size="sm"
                        className="w-full gap-1.5 rounded-full text-xs"
                      >
                        <Link
                          href={`/portal/orders/new?service=${service.slug}&tier=${pkg.tier}`}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Order in Portal
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="w-full gap-1 rounded-full text-xs"
                      >
                        <Link
                          href={`/contact?service=${service.slug}&tier=${pkg.tier}`}
                        >
                          Inquire First
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </InteractiveCard>
                ))}
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
