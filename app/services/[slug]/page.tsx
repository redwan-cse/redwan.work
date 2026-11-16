import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getPublicPortfolioItems, getPublicServicesCatalog } from '@/lib/cms/queries';
import { SERVICE_PILLARS, SITE } from '@/lib/content/site';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/structured-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const services = await getPublicServicesCatalog();
  const service = services.find((s) => s.slug === slug);
  if (!service) {
    return buildPublicMetadata({
      title: 'Service Not Found',
      description: 'Requested security engineering or development service is unavailable.',
      path: `/services/${slug}`,
      noindex: true,
    });
  }
  return buildPublicMetadata({
    title: service.title,
    description: service.tagline,
    path: `/services/${service.slug}`,
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
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();

  const pillarMeta = SERVICE_PILLARS[service.pillar];
  const relatedStudies = portfolio.filter(
    (p) => p.relatedServiceSlug === service.slug || p.pillar === service.pillar
  ).slice(0, 3);

  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
      { name: service.title, path: `/services/${service.slug}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.title,
      description: service.description || service.tagline,
      provider: {
        '@type': 'Person',
        name: SITE.name,
        url: SITE.url,
      },
      areaServed: 'Worldwide',
      serviceType: pillarMeta?.label ?? service.pillarLabel,
    },
  ];

  return (
    <div className="container py-12 md:py-16">
      {structuredData.map((schema, i) => (
        <script
          key={`service-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}

      <div className="mb-8 space-y-4">
        <Link
          href="/services"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Services &amp; Packages
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {pillarMeta?.label ?? service.pillarLabel}
          </Badge>
          {service.requiresRoe && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 font-mono text-xs text-amber-600 dark:text-amber-400"
            >
              <ShieldAlert className="h-3 w-3" />
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
            <Link href={`/portal/orders/new?service=${service.slug}`}>
              Configure Package &amp; Order <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href={`/contact?service=${service.slug}`}>Request Custom Quote</Link>
          </Button>
        </div>
      </div>

      {/* Methodology & Highlights */}
      <div className="mb-12 grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Engineering Scope &amp; Approach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>{service.description}</p>
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
              <ShieldCheck className="h-4 w-4 text-primary" />
              Core Deliverables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {service.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tiered Packages */}
      <div className="mb-12 space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Available Package Tiers</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {service.packages.map((pkg) => (
            <Card
              key={pkg.tier}
              className={pkg.popular ? 'border-primary/50 bg-card shadow-md' : 'border-border/80 bg-card/85'}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant={pkg.popular ? 'default' : 'outline'} className="font-mono text-[10px] uppercase">
                    {pkg.tier}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {pkg.deliveryDays}d · {pkg.revisions} rev
                  </span>
                </div>
                <CardTitle className="mt-2 text-lg">{pkg.name}</CardTitle>
                <div className="font-mono text-2xl font-extrabold text-primary">
                  ${(pkg.priceCents / 100).toLocaleString()}
                </div>
                <CardDescription className="text-xs">{pkg.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {pkg.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full rounded-full" variant={pkg.popular ? 'default' : 'outline'}>
                  <Link href={`/portal/orders/new?service=${service.slug}&tier=${pkg.tier}`}>
                    Select {pkg.tier.toUpperCase()} Package
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Related Case Studies */}
      {relatedStudies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Related Case Studies</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedStudies.map((study) => (
              <Card key={study.slug} className="border-border/80">
                <CardHeader className="pb-2">
                  <span className="font-mono text-xs font-bold text-primary">{study.code}</span>
                  <CardTitle className="text-base">{study.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="line-clamp-3 text-muted-foreground">{study.summary}</p>
                  <Link
                    href={`/portfolio/${study.slug}`}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    Read Case Study <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
