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

export function resolveVerificationToken(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^\.+$/.test(trimmed)) return undefined;
  if (/^(?:replace|your[-_]|placeholder|example|todo|changeme)/i.test(trimmed)) {
    return undefined;
  }
  return /^[A-Za-z0-9._-]{8,}$/.test(trimmed) ? trimmed : undefined;
}

export function resolveSiteVerificationMetadata(): Metadata['verification'] | undefined {
  const google = resolveVerificationToken(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION);
  const bing = resolveVerificationToken(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION);
  if (!google && !bing) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { 'msvalidate.01': bing } } : {}),
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
