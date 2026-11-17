import { describe, expect, it } from 'vitest';
import { resolveCallbackOrigin } from '@/lib/security/safe-redirect';

const SITE = 'https://redwan.work';

describe('Auth callback redirect origin keeps cookies and redirect on the same host', () => {
  it('[CALLBACK-ORIGIN] keeps the www host the visitor used (host-only session cookies)', () => {
    expect(
      resolveCallbackOrigin({
        host: 'www.redwan.work',
        forwardedProto: 'https',
        requestOrigin: 'https://www.redwan.work',
        siteUrl: SITE,
      })
    ).toBe('https://www.redwan.work');
  });

  it('[CALLBACK-ORIGIN] keeps the apex host and is stable when the configured site is the www twin', () => {
    expect(
      resolveCallbackOrigin({
        host: 'redwan.work',
        requestOrigin: 'https://redwan.work',
        siteUrl: 'https://www.redwan.work',
      })
    ).toBe('https://redwan.work');
  });

  it('[CALLBACK-ORIGIN] never downgrades an https site to http via a forwarded proto', () => {
    expect(
      resolveCallbackOrigin({
        host: 'redwan.work',
        forwardedProto: 'http',
        requestOrigin: 'https://redwan.work',
        siteUrl: SITE,
      })
    ).toBe('https://redwan.work');
  });

  it('[CALLBACK-ORIGIN] ignores attacker-controlled Host / X-Forwarded-Host values', () => {
    for (const evil of [
      'evil.example',
      'redwan.work.evil.example',
      'evilredwan.work',
      'user:pass@redwan.work',
      'redwan.work@evil.example',
      'evil.example, redwan.work',
    ]) {
      expect(
        resolveCallbackOrigin({
          host: 'redwan.work',
          forwardedHost: evil,
          requestOrigin: 'https://redwan.work',
          siteUrl: SITE,
        }),
        `forwarded host ${evil}`
      ).toBe('https://redwan.work');
    }
  });

  it('[CALLBACK-ORIGIN] honors loopback hosts for local dev and isolated CI, preserving 127.0.0.1 vs localhost', () => {
    expect(
      resolveCallbackOrigin({
        host: '127.0.0.1:24390',
        requestOrigin: 'http://localhost:24390',
        siteUrl: 'http://127.0.0.1:24390',
      })
    ).toBe('http://127.0.0.1:24390');
  });

  it('[CALLBACK-ORIGIN] falls back to the request origin when no site URL is configured', () => {
    expect(
      resolveCallbackOrigin({
        host: 'preview.example',
        requestOrigin: 'https://preview.example',
        siteUrl: null,
      })
    ).toBe('https://preview.example');
  });
});
