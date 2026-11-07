import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem, ScrollReveal } from '@/components/motion/reveal';
import { PortfolioShowcase } from '@/components/portfolio-showcase';
import { getPublicPortfolioItems } from '@/lib/cms/queries';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Portfolio & Case Studies — VAPT, Full-Stack Platforms, SIEM & AI Research',
  description:
    'Explore offensive security assessments, production full-stack applications, Wazuh SIEM deployments, and peer-reviewed Q1 Scopus / IEEE machine learning research by Md. Redwan Ahmed.',
  path: '/portfolio',
});

export default async function PortfolioPage() {
  const portfolioItems = await getPublicPortfolioItems();
  return (
      <div className="flex flex-col">
        {/* Hero Header */}
        <section className="relative overflow-hidden border-b border-border/70 py-16 md:py-20">
          <AntigravityHeroField />
          <div className="container relative z-10">
            <HeroReveal className="mx-auto max-w-4xl text-center">
              <HeroRevealItem>
                <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  CASE STUDIES · ENGINEERING · RESEARCH
                </Badge>
              </HeroRevealItem>
              <HeroRevealItem>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  Selected Security, Software &amp; Research Portfolio
                </h1>
              </HeroRevealItem>
              <HeroRevealItem>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Sanitized case studies across offensive security engagements, full-stack web applications, Wazuh SIEM infrastructure, and peer-reviewed AI/ML publications.
                </p>
              </HeroRevealItem>
            </HeroReveal>
          </div>
        </section>

        {/* Interactive Portfolio Grid */}
        <section className="py-16">
          <div className="container">
            <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading case studies...</div>}>
              <PortfolioShowcase initialItems={portfolioItems} />
            </Suspense>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border/70 bg-muted/20 py-16">
          <div className="container">
            <ScrollReveal className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-6 rounded-2xl border border-border/80 bg-card p-8 text-center sm:flex-row sm:text-left">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">
                  Want Similar Results for Your Organization?
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Browse fixed-price packages across all 5 service pillars or request a tailored proposal.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button asChild className="gap-1.5 rounded-full">
                  <Link href="/services">
                    Browse Service Packages
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/contact">Contact Directly</Link>
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </div>
  );
}
