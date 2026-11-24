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
  const decodedRawPath = decodedRaw.split(/[?#]/)[0] ?? decodedRaw;
  if (
    !decodedRaw.startsWith('/') ||
    decodedRaw.startsWith('//') ||
    hasControlOrBackslash(decodedRaw) ||
    decodedRawPath.split('/').includes('..')
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

/** Non-throwing variant of sanitizeHttpUrl for UI rendering (returns null on invalid/unsafe schemes). */
export function trySanitizeHttpUrl(
  raw: string | null | undefined,
  options?: { allowRelative?: boolean }
): string | null {
  try {
    return sanitizeHttpUrl(raw, options);
  } catch {
    return null;
  }
}

/**
 * Decide which origin an auth callback should redirect to.
 *
 * Session cookies set on the callback response are host-only, so the redirect MUST land on the
 * same host the visitor used (e.g. www.example.com vs example.com), otherwise they arrive
 * signed-out. To stay safe against Host-header injection we only trust a request host when it is
 *   - a loopback host (local dev / isolated CI), or
 *   - the configured site host or its www./apex twin.
 * Anything else falls back to the configured site origin. Non-loopback hosts always use the
 * configured scheme, so a forwarded `http` can never downgrade an https site.
 */
export function resolveCallbackOrigin(input: {
  host: string | null | undefined;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  requestOrigin: string;
  siteUrl?: string | null;
}): string {
  let configured: URL | null = null;
  if (input.siteUrl) {
    try {
      configured = new URL(input.siteUrl);
    } catch {
      configured = null;
    }
  }

  const rawHost = (input.forwardedHost ?? input.host ?? '').split(',')[0]?.trim() ?? '';
  if (rawHost) {
    const proto =
      input.forwardedProto?.split(',')[0]?.trim() === 'https'
        ? 'https'
        : input.forwardedProto?.split(',')[0]?.trim() === 'http'
          ? 'http'
          : new URL(input.requestOrigin).protocol.replace(/:$/, '');
    try {
      const candidate = new URL(`${proto}://${rawHost}`);
      const hostname = candidate.hostname.toLowerCase();
      if (!candidate.username && !candidate.password) {
        if (hostname === '127.0.0.1' || hostname === 'localhost') {
          return candidate.origin;
        }
        if (configured) {
          const base = configured.hostname.toLowerCase().replace(/^www\./, '');
          if (hostname === base || hostname === `www.${base}`) {
            return `${configured.protocol}//${candidate.host}`;
          }
        }
      }
    } catch {
      // fall through to the configured/request origin
    }
  }

  return configured ? configured.origin : input.requestOrigin;
}
