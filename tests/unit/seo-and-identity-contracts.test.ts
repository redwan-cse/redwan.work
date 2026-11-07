import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE } from '@/lib/content/site';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import { clearBlogCache, getBlogPostsPage } from '@/lib/blogger';
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

  it('disallows private admin, portal, auth, and API routes in robots()', () => {
    const cfg = robots();
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [cfg.rules];
    const disallowList = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    );

    expect(disallowList).toContain('/api/');
    expect(disallowList).toContain('/admin');
    expect(disallowList).toContain('/portal');
    expect(disallowList).toContain('/login');
    expect(disallowList).toContain('/mfa');
    expect(disallowList).toContain('/reset-password');
    expect(disallowList).toContain('/invite');
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

  it('enforces verified identity and eliminates C|EH, info@redwan.work, and fabricated testimonials across app/components/lib', async () => {
    expect(SITE.name).toBe('Md. Redwan Ahmed');
    expect(SITE.email).toBe('contact@redwan.work');

    const { settings } = await getSiteSettingsAndResume();
    expect(settings.full_name).toBe('Md. Redwan Ahmed');
    expect(JSON.stringify(settings)).not.toMatch(/C\|EH/i);
    expect(JSON.stringify(settings)).not.toMatch(/Certified Ethical Hacker/i);

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
      if (/C\|EH/i.test(src) || /Certified Ethical Hacker/i.test(src)) {
        violations.push(`${rel}: contains unverified C|EH claim`);
      }
      if (/info@redwan\.work/i.test(src)) {
        violations.push(`${rel}: contains legacy info@redwan.work address`);
      }
      if (/from ['"]@\/lib\/content\/testimonials['"]/.test(src) || /from ['"]\.\/.*testimonials['"]/.test(src)) {
        violations.push(`${rel}: imports hardcoded fabricated testimonials`);
      }
    }

    expect(violations).toEqual([]);
  });
});
