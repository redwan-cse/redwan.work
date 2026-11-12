import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CloudCog,
  Code2,
  ExternalLink,
  FileCheck2,
  LifeBuoy,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketingFrame } from '@/components/marketing-frame';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import {
  HeroPortrait,
  HeroReveal,
  HeroRevealItem,
  InteractiveCard,
  ScrollReveal,
} from '@/components/motion/reveal';
import { TestimonialCarousel } from '@/components/testimonial-carousel';
import {
  CEH_CERT_NUMBER,
  CEH_VERIFICATION_URL,
  SERVICE_PILLARS,
  SITE,
  type ServicePillarKey,
} from '@/lib/content/site';
import {
  getApprovedClientReviews,
  getPublicPortfolioItems,
  getPublicServicesCatalog,
} from '@/lib/cms/queries';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPublicMetadata({
  title: `${SITE.name} — ${SITE.shortRole}`,
  description: SITE.tagline,
  path: '/',
});

const PILLAR_ICONS: Record<ServicePillarKey, typeof ShieldAlert> = {
  cybersecurity: ShieldAlert,
  development: Code2,
  cloud_devops: CloudCog,
  ai_ml: Bot,
  tech_support: LifeBuoy,
};

const ORDER_LIFECYCLE_STEPS = [
  {
    step: '01',
    title: 'Select Package or Offer Custom Deal',
    description:
      'Choose a transparent Starter, Standard, or Enterprise tier from our 5 service pillars—or offer a custom deal with your own budget and scope.',
  },
  {
    step: '02',
    title: 'Portal Onboarding, Deposit & Signed RoE',
    description:
      'Access your dedicated Client Portal (`ORD-1001`). Offensive security orders include digital Rules of Engagement (RoE) authorization before testing begins.',
  },
  {
    step: '03',
    title: 'Live Milestone Tracking & Direct Contract Chat',
    description:
      'Track task progress in real time, collaborate directly in live contract chat threads, and review intermediate builds or vulnerability findings.',
  },
  {
    step: '04',
    title: 'Encrypted Vault Delivery & Retainer Care',
    description:
      'Download versioned deliverables (`DLV-1001`) via SHA-256 verified signed links, approve final sign-off, and transition smoothly into long-term retainer support.',
  },
];

