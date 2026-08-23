import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/services', '/portfolio', '/blogs', '/resume', '/contact', '/privacy'];

  return routes.map((route) => ({
    url: `${SITE.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' || route === '/blogs' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route === '/blogs' || route === '/services' ? 0.8 : 0.6,
  }));
}
