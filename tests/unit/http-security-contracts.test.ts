import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

interface HeaderEntry {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

/**
 * Method 5: OWASP HTTP Security & Header Contract Suite
 *
 * Evaluates `next.config.js` `headers()` directly to guarantee strict CSP, HSTS,
 * anti-clickjacking, COOP/CORP, and private `no-store` + `noindex` coverage on every
 * sensitive route family.
 */
describe('Method 5: OWASP HTTP Security & Header Contract Suite', () => {
  it('[M5-GLOBAL-SECURITY-HEADERS] enforces strict CSP, HSTS, COOP, CORP, XFO, and nosniff on /:path*', async () => {
    const nextConfig = require('../../next.config.js') as {
      headers: () => Promise<HeaderRule[]>;
    };
    const rules = await nextConfig.headers();
    const globalRule = rules.find((r) => r.source === '/:path*');
    expect(globalRule).toBeDefined();

    const map = new Map(
      (globalRule?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value])
    );

    const csp = map.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // script-src must not allow wildcard *
    const scriptDirective = csp
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('script-src'));
    expect(scriptDirective).toBeDefined();
    expect(scriptDirective).not.toMatch(/\s\*(?:\s|$)/);

    expect(map.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains; preload'
    );
    expect(map.get('x-frame-options')).toBe('DENY');
    expect(map.get('x-content-type-options')).toBe('nosniff');
    expect(map.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(map.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(map.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(map.get('x-permitted-cross-domain-policies')).toBe('none');
    expect(map.get('permissions-policy')).toContain('camera=()');
    expect(map.get('permissions-policy')).toContain('microphone=()');
    expect(map.get('permissions-policy')).toContain('geolocation=()');
  });

  it('[M5-PRIVATE-NOSTORE-NOINDEX] enforces private no-store and noindex on all admin, portal, auth, and private API routes', async () => {
    const nextConfig = require('../../next.config.js') as {
      headers: () => Promise<HeaderRule[]>;
    };
    const rules = await nextConfig.headers();
    const bySource = new Map(rules.map((r) => [r.source, r.headers]));

    const requiredPrivateSources = [
      '/admin',
      '/admin/:path*',
      '/portal',
      '/portal/:path*',
      '/api/auth/:path*',
      '/api/admin/:path*',
      '/api/contact',
      '/api/cron/:path*',
      '/api/files/:path*',
      '/api/orders/:path*',
      '/api/uploads/:path*',
      '/login',
      '/register',
      '/mfa',
      '/reset-password',
      '/auth/:path*',
      '/invite/:path*',
    ];

    for (const source of requiredPrivateSources) {
      const headers = bySource.get(source);
      expect(headers, `Missing header rule for ${source}`).toBeDefined();
      const map = new Map((headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
      expect(map.get('cache-control'), `Cache-Control on ${source}`).toBe(
        'private, no-store, max-age=0'
      );
      expect(map.get('x-robots-tag'), `X-Robots-Tag on ${source}`).toBe('noindex, nofollow');
    }
  });
});