export default async function Home() {
  const [services, portfolioItems, approvedReviews] = await Promise.all([
    getPublicServicesCatalog(),
    getPublicPortfolioItems(),
    getApprovedClientReviews(),
  ]);
  const pillars = Object.values(SERVICE_PILLARS);
  const featuredStudies = portfolioItems.slice(0, 6);

  return (
    <MarketingFrame>
      <div className="flex flex-col">
        {/* =====================================================================
            1. ANTIGRAVITY HERO SECTION
           ===================================================================== */}
        <section className="relative overflow-hidden border-b border-border/70">
          <AntigravityHeroField />

          <div className="container relative z-10 py-16 md:py-24 lg:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-12">
              {/* Left Column: Staggered Reveal Copy & Credentials */}
              <HeroReveal className="flex flex-col gap-6 lg:col-span-7">
                <HeroRevealItem>
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-3.5 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="font-mono font-semibold">Offensive Security &amp; Engineering</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground/90">
                      VAPT, Full-Stack Platforms &amp; Executive Tech Consulting
                    </span>
                  </div>
                </HeroRevealItem>

                <HeroRevealItem>
                  <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                    Offensive Security Rigor.{' '}
                    <span className="bg-gradient-to-r from-primary via-primary/85 to-chart-2 bg-clip-text text-transparent">
                      Full-Stack Execution.
                    </span>
                  </h1>
                </HeroRevealItem>

                <HeroRevealItem>
                  <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Hi, I&apos;m <strong className="font-semibold text-foreground">{SITE.name}</strong> — Founder &amp; CEO of{' '}
                    <a
                      href={SITE.company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline decoration-primary/50 underline-offset-4 hover:text-primary"
                    >
                      {SITE.company.name}
                    </a>
                    . I partner with founders, executives, and engineering teams to pentest critical infrastructure, build production web platforms, harden cloud fleets, and resolve high-stakes technical incidents.
                  </p>
                </HeroRevealItem>

                {/* Staggered Credentials Strip & Official EC-Council C|EH Verification Showcase */}
                <HeroRevealItem>
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-wrap gap-2">
                      {SITE.credentials.map((cred) => (
                        <div
                          key={cred.code}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card/80 px-3 py-1.5 text-xs shadow-2xs backdrop-blur-xs"
                        >
                          <span className="font-mono font-bold text-primary">{cred.code}</span>
                          <span className="text-muted-foreground">{cred.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Official EC-Council Logo Showcase (Compliant with EC-Council Logo Usage Guidelines Section 6d:
                        - Original horizontal aspect ratio, no version number on ANSI credential
                        - Clean white background with >= 0.3cm clear spacing
                        - Smaller than candidate name) */}
                    <div className="inline-flex flex-wrap items-center gap-3.5 rounded-xl border border-primary/25 bg-card/85 p-3 shadow-2xs backdrop-blur-xs">
                      <a
                        href={CEH_VERIFICATION_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Verify EC-Council Certified Ethical Hacker (C|EH) Credential on ASPEN"
                        className="inline-flex items-center justify-center rounded-md border border-border/70 bg-white p-3.5 shadow-2xs transition-transform hover:scale-[1.02]"
                      >
                        <Image
                          src="/ceh-logo.jpg"
                          alt="EC-Council Certified Ethical Hacker (C|EH) Official Logo"
                          width={108}
                          height={81}
                          className="h-auto w-[96px] object-contain"
                        />
                      </a>
                      <div className="space-y-0.5 text-xs">
                        <div className="font-semibold text-foreground">
                          Certified Ethical Hacker (C|EH) · ANSI / ISO/IEC 17024 Accredited
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          EC-Council Cert #{CEH_CERT_NUMBER} · Issued Nov 2026
                        </div>
                        <a
                          href={CEH_VERIFICATION_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 pt-0.5 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                        >
                          Verify Official Badge on EC-Council ASPEN
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </HeroRevealItem>

                {/* Primary & Secondary CTAs */}
                <HeroRevealItem>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button asChild size="lg" className="gap-2 rounded-full px-6">
                      <Link href="/services">
                        <Sparkles className="h-4 w-4" />
                        Explore Services &amp; Packages
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="gap-2 rounded-full px-6"
                    >
                      <Link href="/contact">Request Custom Proposal</Link>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="lg"
                      className="gap-2 rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <Link href="/portal">
                        <Lock className="h-4 w-4 text-primary" />
                        Client Portal
                      </Link>
                    </Button>
                  </div>
                </HeroRevealItem>

                {/* Marketplace & Direct Trust Bar */}
                <HeroRevealItem>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Direct Portal Orders &amp; Milestone Billing
                    </span>
                    <a
                      href={SITE.socials.upwork}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      Verified on Upwork <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={SITE.socials.fiverr}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      Fiverr Pro Seller <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </HeroRevealItem>
              </HeroReveal>

              {/* Right Column: Circular Portrait with Gentle Fade/Rise & Hover Blue Halo */}
              <div className="lg:col-span-5">
                <HeroPortrait
                  src={SITE.profileImage}
                  alt={SITE.name}
                  badgeText="Founder @ Fast Cyber Defense"
                  caption="Available for direct portal engagements, custom retainers, and emergency incident response."
                />
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================================
            2. FIVE SERVICE PILLARS (MULTI-DISCIPLINARY CATALOG)
           ===================================================================== */}
        <section className="border-b border-border/70 bg-muted/25 py-20">
          <div className="container">
            <ScrollReveal className="mx-auto mb-14 max-w-3xl text-center">
              <Badge variant="outline" className="mb-3 font-mono text-xs text-primary">
                5 CORE SERVICE PILLARS
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                One Trusted Specialist Across Security, Code &amp; Infrastructure
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Whether you need an OWASP/PTES penetration test, a custom Next.js web platform, Linux server hardening, or emergency recovery—order directly with transparent deliverables.
              </p>
            </ScrollReveal>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pillars.map((pillar, index) => {
                const Icon = PILLAR_ICONS[pillar.key];
                const pillarServices = services.filter((s) => s.pillar === pillar.key);
                const minPrice =
                  pillarServices.length > 0
                    ? Math.min(...pillarServices.map((s) => s.startingPriceCents / 100))
                    : 150;

                return (
                  <ScrollReveal key={pillar.key} delay={index * 0.05} className="h-full">
                    <InteractiveCard className="flex h-full flex-col justify-between p-6">
                      <div>
                        <div className="mb-4 flex items-center justify-between gap-2">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {pillar.badge}
                          </span>
                        </div>

                        <h3 className="text-xl font-semibold tracking-tight">{pillar.label}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {pillar.summary}
                        </p>

                        <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-foreground/90">
                          {pillarServices.map((service) => (
                            <li key={service.slug} className="flex items-start gap-2">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>{service.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                        <div>
                          <span className="block text-[11px] text-muted-foreground">
                            Packages from
                          </span>
                          <span className="font-mono text-base font-bold text-foreground">
                            ${minPrice.toLocaleString()} USD
                          </span>
                        </div>
                        <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
                          <Link href={`/services?pillar=${pillar.key}`}>
                            View Packages
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </InteractiveCard>
                  </ScrollReveal>
                );
              })}

              {/* 6th Card: Custom High-Value Engagement / Retainer Card */}
              <ScrollReveal delay={0.25} className="h-full">
                <InteractiveCard className="flex h-full flex-col justify-between border-primary/35 bg-primary/5 p-6">
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Terminal className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                        Custom Scope &amp; Retainers
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      Have a Complex or High-Priority Requirement?
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Need a dedicated technical partner for a custom software build, multi-asset red-team engagement, or ongoing monthly advisory? Receive a structured milestone proposal within 24 hours.
                    </p>
                    <ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs text-foreground/90">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Mutual NDA &amp; strict operational confidentiality
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Milestone-based invoicing in USD, EUR, GBP, or BDT
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Dedicated Client Portal workspace &amp; encrypted file vault
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                    <span className="font-mono text-xs text-muted-foreground">
                      Response SLA &lt; 12h
                    </span>
                    <Button asChild size="sm" className="gap-1.5 rounded-full">
                      <Link href="/contact">
                        Request Proposal
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </InteractiveCard>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* =====================================================================
            3. HOW CLIENT PORTAL ORDERS WORK
           ===================================================================== */}
        <section className="border-b border-border/70 py-20">
          <div className="container">
            <ScrollReveal className="mx-auto mb-14 max-w-3xl text-center">
              <Badge variant="outline" className="mb-3 font-mono text-xs text-primary">
                END-TO-END CLIENT PORTAL
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Built for Transparent Delivery &amp; Long-Term Partnerships
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Every engagement is managed inside a dedicated, security-hardened Client Portal—from initial proposal to versioned deliverables and ongoing retainers.
              </p>
            </ScrollReveal>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {ORDER_LIFECYCLE_STEPS.map((item, idx) => (
                <ScrollReveal key={item.step} delay={idx * 0.06} className="h-full">
                  <div className="relative flex h-full flex-col rounded-xl border border-border/80 bg-card p-6 shadow-2xs">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-mono text-2xl font-bold text-primary">
                        {item.step}
                      </span>
                      <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* =====================================================================
            4. FEATURED CASE STUDIES & PORTFOLIO
           ===================================================================== */}
        <section className="border-b border-border/70 bg-muted/20 py-20">
          <div className="container">
            <ScrollReveal className="mb-12 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <Badge variant="outline" className="mb-3 font-mono text-xs text-primary">
                  PROVEN TRACK RECORD
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Selected Case Studies &amp; Engineering Work
                </h2>
              </div>
              <Button asChild variant="outline" className="gap-2 self-start rounded-full sm:self-auto">
                <Link href="/portfolio">
                  Explore Full Portfolio
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </ScrollReveal>

            <div className="grid gap-6 md:grid-cols-2">
              {featuredStudies.map((study, index) => (
                <ScrollReveal key={study.code} delay={index * 0.06} className="h-full">
                  <InteractiveCard className="flex h-full flex-col justify-between p-6">
                    <div>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {study.code} · {study.pillarLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">{study.clientSector}</span>
                      </div>
                      <h3 className="text-xl font-bold tracking-tight">{study.title}</h3>
                      <p className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 font-mono text-xs font-medium text-primary">
                        {study.headlineMetric}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {study.summary}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                      <div className="flex flex-wrap gap-1.5">
                        {study.stack.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <Link
                        href={`/portfolio?pillar=${study.pillar}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Inspect Case Study
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </InteractiveCard>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* =====================================================================
            5. CLIENT TESTIMONIALS
           ===================================================================== */}
        <section className="border-b border-border/70 py-20">
          <div className="container">
            <ScrollReveal className="mx-auto mb-12 max-w-2xl text-center">
              <Badge variant="outline" className="mb-3 font-mono text-xs text-primary">
                CLIENT FEEDBACK
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Trusted by Global Founders &amp; Security Teams
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Verified feedback from long-term security, software engineering, and technical consulting engagements.
              </p>
            </ScrollReveal>
            <TestimonialCarousel reviews={approvedReviews} />
          </div>
        </section>

        {/* =====================================================================
            6. CONVERSION CTA SECTION
           ===================================================================== */}
        <section className="py-20">
          <div className="container">
            <ScrollReveal>
              <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-8 shadow-lg sm:p-12">
                <div className="mx-auto max-w-3xl text-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Direct Order Intake Open
                  </span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                    Ready to Secure Your Infrastructure or Ship Your Next Platform?
                  </h2>
                  <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                    Start with a fixed-scope package, request a custom engineering proposal, or book a discovery call directly.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Button asChild size="lg" className="gap-2 rounded-full px-6">
                      <Link href="/services#packages">
                        Browse Service Packages
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="gap-2 rounded-full px-6">
                      <Link href="/contact">Send Project Brief</Link>
                    </Button>
                    <Button asChild variant="ghost" size="lg" className="gap-2 rounded-full">
                      <a
                        href={SITE.calComUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Schedule Discovery Call
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </div>
    </MarketingFrame>
  );
}
