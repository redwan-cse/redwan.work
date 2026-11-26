import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CEH_VERIFICATION_URL, SITE } from '@/lib/content/site';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import {
  RESUME_ASSET_KEY,
  extractPublicAssetKeyFromUrl,
  validateResumePdfUpload,
} from '@/lib/r2';
import {
  allowsAnalyticsStorage,
  allowsExperienceStorage,
} from '@/components/cookie-preferences';
import { clearBlogCache, getBlogPostsPage } from '@/lib/blogger';
import {
  buildPublicMetadata,
  resolveVerificationToken,
} from '@/lib/seo/metadata';
import {
  buildBlogsArchiveJsonLd,
  buildCaseStudyJsonLd,
  buildContactPageJsonLd,
  buildFaqPageJsonLd,
  buildPortfolioCollectionJsonLd,
  buildResumeProfileJsonLd,
  buildRootSiteGraphJsonLd,
  buildServiceDetailJsonLd,
  buildServicesOfferCatalogJsonLd,
  normalizeSchemaDate,
  PUBLIC_FAQS,
} from '@/lib/seo/structured-data';
import {
  getPublicPortfolioItems,
  getPublicServicesCatalog,
} from '@/lib/cms/queries';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, acc);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe('SEO Metadata, Sitemap Stability, Robots & Verified Identity Contracts', () => {
  it('builds self-referencing canonical, OpenGraph URL, and robots directives via buildPublicMetadata', async () => {
    const modPath = '@/lib/seo/metadata';
    const { buildPublicMetadata } = await import(modPath);
    const publicMeta = buildPublicMetadata({
      title: 'Services & Packages',
      description: 'Cybersecurity, full-stack development, cloud hardening, and AI engineering.',
      path: '/services',
    });

    expect(publicMeta.alternates?.canonical).toBe('/services');
    expect((publicMeta.openGraph as { url?: string })?.url).toBe(`${SITE.url}/services`);
    expect(publicMeta.robots).toEqual({ index: true, follow: true });

    const noindexMeta = buildPublicMetadata({
      title: 'Technical Blog — Page 99',
      description: 'Paginated archive.',
      path: '/blogs',
      noindex: true,
    });
    expect(noindexMeta.robots).toEqual({ index: false, follow: true });
  });

  it('produces deterministic sitemap timestamps across invocations without wall-clock drift', async () => {
    const first = await sitemap();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await sitemap();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const urls = first.map((entry) => entry.url);
    expect(urls).toContain(`${SITE.url}`);
    expect(urls).toContain(`${SITE.url}/services`);
    expect(urls).toContain(`${SITE.url}/portfolio`);
    expect(urls).toContain(`${SITE.url}/blogs`);
    expect(urls).toContain(`${SITE.url}/resume`);
    expect(urls).toContain(`${SITE.url}/contact`);
    expect(urls).not.toContain(`${SITE.url}/admin`);
    expect(urls).not.toContain(`${SITE.url}/portal`);
    expect(urls).not.toContain(`${SITE.url}/login`);
  });

  it('disallows private admin, portal, auth, and API routes while welcoming search and AI crawlers in robots()', () => {
    const cfg = robots();
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [cfg.rules];
    const disallowList = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );
    const userAgents = rules.flatMap((r) =>
      Array.isArray(r.userAgent) ? r.userAgent : r.userAgent ? [r.userAgent] : []
    );

    expect(disallowList).toContain('/api/');
    expect(disallowList).toContain('/admin');
    expect(disallowList).toContain('/portal');
    expect(disallowList).toContain('/login');
    expect(disallowList).toContain('/mfa');
    expect(disallowList).toContain('/reset-password');
    expect(disallowList).toContain('/invite');

    expect(userAgents).toContain('OAI-SearchBot');
    expect(userAgents).toContain('PerplexityBot');
    expect(userAgents).toContain('ClaudeBot');
    expect(userAgents).toContain('Claude-SearchBot');
    expect(userAgents).toContain('Perplexity-User');
    expect(userAgents).toContain('Google-Extended');

    const allowList = rules.flatMap((r) =>
      Array.isArray(r.allow) ? r.allow : r.allow ? [r.allow] : []
    );
    expect(allowList).toContain('/resume.pdf');
    expect(allowList).toContain('/llms.txt');
  });

  it('validates R2 public bucket resume PDF uploads and resolves public asset keys without runtime PDF generation', () => {
    expect(RESUME_ASSET_KEY).toBe('assets/resume/Md_Redwan_Ahmed_Resume.pdf');
    expect(
      extractPublicAssetKeyFromUrl(
        'https://cdn.redwan.work/assets/resume/Md_Redwan_Ahmed_Resume.pdf?v=1763139000'
      )
    ).toBe('assets/resume/Md_Redwan_Ahmed_Resume.pdf');
    expect(extractPublicAssetKeyFromUrl('/resume.pdf')).toBeNull();
    expect(extractPublicAssetKeyFromUrl('assets/../secret.pdf')).toBeNull();

    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'ascii');
    expect(
      validateResumePdfUpload({
        filename: 'Md_Redwan_Ahmed_Resume.pdf',
        mime: 'application/pdf',
        size: validPdfBytes.byteLength,
        bytes: validPdfBytes,
      })
    ).toEqual({ ok: true });

    const fakePdfBytes = Buffer.from('NOT-A-PDF-FILE', 'ascii');
    expect(
      validateResumePdfUpload({
        filename: 'resume.pdf',
        mime: 'application/pdf',
        size: fakePdfBytes.byteLength,
        bytes: fakePdfBytes,
      }).ok
    ).toBe(false);

    expect(
      validateResumePdfUpload({
        filename: 'resume.docx',
        mime: 'application/pdf',
        size: validPdfBytes.byteLength,
        bytes: validPdfBytes,
      }).ok
    ).toBe(false);
  });

  it('defaults experience preloading and analytics consent to enabled when no override is stored', () => {
    expect(allowsExperienceStorage()).toBe(true);
    expect(allowsAnalyticsStorage()).toBe(true);
  });

  it('validates search verification tokens and builds consistent AEO/GEO structured data graphs', async () => {
    expect(resolveVerificationToken(undefined)).toBeUndefined();
    expect(resolveVerificationToken('...')).toBeUndefined();
    expect(resolveVerificationToken('your-google-token')).toBeUndefined();
    expect(resolveVerificationToken('google1234567890abcdef')).toBe(
      'google1234567890abcdef'
    );

    const rootGraph = buildRootSiteGraphJsonLd();
    const types = rootGraph['@graph'].map((node) => node['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Person');
    expect(types).toContain('ProfessionalService');

    const websiteNode = rootGraph['@graph'].find((n) => n['@type'] === 'WebSite') as
      | { name?: string; alternateName?: string[] }
      | undefined;
    expect(websiteNode?.name).toBe('Md. Redwan Ahmed');
    expect(websiteNode?.alternateName).toContain('Md Redwan Ahmed');
    expect(websiteNode?.alternateName).toContain('redwancse');

    const personNode = rootGraph['@graph'].find((n) => n['@type'] === 'Person') as
      | { description?: string; sameAs?: string[] }
      | undefined;
    expect(personNode?.description).toContain('Certified Ethical Hacker');
    expect(personNode?.sameAs).toContain('https://scholar.google.com/citations?user=QKjhR4wAAAAJ&hl=en');
    expect(personNode?.sameAs).toContain('https://orcid.org/0009-0001-9419-4760');
    expect(personNode?.sameAs).toContain('https://www.upwork.com/freelancers/~01bd47ab2da223b848');
    expect(personNode?.sameAs).not.toContain('https://fastcyberdefense.com');

    const faqSchema = buildFaqPageJsonLd(PUBLIC_FAQS);
    expect(faqSchema['@type']).toBe('FAQPage');
    expect(faqSchema.mainEntity).toHaveLength(PUBLIC_FAQS.length);

    const services = await getPublicServicesCatalog();
    const catalogSchema = buildServicesOfferCatalogJsonLd(services);
    expect(catalogSchema.hasOfferCatalog.itemListElement.length).toBeGreaterThanOrEqual(5);
  });

  it('supports deterministic offline blog pagination fixtures when BLOGGER_FIXTURE_POSTS_JSON is provided', async () => {
    const previous = process.env.BLOGGER_FIXTURE_POSTS_JSON;
    try {
      const fixture = Array.from({ length: 12 }, (_, idx) => ({
        id: `post-${idx + 1}`,
        title: `Security Engineering Note #${idx + 1}`,
        content: `<p>Technical writeup #${idx + 1} covering security architecture.</p>`,
        url: `https://blog.redwan.work/2026/11/note-${idx + 1}.html`,
        published: '2026-11-01T00:00:00.000Z',
        labels: ['Security'],
      }));
      process.env.BLOGGER_FIXTURE_POSTS_JSON = JSON.stringify(fixture);
      clearBlogCache();

      const page1 = await getBlogPostsPage(1, 9);
      const page2 = await getBlogPostsPage(2, 9);
      const page99 = await getBlogPostsPage(99, 9);

      expect(page1.totalItems).toBe(12);
      expect(page1.posts).toHaveLength(9);
      expect(page2.posts).toHaveLength(3);
      expect(page99.posts).toHaveLength(0);
    } finally {
      if (previous === undefined) {
        delete process.env.BLOGGER_FIXTURE_POSTS_JSON;
      } else {
        process.env.BLOGGER_FIXTURE_POSTS_JSON = previous;
      }
      clearBlogCache();
    }
  });

  it('enforces verified identity including EC-Council C|EH credential and eliminates info@redwan.work and fabricated testimonials across app/components/lib', async () => {
    expect(SITE.name).toBe('Md. Redwan Ahmed');
    expect(SITE.email).toBe('contact@redwan.work');
    expect(SITE.credentials.map((c) => c.code)).toContain('C|EH');

    const { settings, items } = await getSiteSettingsAndResume();
    expect(settings.full_name).toBe('Md. Redwan Ahmed');
    expect(JSON.stringify(settings)).toMatch(/C\|EH/i);
    expect(JSON.stringify(settings)).toMatch(/Certified Ethical Hacker/i);

    const cehItem = items.find(
      (i) => i.section === 'vendor_certification' && /Certified Ethical Hacker/i.test(i.title)
    );
    expect(cehItem).toBeDefined();
    expect(cehItem?.verification_url).toBe(CEH_VERIFICATION_URL);

    const root = process.cwd();
    const files = [
      ...collectSourceFiles(path.join(root, 'app')),
      ...collectSourceFiles(path.join(root, 'components')),
      ...collectSourceFiles(path.join(root, 'lib')),
    ];

    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      if (rel === 'lib/content/testimonials.ts') continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/info@redwan\.work/i.test(src)) {
        violations.push(`${rel}: contains legacy info@redwan.work address`);
      }
      if (/from ['"]@\/lib\/content\/testimonials['"]/.test(src) || /from ['"]\.\/.*testimonials['"]/.test(src)) {
        violations.push(`${rel}: imports hardcoded fabricated testimonials`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('[SEO-V6] prevents duplicate brand suffixes, configures summary_large_image OG defaults, and guards Vercel preview deployments against indexing', () => {
    const plainMeta = buildPublicMetadata({
      title: 'Services & Packages',
      description: 'Cybersecurity and full-stack consulting.',
      path: '/services',
    });
    expect(plainMeta.title).toBe('Services & Packages');
    expect((plainMeta.twitter as { card?: string })?.card).toBe('summary_large_image');
    const ogImages = (plainMeta.openGraph as { images?: Array<{ url: string }> })?.images ?? [];
    expect(ogImages[0]?.url).toBe('/opengraph-image');

    const brandedMeta = buildPublicMetadata({
      title: `${SITE.name} — Security Consultant`,
      description: 'Branded title should not receive a duplicate suffix.',
      path: '/',
    });
    expect(brandedMeta.title).toEqual({ absolute: `${SITE.name} — Security Consultant` });
    expect((brandedMeta.openGraph as { title?: string })?.title).toBe(
      `${SITE.name} — Security Consultant`
    );

    const prevEnv = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'preview';
      const previewMeta = buildPublicMetadata({
        title: 'Services',
        description: 'Preview deployment.',
        path: '/services',
      });
      expect(previewMeta.robots).toEqual({ index: false, follow: false });

      const previewRobots = robots();
      const rules = Array.isArray(previewRobots.rules)
        ? previewRobots.rules
        : [previewRobots.rules];
      expect(rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = prevEnv;
      }
    }
  });

  it('[SEO-V6] builds valid ISO-8601 JSON-LD across Service detail, CaseStudy, Resume, Contact, Portfolio, and Blogs with unified #person @id', async () => {
    expect(normalizeSchemaDate('2024–2026')).toBe('2026');
    expect(normalizeSchemaDate('Nov 2024')).toBe('2024-11');
    expect(normalizeSchemaDate('2024-11-22')).toBe('2024-11-22');
    expect(normalizeSchemaDate('November 22-23, 2024')).toBe('2024');
    expect(normalizeSchemaDate('')).toBeUndefined();

    const services = await getPublicServicesCatalog();
    const firstService = services[0]!;
    const svcDetail = buildServiceDetailJsonLd(firstService);
    expect(svcDetail['@type']).toBe('Service');
    expect(svcDetail.provider).toEqual({ '@id': `${SITE.url}/#person` });
    expect(svcDetail.url).toBe(`${SITE.url}/services/${firstService.slug}`);
    expect(svcDetail.hasOfferCatalog?.itemListElement.length).toBeGreaterThan(0);

    const catalog = buildServicesOfferCatalogJsonLd(services);
    expect(catalog.hasOfferCatalog.itemListElement[0]?.url).toBe(
      `${SITE.url}/services/${firstService.slug}`
    );

    const portfolio = await getPublicPortfolioItems();
    const firstStudy = portfolio[0]!;
    const studySchema = buildCaseStudyJsonLd(firstStudy);
    expect(studySchema['@type']).toBe('CreativeWork');
    expect(studySchema.url).toBe(`${SITE.url}/portfolio/${firstStudy.slug}`);
    expect(studySchema.author).toEqual({ '@id': `${SITE.url}/#person` });
    expect(studySchema.datePublished).toMatch(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);

    const portfolioCollection = buildPortfolioCollectionJsonLd(portfolio);
    expect(portfolioCollection.mainEntity.itemListElement[0]?.item.url).toBe(
      `${SITE.url}/portfolio/${firstStudy.slug}`
    );

    const { settings, items } = await getSiteSettingsAndResume();
    const resumeGraph = buildResumeProfileJsonLd(settings, items);
    const scholarlyNodes = resumeGraph['@graph'].filter(
      (n) => n['@type'] === 'ScholarlyArticle'
    );
    expect(scholarlyNodes.length).toBeGreaterThanOrEqual(2);
    const profileNode = resumeGraph['@graph'].find((n) => n['@type'] === 'ProfilePage') as {
      hasPart?: Array<{ '@id': string }>;
    };
    expect(profileNode.hasPart?.map((p) => p['@id'])).toEqual(
      scholarlyNodes.map((n) => (n as { '@id': string })['@id'])
    );
    expect(
      (scholarlyNodes[0] as { isPartOf?: { name?: string } }).isPartOf?.name
    ).toBe('International Journal of Cognitive Computing in Engineering');

    const contactSchema = buildContactPageJsonLd();
    expect(contactSchema['@type']).toBe('ContactPage');
    expect(contactSchema.mainEntity).toEqual({ '@id': `${SITE.url}/#person` });

    const blogSchema = buildBlogsArchiveJsonLd(
      [
        {
          id: 'p1',
          title: 'Wazuh Hardening',
          content: '<p>Guide</p><img src="https://cdn.redwan.work/img.png" />',
          url: 'https://blogs.redwan.work/2026/wazuh.html',
          published: '2026-11-01T00:00:00.000Z',
          labels: ['SIEM'],
        },
      ],
      1
    );
    expect(blogSchema.publisher).toEqual({ '@id': `${SITE.url}/#person` });
    expect(blogSchema.blogPost[0]?.image).toBe('https://cdn.redwan.work/img.png');
    expect(blogSchema.blogPost[0]?.publisher).toEqual({ '@id': `${SITE.url}/#person` });

    const rootGraph = buildRootSiteGraphJsonLd();
    const person = rootGraph['@graph'].find((n) => n['@type'] === 'Person') as {
      sameAs?: string[];
    };
    expect(person.sameAs?.filter((u) => u.includes('twitter.com'))).toEqual([]);
  });

  it('[SEO-V6] isolates useSearchParams inside Suspense, keeps ScrollReveal SSR-visible, wires sitemap/llms revalidation, and allows Supabase Storage images', () => {
    const root = process.cwd();
    const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

    expect(read('components/motion/reveal.tsx')).toContain('initial={{ opacity: 1, y: 12 }}');
    expect(read('components/services-showcase.tsx')).toContain('PillarQuerySync');
    expect(read('components/portfolio-showcase.tsx')).toContain('CategoryQuerySync');
    expect(read('app/sitemap.ts')).toContain(".from('portfolio_items')");
    expect(read('lib/cms/actions.ts')).toContain("revalidatePath('/sitemap.xml')");
    expect(read('next.config.js')).toContain('/storage/v1/object/public/**');
    expect(read('lib/resume/route-handler.ts')).toContain('rel="canonical"');
    expect(read('app/not-found.tsx')).toContain("title: 'Page Not Found'");
    expect(read('app/global-error.tsx')).toContain('<h1');

    const manifest = JSON.parse(read('app/manifest.json')) as {
      name: string;
      start_url: string;
      icons: Array<{ purpose?: string }>;
    };
    expect(manifest.name).toContain('Md. Redwan Ahmed');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.some((i) => i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});
