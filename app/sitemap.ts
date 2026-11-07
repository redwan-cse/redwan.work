import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content/site';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const FALLBACK_LAST_MODIFIED = '2026-11-04T00:00:00.000Z';

async function resolveLatestTimestamp(
  table: 'site_settings' | 'services' | 'portfolio_items' | 'resume_items'
): Promise<string> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from(table)
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    const candidate = data?.[0]?.updated_at;
    if (!error && typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) {
      return new Date(candidate).toISOString();
    }
    return FALLBACK_LAST_MODIFIED;
  } catch {
    return FALLBACK_LAST_MODIFIED;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [siteUpdated, servicesUpdated, portfolioUpdated, resumeUpdated] = await Promise.all([
    resolveLatestTimestamp('site_settings'),
    resolveLatestTimestamp('services'),
    resolveLatestTimestamp('portfolio_items'),
    resolveLatestTimestamp('resume_items'),
  ]);

  const homeModified = [siteUpdated, servicesUpdated, portfolioUpdated, resumeUpdated].sort().at(-1) ?? FALLBACK_LAST_MODIFIED;

  const entries: Array<{
    route: string;
    lastModified: string;
    changeFrequency: 'weekly' | 'monthly';
    priority: number;
  }> = [
    { route: '', lastModified: homeModified, changeFrequency: 'weekly', priority: 1 },
    { route: '/services', lastModified: servicesUpdated, changeFrequency: 'monthly', priority: 0.8 },
    { route: '/portfolio', lastModified: portfolioUpdated, changeFrequency: 'monthly', priority: 0.7 },
    { route: '/blogs', lastModified: FALLBACK_LAST_MODIFIED, changeFrequency: 'weekly', priority: 0.8 },
    { route: '/resume', lastModified: resumeUpdated, changeFrequency: 'monthly', priority: 0.6 },
    { route: '/contact', lastModified: siteUpdated, changeFrequency: 'monthly', priority: 0.6 },
    { route: '/privacy', lastModified: FALLBACK_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
    { route: '/tos', lastModified: FALLBACK_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
  ];

  return entries.map((entry) => ({
    url: `${SITE.url}${entry.route}`,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
