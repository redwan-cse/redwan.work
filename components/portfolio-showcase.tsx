'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CloudCog,
  Code2,
  ExternalLink,
  LifeBuoy,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InteractiveCard, ScrollReveal } from '@/components/motion/reveal';
import {
  PORTFOLIO_ITEMS,
  type PortfolioCaseStudy,
  type ServicePillarKey,
} from '@/lib/content/site';
import { cn } from '@/lib/utils';

export { PORTFOLIO_ITEMS, type PortfolioCaseStudy };

const FILTER_TABS: Array<{
  key: 'all' | ServicePillarKey;
  label: string;
  icon: typeof ShieldAlert;
}> = [
  { key: 'all', label: 'All Work', icon: Sparkles },
  { key: 'cybersecurity', label: 'Cybersecurity & VAPT', icon: ShieldAlert },
  { key: 'development', label: 'Full-Stack Dev', icon: Code2 },
  { key: 'cloud_devops', label: 'SIEM & Cloud Ops', icon: CloudCog },
  { key: 'ai_ml', label: 'AI/ML & Research', icon: Bot },
  { key: 'tech_support', label: 'Incident Recovery', icon: LifeBuoy },
];

export function PortfolioShowcase({
  initialItems,
}: {
  initialItems?: PortfolioCaseStudy[];
}) {
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const initialCategory = (searchParams?.get('pillar') ||
    searchParams?.get('category')) as ServicePillarKey | null;

  const [selectedCategory, setSelectedCategory] = useState<'all' | ServicePillarKey>(
    initialCategory && FILTER_TABS.some((t) => t.key === initialCategory)
      ? initialCategory
      : 'all'
  );
  const [activeStudy, setActiveStudy] = useState<PortfolioCaseStudy | null>(null);

  const items = useMemo(
    () => (initialItems && initialItems.length > 0 ? initialItems : PORTFOLIO_ITEMS),
    [initialItems]
  );

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items;
    return items.filter((item) => item.pillar === selectedCategory);
  }, [items, selectedCategory]);

  return (
    <div className="space-y-10">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {FILTER_TABS.map(({ key, label, icon: Icon }) => {
          const isActive = selectedCategory === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategory(key)}
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
                    layoutId="portfolio-filter-pill"
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

      {/* Case Studies Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map((study, idx) => (
          <ScrollReveal key={study.id} delay={idx * 0.05} className="h-full">
            <InteractiveCard className="flex h-full flex-col justify-between p-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-[11px] text-primary">
                    {study.code} · {study.year}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {study.pillarLabel}
                  </span>
                </div>

                <h2 className="text-xl font-bold tracking-tight">{study.title}</h2>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {study.clientSector}
                </p>

                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 font-mono text-xs font-medium text-primary">
                  {study.headlineMetric}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {study.summary}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {study.stack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => setActiveStudy(study)}
                >
                  Read Full Case Study
                </Button>
                <Button asChild variant="ghost" size="sm" className="gap-1 rounded-full text-xs text-primary">
                  <Link href={`/services?pillar=${study.pillar}`}>
                    Order Similar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </InteractiveCard>
          </ScrollReveal>
        ))}
      </div>

      {/* Case Study Modal Dialog */}
      <Dialog
        open={Boolean(activeStudy)}
        onOpenChange={(open) => {
          if (!open) setActiveStudy(null);
        }}
      >
        {activeStudy && (
          <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs text-primary">
                  {activeStudy.code} · {activeStudy.pillarLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {activeStudy.clientSector} ({activeStudy.year})
                </span>
              </div>
              <DialogTitle className="text-2xl font-bold">
                {activeStudy.title}
              </DialogTitle>
              <DialogDescription className="rounded-md border border-primary/20 bg-primary/8 px-3 py-2 font-mono text-xs font-medium text-primary">
                {activeStudy.headlineMetric}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 text-sm">
              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  1. The Challenge
                </h4>
                <p className="mt-1.5 leading-relaxed text-foreground/90">
                  {activeStudy.challenge}
                </p>
              </div>

              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  2. Technical Execution &amp; Methodology
                </h4>
                <ul className="mt-2 space-y-2">
                  {activeStudy.approach.map((step) => (
                    <li key={step} className="flex items-start gap-2 text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  3. Verified Outcomes
                </h4>
                <ul className="mt-2 space-y-2">
                  {activeStudy.outcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2 text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
                {activeStudy.stack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                {activeStudy.externalUrl && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
                    <Link
                      href={activeStudy.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Research / Details
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" className="gap-1.5 rounded-full">
                  <Link href={`/contact?service=${activeStudy.relatedServiceSlug}`}>
                    Start a Similar Engagement
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
