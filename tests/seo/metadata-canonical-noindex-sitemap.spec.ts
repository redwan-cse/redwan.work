import { expect, test } from '@playwright/test';

const CANONICAL_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://redwan.work').replace(
  /\/$/,
  ''
);

const PUBLIC_INDEXABLE_ROUTES = [
  { path: '/', expectedCanonical: `${CANONICAL_ORIGIN}` },
  { path: '/services', expectedCanonical: `${CANONICAL_ORIGIN}/services` },
  { path: '/portfolio', expectedCanonical: `${CANONICAL_ORIGIN}/portfolio` },
  { path: '/blogs', expectedCanonical: `${CANONICAL_ORIGIN}/blogs` },
  { path: '/resume', expectedCanonical: `${CANONICAL_ORIGIN}/resume` },
  { path: '/contact', expectedCanonical: `${CANONICAL_ORIGIN}/contact` },
  { path: '/privacy', expectedCanonical: `${CANONICAL_ORIGIN}/privacy` },
  { path: '/tos', expectedCanonical: `${CANONICAL_ORIGIN}/tos` },
];

test.describe('Search Engine Optimization, Canonical Pagination, Private Noindex & Verified Identity', () => {
  test('[PUBLIC-METADATA] emits unique titles, descriptions, self-referencing canonicals, og:url, and valid JSON-LD on all public routes', async ({
    page,
  }) => {
    const seenTitles = new Set<string>();
    const seenDescriptions = new Set<string>();

    for (const route of PUBLIC_INDEXABLE_ROUTES) {
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `Status for ${route.path}`).toBe(200);

      const title = (await page.title()).trim();
      expect(title.length, `Title length on ${route.path}`).toBeGreaterThan(10);
      expect(seenTitles.has(title), `Duplicate title "${title}" on ${route.path}`).toBe(false);
      seenTitles.add(title);

      const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
      expect(description && description.trim().length > 30, `Description on ${route.path}`).toBe(
        true
      );
      expect(
        seenDescriptions.has(description!),
        `Duplicate meta description on ${route.path}`
      ).toBe(false);
      seenDescriptions.add(description!);

      const canonicalHref = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href');
      const normalizedCanonical = canonicalHref?.replace(/\/$/, '') ?? '';
      const expectedNormalized = route.expectedCanonical.replace(/\/$/, '');
      expect(normalizedCanonical, `Canonical on ${route.path}`).toBe(expectedNormalized);

      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      expect(ogUrl?.replace(/\/$/, ''), `og:url on ${route.path}`).toBe(expectedNormalized);

      const robotsMeta =
        (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
      expect(robotsMeta.toLowerCase()).not.toContain('noindex');
    }

    // Validate root JSON-LD @graph (Person + ProfessionalService)
    await page.goto('/');
    const jsonLdRaw = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLdRaw).toBeTruthy();
    const parsedJsonLd = JSON.parse(jsonLdRaw!) as {
      '@context': string;
      '@graph': Array<Record<string, unknown>>;
    };
    expect(parsedJsonLd['@context']).toBe('https://schema.org');
    expect(Array.isArray(parsedJsonLd['@graph'])).toBe(true);
    expect(parsedJsonLd['@graph'].some((node) => node['@type'] === 'Person')).toBe(true);
    expect(parsedJsonLd['@graph'].some((node) => node['@type'] === 'ProfessionalService')).toBe(
      true
    );
  });

  test('[PAGINATION-CANONICAL] canonicalizes /blogs pagination and marks out-of-range or invalid pages as noindex', async ({
    page,
  }) => {
    // Page 1 default & explicit ?page=1 canonicalize to /blogs
    for (const url of ['/blogs', '/blogs?page=1']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(`${CANONICAL_ORIGIN}/blogs`);
      const robots = (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
      expect(robots.toLowerCase()).not.toContain('noindex');
    }

    // Page 2 (12 fixture posts -> 9 on page 1, 3 on page 2) self-canonicalizes to /blogs?page=2
    await page.goto('/blogs?page=2', { waitUntil: 'domcontentloaded' });
    const page2Canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(page2Canonical).toBe(`${CANONICAL_ORIGIN}/blogs?page=2`);
    const page2Robots = (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
    expect(page2Robots.toLowerCase()).not.toContain('noindex');

    // Out-of-range (?page=99) and invalid (?page=0, ?page=abc) emit noindex
    for (const invalidUrl of ['/blogs?page=99', '/blogs?page=0', '/blogs?page=abc']) {
      await page.goto(invalidUrl, { waitUntil: 'domcontentloaded' });
      const robots = (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
      expect(robots.toLowerCase(), `Expected noindex on ${invalidUrl}`).toContain('noindex');
    }
  });

  test('[PRIVATE-NOINDEX] protects admin, portal, auth, and API surfaces with X-Robots-Tag noindex and robots.txt disallow rules', async ({
    request,
    page,
  }) => {
    const privateEndpoints = [
      '/admin',
      '/portal',
      '/login',
      '/mfa',
      '/reset-password',
      '/invite/accept',
      '/api/contact',
    ];

    for (const endpoint of privateEndpoints) {
      const res = await request.get(endpoint, { maxRedirects: 0 });
      const xRobots = (res.headers()['x-robots-tag'] ?? '').toLowerCase();
      expect(xRobots, `X-Robots-Tag missing on ${endpoint}`).toContain('noindex');
      expect(xRobots, `nofollow missing on ${endpoint}`).toContain('nofollow');
    }

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const loginMetaRobots =
      (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
    expect(loginMetaRobots.toLowerCase()).toContain('noindex');

    const robotsRes = await request.get('/robots.txt');
    expect(robotsRes.status()).toBe(200);
    const robotsTxt = await robotsRes.text();
    for (const disallowed of ['/admin', '/portal', '/api', '/login', '/mfa', '/reset-password', '/invite']) {
      expect(robotsTxt).toContain(`Disallow: ${disallowed}`);
    }
    expect(robotsTxt).toContain(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
  });

  test('[SITEMAP-STABILITY] generates deterministic sitemap.xml across repeated requests with only canonical public URLs', async ({
    request,
  }) => {
    const firstRes = await request.get('/sitemap.xml');
    expect(firstRes.status()).toBe(200);
    const firstXml = await firstRes.text();

    await new Promise((r) => setTimeout(r, 150));

    const secondRes = await request.get('/sitemap.xml');
    expect(secondRes.status()).toBe(200);
    const secondXml = await secondRes.text();

    // Byte-for-byte identical across time (no new Date() drift)
    expect(secondXml).toBe(firstXml);

    const locs = Array.from(firstXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    expect(locs.length).toBe(PUBLIC_INDEXABLE_ROUTES.length);

    for (const loc of locs) {
      expect(loc.startsWith(CANONICAL_ORIGIN)).toBe(true);
      expect(loc).not.toMatch(/\/(admin|portal|login|mfa|reset-password|invite|api)(\/|$)/);
      const pathPart = loc.slice(CANONICAL_ORIGIN.length) || '/';
      const checkRes = await request.get(pathPart);
      expect(checkRes.status(), `Sitemap URL ${pathPart} must return 200`).toBe(200);
    }
  });

  test('[IDENTITY-CONSISTENCY] presents verified Md. Redwan Ahmed identity and credentials without C|EH claims or fabricated testimonials', async ({
    page,
  }) => {
    const publicCheckRoutes = ['/', '/services', '/portfolio', '/resume', '/contact'];

    for (const route of publicCheckRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const html = await page.content();

      expect(html).not.toContain('Certified Ethical Hacker');
      expect(html).not.toContain('C|EH');
      expect(html).not.toContain('info@redwan.work');
      expect(html).not.toContain('Sarah Johnson');
      expect(html).not.toContain('Michael Chen');
    }

    await page.goto('/resume', { waitUntil: 'domcontentloaded' });
    const resumeText = (await page.locator('main').textContent()) ?? '';
    expect(resumeText).toContain('Md. Redwan Ahmed');
    expect(resumeText).toContain('contact@redwan.work');
    expect(resumeText).toContain('CCEP');
    expect(resumeText).toContain('CNSP');
    expect(resumeText).toContain('CAP');
    expect(resumeText).toContain('3.15/4.00');
    expect(resumeText).toContain('abulayek@yahoo.com');
  });
});
