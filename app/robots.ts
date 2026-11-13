import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/auth/callback',
          '/admin',
          '/portal',
          '/login',
          '/register',
          '/mfa',
          '/reset-password',
          '/invite',
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
