import type { Metadata } from 'next';
import { SITE } from '@/lib/content/site';

export interface BuildPublicMetadataInput {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

export function buildPublicMetadata({
  title,
  description,
  path,
  noindex = false,
}: BuildPublicMetadataInput): Metadata {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = normalizedPath === '/' ? SITE.url : `${SITE.url}${normalizedPath}`;

  return {
    title,
    description,
    alternates: {
      canonical: normalizedPath,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: SITE.name,
      url: fullUrl,
      title,
      description,
      images: [
        {
          url: SITE.profileImage,
          width: 800,
          height: 800,
          alt: SITE.name,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [SITE.profileImage],
    },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
