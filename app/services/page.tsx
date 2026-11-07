import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem, ScrollReveal } from '@/components/motion/reveal';
import { ServicesShowcase } from '@/components/services-showcase';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Services & Tiered Packages — Cybersecurity, Full-Stack, Cloud & AI',
  description:
    'Order Penetration Testing (VAPT), Full-Stack Web & Portal Engineering, Cloud/Linux Hardening, AI/ML Pipelines, and Emergency Incident Recovery.',
  path: '/services',
});

export default async function ServicesPage() {
  const services = await getPublicServicesCatalog();
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
                  5 SERVICE PILLARS · TRANSPARENT PACKAGES
                </Badge>
              </HeroRevealItem>
              <HeroRevealItem>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  Service Catalog &amp; Direct Engagement Packages
                </h1>
              </HeroRevealItem>
              <HeroRevealItem>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Select a fixed-scope package to launch immediately in the Client Portal, or request a custom milestone proposal tailored to your technical architecture and timeline.
                </p>
              </HeroRevealItem>
              <HeroRevealItem>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    OWASP &amp; PTES Security Standards
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Encrypted Deliverables Vault
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Multi-Currency Invoices (USD · EUR · GBP · BDT)
                  </span>
                </div>
              </HeroRevealItem>
            </HeroReveal>
          </div>
        </section>

        {/* Interactive 5-Pillar Catalog & Packages */}
        <section className="py-16">
          <div className="container">
            <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading service catalog...</div>}>
              <ServicesShowcase initialServices={services} />
            </Suspense>
          </div>
        </section>

        {/* Custom Enterprise / Retainer Banner */}
        <section className="border-t border-border/70 bg-muted/20 py-16">
          <div className="container">
            <ScrollReveal className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-6 rounded-2xl border border-border/80 bg-card p-8 text-center sm:flex-row sm:text-left">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">
                  Need a Custom Scope or Multi-Month Retainer?
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Tell me what you are building or defending. You will receive a structured proposal (`PRP-1001`) with clear milestones, deliverables, and pricing.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button asChild className="gap-1.5 rounded-full">
                  <Link href="/contact">
                    Request Custom Proposal
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-1.5 rounded-full">
                  <Link href="/portal">
                    <Lock className="h-4 w-4 text-primary" />
                    Client Portal
                  </Link>
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </div>
  );
}
