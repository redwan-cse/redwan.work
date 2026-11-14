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

    // Page 2 (12 fixture posts -> 10 on page 1 [1 featured + 9 grid], 2 on page 2) self-canonicalizes to /blogs?page=2
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
      '/register',
      '/mfa',
      '/reset-password',
      '/auth/callback',
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
    for (const disallowed of [
      '/admin',
      '/portal',
      '/api',
      '/auth/callback',
      '/login',
      '/register',
      '/mfa',
      '/reset-password',
      '/invite',
    ]) {
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

  test('[IDENTITY-CONSISTENCY] presents verified Md. Redwan Ahmed identity and EC-Council C|EH credential without fabricated testimonials', async ({
    request,
    page,
  }) => {
    const publicCheckRoutes = ['/', '/services', '/portfolio', '/resume', '/contact'];

    for (const route of publicCheckRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const html = await page.content();

      expect(html).not.toContain('info@redwan.work');
      expect(html).not.toContain('Sarah Johnson');
      expect(html).not.toContain('Michael Chen');
    }

    // Home page hero CTA excludes redundant Client Portal button and showcases Q1 Scopus (no IEEE badge)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const homeHero = page.locator('main section').first();
    await expect(homeHero.getByRole('link', { name: /Explore Services & Packages/i })).toBeVisible();
    await expect(homeHero.getByRole('link', { name: /Request Custom Proposal/i })).toBeVisible();
    expect(await homeHero.getByRole('link', { name: /Client Portal/i }).count()).toBe(0);
    expect((await homeHero.textContent()) ?? '').not.toContain('Q1 / IEEE');

    await page.goto('/resume', { waitUntil: 'domcontentloaded' });
    const resumeText = (await page.locator('main').textContent()) ?? '';
    expect(resumeText).toContain('Md. Redwan Ahmed');
    expect(resumeText).toContain('contact@redwan.work');
    const resumeMainText = await page.locator('main').innerText();
    expect(resumeMainText).toContain('Founder & CEO, Fast Cyber Defense');
    expect(resumeMainText).toContain(
      'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Researcher'
    );
    expect(resumeMainText).not.toContain('Q1 Scopus Researcher');
    expect(resumeMainText).not.toContain('Q1 IEEE Researcher');
    expect(resumeMainText).not.toContain('Q1 Scopus & IEEE Author');
    expect(resumeMainText).toContain('IEEE CS BDC SYMPOSIUM 2024');

    const techSkillsText = await page.locator('#skills').innerText();
    expect(techSkillsText).toContain('Full-Stack, Databases & Programming');
    expect(techSkillsText).toContain('Linux System & Server Administration (Ubuntu, CentOS)');
    expect(techSkillsText).toContain('Nginx & Heroku');
    expect(techSkillsText).not.toContain('Soft Skills');
    expect(techSkillsText).not.toContain('Other Skills');
    expect(resumeText).toContain('CentOS Linux system and server administration');

    const additionalSkillsText = await page.locator('#additional-skills').innerText();
    expect(additionalSkillsText).toContain('Additional Skills');
    expect(additionalSkillsText).toContain('Soft & Leadership Skills');
    expect(additionalSkillsText).toContain('Workplace & Productivity Tools');
    expect(additionalSkillsText).toContain('Microsoft Office Suite (Word, Excel, PowerPoint)');
    expect(resumeText).toContain('Certified Ethical Hacker (C|EH)');
    expect(resumeText).toContain('ECC8126370954');
    expect(resumeText).toContain('CCEP');
    expect(resumeText).toContain('CNSP');
    expect(resumeText).toContain('CAP');
    expect(resumeText).toContain('Founder & CEO');
    expect(resumeText).toContain('Fast Cyber Defense');
    expect(resumeText).toContain('2022 · CGPA: 2.88/4.0');
    expect(resumeText).toContain('2020 · CGPA: 3.15/4.00');
    expect(resumeText).toContain('2016 · GPA: 4.83/5.0');
    expect(resumeText).toContain('2014 · GPA: 4.56/5.0');
    expect(resumeText).toContain('abulayek@yahoo.com');
    expect(resumeText).toContain('Dr. Md. Manowarul Islam');
    expect(resumeText).toContain('manowar@cse.jnu.ac.bd');
    expect(resumeText).not.toContain('Uzzal');
    // Scholar URLs are rendered purely as hyperlinks on professor names, never printed visibly
    expect(resumeText).not.toContain('scholar.google.com');

    // Resume <main> has no Upwork link while academic reference names link cleanly to Google Scholar
    const resumeUpworkLinks = await page
      .locator('main a[href*="upwork.com"]')
      .count();
    expect(resumeUpworkLinks).toBe(0);
    await expect(
      page.getByRole('link', { name: 'Prof. Dr. Md. Abu Layek — Google Scholar Profile' })
    ).toHaveAttribute(
      'href',
      'https://scholar.google.com/citations?user=pDEC0p4AAAAJ&hl=en'
    );
    await expect(
      page.getByRole('link', { name: 'Dr. Md. Manowarul Islam — Google Scholar Profile' })
    ).toHaveAttribute(
      'href',
      'https://scholar.google.com/citations?user=MBF7Y_4AAAAJ&hl=en'
    );

    const footerText = (await page.locator('footer').textContent()) ?? '';
    expect(footerText).not.toContain('Command Center');
    expect(footerText).toContain('Q1 Scopus Researcher');
    expect(footerText).not.toContain('Q1 Scopus & IEEE');

    // Floating WhatsApp widget removed; Back-to-Top reveals after scrolling >350px
    expect(await page.locator('a[aria-label="Chat on WhatsApp"]').count()).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 800));
    const backToTopBtn = page.getByRole('button', { name: 'Back to top' });
    await expect(backToTopBtn).toBeVisible();
    await backToTopBtn.click();
    await expect
      .poll(
        async () => page.evaluate(() => Math.round(window.scrollY)),
        { timeout: 10000 }
      )
      .toBeLessThan(50);

    // /blogs page 1 fills featured + 9 grid cards, strips embedded CSS and heading-anchor #, and hides intro paragraph when TOC is present
    await page.goto('/blogs', { waitUntil: 'domcontentloaded' });
    const blogsMainText = (await page.locator('main').textContent()) ?? '';
    expect(blogsMainText).not.toContain('.code-block-wrap');
    expect(blogsMainText).not.toContain('Architecture Overview#');
    expect(blogsMainText).toContain('Showing 1–10 of 12 articles');
    expect(await page.locator('main article, main .grid > div').count()).toBeGreaterThanOrEqual(9);

    await page.getByRole('button', { name: /Quick Preview/i }).first().click();
    const previewDialog = page.getByRole('dialog');
    await expect(previewDialog).toBeVisible();
    const dialogText = (await previewDialog.textContent()) ?? '';
    expect(dialogText).toContain('Table of Contents');
    expect(dialogText).toContain('Architecture Overview');
    expect(dialogText).toContain('Key Hardening Controls');
    expect(dialogText).not.toContain('.code-block-wrap');
    expect(dialogText).not.toContain('Practical analysis #1 covering');
    await page.keyboard.press('Escape');
    await expect(previewDialog).toBeHidden();

    // /api/blogs/preload warms live blog pages with X-Robots-Tag: noindex and validates page parameter
    const preloadRes = await request.get('/api/blogs/preload?page=1');
    expect(preloadRes.status()).toBe(200);
    expect(preloadRes.headers()['x-robots-tag']?.toLowerCase()).toContain('noindex');
    const preloadJson = await preloadRes.json();
    expect(preloadJson).toMatchObject({ ok: true, page: 1, totalItems: 12, totalPages: 2 });

    const badPreloadRes = await request.get('/api/blogs/preload?page=0');
    expect(badPreloadRes.status()).toBe(400);
  });

  test('[GEO-AND-AEO] serves /llms.txt, /llms-full.txt, AI crawler rules, and rich route-level JSON-LD + FAQ schemas without placeholder tokens', async ({
    request,
    page,
  }) => {
    // 1. /llms.txt and /llms-full.txt return clean Markdown with verified identity and DOI citations
    const llmsRes = await request.get('/llms.txt');
    expect(llmsRes.status()).toBe(200);
    expect(llmsRes.headers()['content-type'] ?? '').toContain('text/markdown');
    const llmsBody = await llmsRes.text();
    expect(llmsBody).toContain('Md. Redwan Ahmed');
    expect(llmsBody).toContain('ECC8126370954');
    expect(llmsBody).toContain('10.1016/j.ijcce.2024.04.002');
    expect(llmsBody).toContain('/llms-full.txt');

    const llmsFullRes = await request.get('/llms-full.txt');
    expect(llmsFullRes.status()).toBe(200);
    expect(llmsFullRes.headers()['content-type'] ?? '').toContain('text/markdown');
    const llmsFullBody = await llmsFullRes.text();
    expect(llmsFullBody).toContain('## Service Catalog & Packages');
    expect(llmsFullBody).toContain('## Frequently Asked Questions');

    // 2. /robots.txt explicitly allows AI crawlers & llms.txt alongside private disallows
    const robotsRes = await request.get('/robots.txt');
    const robotsTxt = await robotsRes.text();
    expect(robotsTxt).toContain('OAI-SearchBot');
    expect(robotsTxt).toContain('PerplexityBot');
    expect(robotsTxt).toContain('ClaudeBot');
    expect(robotsTxt).toContain('Allow: /llms.txt');

    // 3. Home advertises llms.txt discovery link and never emits placeholder "..." verification meta
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const llmsLinkHref = await page
      .locator('link[rel="alternate"][type="text/markdown"]')
      .getAttribute('href');
    expect(llmsLinkHref).toContain('/llms.txt');
    const googleMetaLocator = page.locator('meta[name="google-site-verification"]');
    if ((await googleMetaLocator.count()) > 0) {
      expect(await googleMetaLocator.getAttribute('content')).not.toBe('...');
    }

    // 4. /services renders visible FAQ section matching OfferCatalog + FAQPage + BreadcrumbList JSON-LD
    await page.goto('/services', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Frequently Asked Questions' })
    ).toBeVisible();
    const servicesSchemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const joinedServicesSchemas = servicesSchemas.join('\n');
    expect(joinedServicesSchemas).toContain('"OfferCatalog"');
    expect(joinedServicesSchemas).toContain('"FAQPage"');
    expect(joinedServicesSchemas).toContain('"BreadcrumbList"');

    // 5. /resume emits ProfilePage + ScholarlyArticle DOI JSON-LD; /portfolio emits CollectionPage
    await page.goto('/resume', { waitUntil: 'domcontentloaded' });
    const resumeSchemas = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).join('\n');
    expect(resumeSchemas).toContain('"ProfilePage"');
    expect(resumeSchemas).toContain('"ScholarlyArticle"');
    expect(resumeSchemas).toContain('10.1016/j.ijcce.2024.04.002');

    await page.goto('/portfolio', { waitUntil: 'domcontentloaded' });
    const portfolioSchemas = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).join('\n');
    expect(portfolioSchemas).toContain('"CollectionPage"');
  });
});
