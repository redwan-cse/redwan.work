import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { getPublicPortfolioItems } from '@/lib/cms/queries';
import { SERVICE_PILLARS, SITE } from '@/lib/content/site';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/structured-data';
import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const items = await getPublicPortfolioItems();
  const study = items.find((i) => i.slug === slug);
  if (!study) {
    return buildPublicMetadata({
      title: 'Case Study Not Found',
      description: 'Requested case study is unavailable.',
      path: `/portfolio/${slug}`,
      noindex: true,
    });
  }
  return buildPublicMetadata({
    title: `${study.code}: ${study.title}`,
    description: study.summary,
    path: `/portfolio/${study.slug}`,
  });
}

export default async function PortfolioCaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const items = await getPublicPortfolioItems();
  const study = items.find((i) => i.slug === slug);
  if (!study) notFound();

  const pillarMeta = SERVICE_PILLARS[study.pillar];
  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Portfolio', path: '/portfolio' },
      { name: study.title, path: `/portfolio/${study.slug}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: `${study.code}: ${study.title}`,
      description: study.summary,
      datePublished: study.year,
      author: {
        '@type': 'Person',
        name: SITE.name,
        url: SITE.url,
      },
      keywords: study.stack.join(', '),
    },
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
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Problem Statement
              </h2>
              <p className="leading-relaxed text-muted-foreground">{study.challenge}</p>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Execution Steps
              </h2>
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
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tools &amp; Technologies
              </h2>
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
    </div>
  );
}
