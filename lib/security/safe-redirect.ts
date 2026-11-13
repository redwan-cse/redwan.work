const VALIDATION_ORIGIN = 'https://return-path.invalid';

function hasControlOrBackslash(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127 || code === 92) {
      return true;
    }
  }
  return false;
}

export function sanitizeRelativeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  if (hasControlOrBackslash(raw)) {
    return null;
  }

  let decodedRaw: string;
  try {
    decodedRaw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (
    !decodedRaw.startsWith('/') ||
    decodedRaw.startsWith('//') ||
    hasControlOrBackslash(decodedRaw)
  ) {
    return null;
  }

  try {
    const parsed = new URL(raw, VALIDATION_ORIGIN);
    const decodedPathname = decodeURIComponent(parsed.pathname);
    if (
      parsed.origin !== VALIDATION_ORIGIN ||
      !parsed.pathname.startsWith('/') ||
      parsed.pathname.startsWith('//') ||
      !decodedPathname.startsWith('/') ||
      decodedPathname.startsWith('//') ||
      hasControlOrBackslash(decodedPathname) ||
      decodedPathname.split('/').includes('..')
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function sanitizeAdminMfaNextPath(raw: unknown): string {
  const safePath = sanitizeRelativeRedirectPath(raw);
  if (!safePath) return '/admin';
  try {
    const parsed = new URL(safePath, VALIDATION_ORIGIN);
    if (parsed.pathname === '/admin' || parsed.pathname.startsWith('/admin/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return '/admin';
  } catch {
    return '/admin';
  }
}

export function shouldUseSecureCookies(envOverride?: {
  nodeEnv?: string;
  testEnvironment?: string;
  siteUrl?: string;
}): boolean {
  const nodeEnv = envOverride ? envOverride.nodeEnv : process.env.NODE_ENV;
  if (nodeEnv !== 'production') {
    return false;
  }
  const testEnv = envOverride ? envOverride.testEnvironment : process.env.TEST_ENVIRONMENT;
  const siteUrl = (envOverride ? envOverride.siteUrl : process.env.NEXT_PUBLIC_SITE_URL) ?? '';
  if (
    testEnv === 'isolated-ci' &&
    (siteUrl === 'http://127.0.0.1' ||
      siteUrl.startsWith('http://127.0.0.1:') ||
      siteUrl === 'http://localhost' ||
      siteUrl.startsWith('http://localhost:'))
  ) {
    return false;
  }
  return true;
}

export function isSameOriginRequest(headers: Headers): boolean {
  const host = headers.get('host');
  const origin = headers.get('origin');
  if (origin) {
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const secFetchSite = headers.get('sec-fetch-site') ?? '';
  return secFetchSite === 'same-origin' || secFetchSite === 'none';
}

export function sanitizeHttpUrl(
  raw: string | null | undefined,
  options?: { allowRelative?: boolean }
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (options?.allowRelative && trimmed.startsWith('/')) {
    const safeRel = sanitizeRelativeRedirectPath(trimmed);
    if (!safeRel) {
      throw new Error('Invalid relative URL path.');
    }
    return safeRel;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format. Only http:// and https:// URLs are allowed.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid URL scheme: only http:// and https:// URLs are allowed.');
  }

  return trimmed;
}
