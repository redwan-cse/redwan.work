import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content/site';

const PRIVATE_DISALLOW_PATHS = [
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
];

const PUBLIC_ALLOW_PATHS = ['/', '/resume.pdf', '/llms.txt', '/llms-full.txt'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW_PATHS,
        disallow: PRIVATE_DISALLOW_PATHS,
      },
      {
        userAgent: [
          'Googlebot',
          'Bingbot',
          'OAI-SearchBot',
          'GPTBot',
          'ChatGPT-User',
          'PerplexityBot',
          'ClaudeBot',
          'anthropic-ai',
          'Google-Extended',
          'Applebot-Extended',
        ],
        allow: PUBLIC_ALLOW_PATHS,
        disallow: PRIVATE_DISALLOW_PATHS,
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
