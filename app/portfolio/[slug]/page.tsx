import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { getPublicPortfolioItems } from '@/lib/cms/queries';
import { PORTFOLIO_ITEMS, SERVICE_PILLARS, SITE } from '@/lib/content/site';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd, buildCaseStudyJsonLd } from '@/lib/seo/structured-data';
import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const revalidate = 300;

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  try {
    const items = await getPublicPortfolioItems();
    if (items.length > 0) {
      return items.map((item) => ({ slug: item.slug }));
    }
  } catch {
    // Fall back to canonical case-study slugs during offline static builds.
  }
  return PORTFOLIO_ITEMS.map((item) => ({ slug: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const items = await getPublicPortfolioItems();
  const study = items.find((i) => i.slug === slug);
  if (!study) {
    notFound();
  }
  return buildPublicMetadata({
    title: `${study.code}: ${study.title}`,
    description: study.summary,
    path: `/portfolio/${study.slug}`,
    image: {
      url: `/portfolio/${study.slug}/opengraph-image`,
      width: 1200,
      height: 630,
      alt: `${study.code}: ${study.title} — ${SITE.name}`,
    },
  });
}

export default async function PortfolioCaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const items = await getPublicPortfolioItems();
  const studyIndex = items.findIndex((i) => i.slug === slug);
  const study = studyIndex >= 0 ? items[studyIndex] : undefined;
  if (!study) notFound();

  const rotatedSiblings = [
    ...items.slice(studyIndex + 1),
    ...items.slice(0, studyIndex),
  ];
  const relatedStudies = [
    ...rotatedSiblings.filter((item) => item.pillar === study.pillar),
    ...rotatedSiblings.filter((item) => item.pillar !== study.pillar),
  ].slice(0, 3);

  const pillarMeta = SERVICE_PILLARS[study.pillar];
  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Portfolio', path: '/portfolio' },
      { name: study.title, path: `/portfolio/${study.slug}` },
    ]),
    buildCaseStudyJsonLd(study),
  ];

  return (
    <div className="container py-12 md:py-16">
      {structuredData.map((schema, i) => (
        <script
          key={`portfolio-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}

      <div className="mb-8 space-y-4">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Case Studies
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs text-primary">
            {study.code}
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            {pillarMeta?.shortLabel ?? study.pillar}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {study.clientSector} · {study.year}
          </Badge>
        </div>

        <h1 className="max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">
          {study.title}
        </h1>

        <div className="inline-block rounded-full border border-primary/30 bg-primary/8 px-3.5 py-1 font-mono text-xs font-semibold text-primary">
          {study.headlineMetric}
        </div>

        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          {study.summary}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href={`/services/${study.relatedServiceSlug}`}>
              View Related Service Package <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {(() => {
            const safeExternalUrl = trySanitizeHttpUrl(study.externalUrl);
            if (!safeExternalUrl) return null;
            return (
              <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-full">
                <a href={safeExternalUrl} target="_blank" rel="noopener noreferrer">
                  Reference / Source <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            );
          })()}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle className="text-lg">Challenge &amp; Engineering Approach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Problem Statement
              </h3>
              <p className="leading-relaxed text-muted-foreground">{study.challenge}</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Execution Steps
              </h3>
              <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                {study.approach.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle className="text-lg">Verified Outcomes &amp; Architecture Stack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <ul className="space-y-2">
              {study.outcomes.map((outcome) => (
                <li key={outcome} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tools &amp; Technologies
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {study.stack.map((tech) => (
                  <Badge key={tech} variant="outline" className="font-mono text-xs">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sibling Case Studies & Conversion CTA */}
      {relatedStudies.length > 0 && (
        <section aria-labelledby="more-case-studies-heading" className="mt-12 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="more-case-studies-heading" className="text-2xl font-bold tracking-tight">
              More Case Studies
            </h2>
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View Full Portfolio <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedStudies.map((sibling) => (
              <Card key={sibling.slug} className="flex flex-col justify-between border-border/80">
                <CardHeader className="pb-2">
                  <span className="font-mono text-xs font-bold text-primary">{sibling.code}</span>
                  <CardTitle as="h3" className="text-base leading-snug">
                    {sibling.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="line-clamp-3 leading-relaxed text-muted-foreground">
                    {sibling.summary}
                  </p>
                  <Link
                    href={`/portfolio/${sibling.slug}`}
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

      <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card/85 p-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight">
            Planning a Similar Security or Engineering Engagement?
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Review fixed-scope packages or request a tailored milestone proposal for your architecture.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href={`/services/${study.relatedServiceSlug}`}>
              Explore Service <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href={`/contact?service=${study.relatedServiceSlug}`}>Request Proposal</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
