import type { MetadataRoute } from 'next';
import { getLatestBlogPostTimestamp } from '@/lib/blogger';
import { PORTFOLIO_ITEMS, SERVICE_CATALOG, SITE } from '@/lib/content/site';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const revalidate = 3600;

const FALLBACK_LAST_MODIFIED = '2026-11-04T00:00:00.000Z';

function parseIsoOrNull(candidate: unknown): string | null {
  if (typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) {
    return new Date(candidate).toISOString();
  }
  return null;
}

async function resolveLatestBlogTimestamp(): Promise<string> {
  try {
    const candidate = await getLatestBlogPostTimestamp();
    return parseIsoOrNull(candidate) ?? FALLBACK_LAST_MODIFIED;
  } catch {
    return FALLBACK_LAST_MODIFIED;
  }
}

async function resolveLatestTimestamp(
  table: 'site_settings' | 'resume_items'
): Promise<string> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from(table)
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (!error) {
      return parseIsoOrNull(data?.[0]?.updated_at) ?? FALLBACK_LAST_MODIFIED;
    }
    return FALLBACK_LAST_MODIFIED;
  } catch {
    return FALLBACK_LAST_MODIFIED;
  }
}

async function resolvePublicServicesForSitemap(): Promise<{
  slugs: Array<{ slug: string; updatedAt: string }>;
  latestUpdated: string;
}> {
  const fallback = SERVICE_CATALOG.map((svc) => ({
    slug: svc.slug,
    updatedAt: FALLBACK_LAST_MODIFIED,
  }));
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('services')
      .select('slug, updated_at')
      .eq('is_public', true)
      .order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) {
      return { slugs: fallback, latestUpdated: FALLBACK_LAST_MODIFIED };
    }
    const slugs = data.map((row) => ({
      slug: row.slug,
      updatedAt: parseIsoOrNull(row.updated_at) ?? FALLBACK_LAST_MODIFIED,
    }));
    const latestUpdated =
      slugs.map((s) => s.updatedAt).sort().at(-1) ?? FALLBACK_LAST_MODIFIED;
    return { slugs, latestUpdated };
  } catch {
    return { slugs: fallback, latestUpdated: FALLBACK_LAST_MODIFIED };
  }
}

async function resolvePublicPortfolioForSitemap(): Promise<{
  slugs: Array<{ slug: string; updatedAt: string }>;
  latestUpdated: string;
}> {
  const fallback = PORTFOLIO_ITEMS.map((item) => ({
    slug: item.id,
    updatedAt: FALLBACK_LAST_MODIFIED,
  }));
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('portfolio_items')
      .select('slug, updated_at')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) {
      return { slugs: fallback, latestUpdated: FALLBACK_LAST_MODIFIED };
    }
    const slugs = data.map((row) => ({
      slug: row.slug,
      updatedAt: parseIsoOrNull(row.updated_at) ?? FALLBACK_LAST_MODIFIED,
    }));
    const latestUpdated =
      slugs.map((s) => s.updatedAt).sort().at(-1) ?? FALLBACK_LAST_MODIFIED;
    return { slugs, latestUpdated };
  } catch {
    return { slugs: fallback, latestUpdated: FALLBACK_LAST_MODIFIED };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    siteUpdated,
    resumeUpdated,
    blogsUpdated,
    servicesResult,
    portfolioResult,
  ] = await Promise.all([
    resolveLatestTimestamp('site_settings'),
    resolveLatestTimestamp('resume_items'),
    resolveLatestBlogTimestamp(),
    resolvePublicServicesForSitemap(),
    resolvePublicPortfolioForSitemap(),
  ]);

  const servicesUpdated = servicesResult.latestUpdated;
  const portfolioUpdated = portfolioResult.latestUpdated;

  const homeModified =
    [siteUpdated, servicesUpdated, portfolioUpdated, resumeUpdated, blogsUpdated].sort().at(-1) ??
    FALLBACK_LAST_MODIFIED;

  const entries: Array<{
    route: string;
    lastModified: string;
    changeFrequency: 'weekly' | 'monthly';
    priority: number;
  }> = [
    { route: '', lastModified: homeModified, changeFrequency: 'weekly', priority: 1 },
    { route: '/services', lastModified: servicesUpdated, changeFrequency: 'monthly', priority: 0.8 },
    { route: '/portfolio', lastModified: portfolioUpdated, changeFrequency: 'monthly', priority: 0.7 },
    { route: '/blogs', lastModified: blogsUpdated, changeFrequency: 'weekly', priority: 0.8 },
    { route: '/resume', lastModified: resumeUpdated, changeFrequency: 'monthly', priority: 0.6 },
    { route: '/contact', lastModified: siteUpdated, changeFrequency: 'monthly', priority: 0.6 },
    { route: '/privacy', lastModified: FALLBACK_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
    { route: '/tos', lastModified: FALLBACK_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
    ...servicesResult.slugs.map((svc) => ({
      route: `/services/${svc.slug}`,
      lastModified: svc.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
    ...portfolioResult.slugs.map((item) => ({
      route: `/portfolio/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.65,
    })),
  ];

  return entries.map((entry) => ({
    url: `${SITE.url}${entry.route}`,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
