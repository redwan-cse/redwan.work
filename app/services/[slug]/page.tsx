import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';
import { getRelatedBlogPosts, stripHtmlToPlainText } from '@/lib/blogger';
import { getPublicPortfolioItems, getPublicServicesCatalog } from '@/lib/cms/queries';
import { SERVICE_CATALOG, SERVICE_PILLARS, SITE } from '@/lib/content/site';
import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { getServiceSeoPlaybook } from '@/lib/seo/service-playbooks';
import {
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  buildServiceDetailJsonLd,
} from '@/lib/seo/structured-data';
import { FaqSection } from '@/components/faq-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const revalidate = 300;

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  try {
    const services = await getPublicServicesCatalog();
    if (services.length > 0) {
      return services.map((service) => ({ slug: service.slug }));
    }
  } catch {
    // Fall back to canonical catalog slugs during offline static builds.
  }
  return SERVICE_CATALOG.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const services = await getPublicServicesCatalog();
  const service = services.find((s) => s.slug === slug);
  if (!service) {
    notFound();
  }
  const startUsd = Math.round(service.startingPriceCents / 100).toLocaleString('en-US');
  const rawDescription = `${service.tagline}. Fixed-scope packages from $${startUsd} USD (${service.deliveryDaysMin}–${service.deliveryDaysMax}d delivery) by ${SITE.name}.`;
  const description =
    rawDescription.length > 160 ? `${rawDescription.slice(0, 157).trimEnd()}...` : rawDescription;

  return buildPublicMetadata({
    title: service.title,
    description,
    path: `/services/${service.slug}`,
    image: {
      url: `/services/${service.slug}/opengraph-image`,
      width: 1200,
      height: 630,
      alt: `${service.title} — ${SITE.name}`,
    },
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [services, portfolio] = await Promise.all([
    getPublicServicesCatalog(),
    getPublicPortfolioItems(),
  ]);
  const serviceIndex = services.findIndex((s) => s.slug === slug);
  const service = serviceIndex >= 0 ? services[serviceIndex] : undefined;
  if (!service) notFound();

  const pillarMeta = SERVICE_PILLARS[service.pillar];
  const playbook = getServiceSeoPlaybook(service);
  const relatedPosts = await getRelatedBlogPosts(playbook.blogKeywords, 3);

  const relatedStudies = portfolio
    .filter((p) => p.relatedServiceSlug === service.slug || p.pillar === service.pillar)
    .slice(0, 3);

  // Deterministically rotate sibling services so every service detail page receives strong inbound links.
  const rotatedSiblings = [
    ...services.slice(serviceIndex + 1),
    ...services.slice(0, serviceIndex),
  ];
  const samePillarSiblings = rotatedSiblings.filter((s) => s.pillar === service.pillar);
  const otherPillarSiblings = rotatedSiblings.filter((s) => s.pillar !== service.pillar);
  const relatedServices = [...samePillarSiblings, ...otherPillarSiblings].slice(0, 3);

  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
      { name: service.title, path: `/services/${service.slug}` },
    ]),
    buildServiceDetailJsonLd(service),
    buildFaqPageJsonLd(playbook.faqs),
  ];

  return (
    <div>
      {structuredData.map((schema, i) => (
        <script
          key={`service-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}

      <div className="container py-12 md:py-16">
        <div className="mb-8 space-y-4">
          <Link
            href="/services"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All Services &amp; Packages
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {pillarMeta?.label ?? service.pillarLabel}
            </Badge>
            {service.requiresRoe && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-600/40 bg-amber-500/10 font-mono text-xs text-amber-800 dark:border-amber-400/40 dark:text-amber-300"
              >
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                Rules of Engagement Governed
              </Badge>
            )}
          </div>

          <h1 className="max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">
            {service.title}
          </h1>
          <p className="max-w-3xl text-base text-muted-foreground">{service.tagline}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild size="sm" className="gap-1.5 rounded-full">
              <Link
                href={`/portal/orders/new?service=${service.slug}`}
                rel="nofollow"
                prefetch={false}
              >
                Configure Package &amp; Order <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link href={`/contact?service=${service.slug}`}>Request Custom Quote</Link>
            </Button>
          </div>
        </div>

        {/* Methodology, Executive Context & Deliverables */}
        <div className="mb-12 grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle className="text-lg">Engineering Scope &amp; Approach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>{service.description}</p>
              <p>{playbook.executiveOverview}</p>
              {(service.toolsTags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {(service.toolsTags ?? []).map((tag) => (
                    <Badge key={tag} variant="outline" className="font-mono text-[11px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Core Deliverables &amp; Governance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="space-y-2 text-sm">
                {service.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border/70 pt-4">
                <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Delivery &amp; Security Standards
                </h3>
                <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  {playbook.governanceStandards.map((standard) => (
                    <li key={standard} className="flex items-start gap-1.5">
                      <CheckCircle2
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80"
                        aria-hidden="true"
                      />
                      <span>{standard}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ideal Use Cases */}
        <section aria-labelledby="ideal-for-heading" className="mb-12 space-y-4">
          <div className="space-y-1">
            <Badge variant="outline" className="gap-1.5 font-mono text-xs text-primary">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              BEST FIT SCENARIOS
            </Badge>
            <h2 id="ideal-for-heading" className="text-2xl font-bold tracking-tight">
              Who This Service Is Built For
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {playbook.idealFor.map((scenario) => (
              <div
                key={scenario}
                className="flex items-start gap-3 rounded-xl border border-border/80 bg-card/80 p-4 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>{scenario}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 4-Step Engagement Workflow */}
        <section aria-labelledby="workflow-heading" className="mb-12 space-y-4">
          <div className="space-y-1">
            <Badge variant="outline" className="gap-1.5 font-mono text-xs text-primary">
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
              EXECUTION PROCESS
            </Badge>
            <h2 id="workflow-heading" className="text-2xl font-bold tracking-tight">
              How Delivery Works Step by Step
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {playbook.workflowSteps.map((step) => (
              <Card key={step.phase} className="border-border/80 bg-card/85">
                <CardHeader className="pb-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                    {step.phase}
                  </span>
                  <CardTitle as="h3" className="text-base leading-snug">
                    {step.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs leading-relaxed text-muted-foreground">
                  {step.detail}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Tiered Packages */}
        <section aria-labelledby="packages-heading" className="mb-12 space-y-4">
          <h2 id="packages-heading" className="text-2xl font-bold tracking-tight">
            Available Package Tiers
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {service.packages.map((pkg) => (
              <Card
                key={pkg.tier}
                className={
                  pkg.popular ? 'border-primary/50 bg-card shadow-md' : 'border-border/80 bg-card/85'
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={pkg.popular ? 'default' : 'outline'}
                      className="font-mono text-[10px] uppercase"
                    >
                      {pkg.tier}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {pkg.deliveryDays}d · {pkg.revisions} rev
                    </span>
                  </div>
                  <CardTitle as="h3" className="mt-2 text-lg">
                    {pkg.name}
                  </CardTitle>
                  <div className="font-mono text-2xl font-extrabold text-primary">
                    ${(pkg.priceCents / 100).toLocaleString()}
                  </div>
                  <CardDescription className="text-xs">{pkg.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {pkg.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-1.5">
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="w-full rounded-full"
                    variant={pkg.popular ? 'default' : 'outline'}
                  >
                    <Link
                      href={`/portal/orders/new?service=${service.slug}&tier=${pkg.tier}`}
                      rel="nofollow"
                      prefetch={false}
                    >
                      Select {pkg.tier.toUpperCase()} Package
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Related Case Studies */}
        {relatedStudies.length > 0 && (
          <section aria-labelledby="related-studies-heading" className="mb-12 space-y-4">
            <h2 id="related-studies-heading" className="text-2xl font-bold tracking-tight">
              Related Case Studies
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedStudies.map((study) => (
                <Card key={study.slug} className="border-border/80">
                  <CardHeader className="pb-2">
                    <span className="font-mono text-xs font-bold text-primary">{study.code}</span>
                    <CardTitle as="h3" className="text-base">
                      {study.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <p className="line-clamp-3 text-muted-foreground">{study.summary}</p>
                    <Link
                      href={`/portfolio/${study.slug}`}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      Read Case Study <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Related Technical Articles from blogs.redwan.work */}
        {relatedPosts.length > 0 && (
          <section aria-labelledby="related-articles-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <Badge variant="outline" className="gap-1.5 font-mono text-xs text-primary">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  TECHNICAL DISPATCHES
                </Badge>
                <h2 id="related-articles-heading" className="text-2xl font-bold tracking-tight">
                  Related Technical Articles
                </h2>
              </div>
              <Link
                href="/blogs"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Browse All Articles <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedPosts.map((post) => {
                const safePostUrl = trySanitizeHttpUrl(post.url);
                if (!safePostUrl) return null;
                const excerpt = stripHtmlToPlainText(post.content).slice(0, 150);
                return (
                  <Card key={post.id} className="flex flex-col justify-between border-border/80">
                    <CardHeader className="pb-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {post.published.slice(0, 10)}
                      </span>
                      <CardTitle as="h3" className="line-clamp-2 text-base leading-snug">
                        {post.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      {excerpt && (
                        <p className="line-clamp-3 leading-relaxed text-muted-foreground">
                          {excerpt}...
                        </p>
                      )}
                      <a
                        href={safePostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Read on blogs.redwan.work{' '}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Service-Specific FAQ (matches emitted FAQPage JSON-LD 1:1) */}
      <FaqSection
        faqs={playbook.faqs}
        heading={`${service.title} — Frequently Asked Questions`}
        description={`Direct answers regarding scope, methodology, security governance, and delivery timelines for ${service.title}.`}
      />

      {/* Cross-Link Related Services Across Pillars */}
      {relatedServices.length > 0 && (
        <section
          aria-labelledby="related-services-heading"
          className="border-t border-border/70 bg-muted/20 py-14"
        >
          <div className="container space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <Badge variant="outline" className="gap-1.5 font-mono text-xs text-primary">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  COMPLEMENTARY CAPABILITIES
                </Badge>
                <h2 id="related-services-heading" className="text-2xl font-bold tracking-tight">
                  Explore Related Services
                </h2>
              </div>
              <Link
                href="/services"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Compare All Services <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedServices.map((sibling) => (
                <Card key={sibling.slug} className="flex flex-col justify-between border-border/80 bg-card/90">
                  <CardHeader className="pb-2">
                    <span className="font-mono text-[11px] text-primary">
                      From ${Math.round(sibling.startingPriceCents / 100).toLocaleString('en-US')} USD
                      {' · '}
                      {sibling.deliveryDaysMin}–{sibling.deliveryDaysMax}d
                    </span>
                    <CardTitle as="h3" className="text-base leading-snug">
                      {sibling.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <p className="line-clamp-3 leading-relaxed text-muted-foreground">
                      {sibling.tagline}
                    </p>
                    <Link
                      href={`/services/${sibling.slug}`}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      Explore Package Details <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
