import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);

/**
 * Method 8: Performance, Cache & Bundle-Budget Gate
 *
 * Enforces ISR caching, static param generation, RSC flight payload slimming,
 * async motion hydration, and Next.js image/package optimization contracts.
 */
describe('Method 8: Performance, Cache & Bundle-Budget Gate', () => {
  it('[M8-ISR-AND-SSG] exports ISR revalidate on public routes and generateStaticParams on dynamic detail pages', () => {
    const isrRoutes = [
      'app/page.tsx',
      'app/services/page.tsx',
      'app/services/[slug]/page.tsx',
      'app/portfolio/page.tsx',
      'app/portfolio/[slug]/page.tsx',
      'app/resume/page.tsx',
      'app/contact/page.tsx',
    ];
    for (const rel of isrRoutes) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must export numeric ISR revalidate`).toMatch(
        /export\s+const\s+revalidate\s*=\s*\d+/
      );
    }

    for (const rel of ['app/services/[slug]/page.tsx', 'app/portfolio/[slug]/page.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must export generateStaticParams`).toMatch(
        /export\s+async\s+function\s+generateStaticParams/
      );
    }
  });

  it('[M8-RSC-FLIGHT-SLIM] strips raw HTML content from /blogs RSC client props and avoids global BlogPreloader on non-blog pages', () => {
    const blogsPage = fs.readFileSync(path.join(ROOT, 'app/blogs/page.tsx'), 'utf8');
    expect(blogsPage).toContain('const { content, ...postSummary } = post');
    expect(blogsPage).toContain('post: postSummary');

    const blogBrowser = fs.readFileSync(path.join(ROOT, 'components/blog-browser.tsx'), 'utf8');
    expect(blogBrowser).toContain('BlogPostSummary');

    const marketingFrame = fs.readFileSync(path.join(ROOT, 'components/marketing-frame.tsx'), 'utf8');
    expect(marketingFrame).not.toContain('BlogPreloader');
  });

  it('[M8-ASYNC-HYDRATION-AND-NEXTCONFIG] uses strict LazyMotion, defers RichTextEditor, and configures Next.js bundle optimizations', () => {
    const motionProvider = fs.readFileSync(
      path.join(ROOT, 'components/motion/motion-provider.tsx'),
      'utf8'
    );
    expect(motionProvider).toContain('<LazyMotion');
    expect(motionProvider).toContain('strict');

    const contactForm = fs.readFileSync(
      path.join(ROOT, 'components/enhanced-contact-form.tsx'),
      'utf8'
    );
    expect(contactForm).toContain("import('@/components/ui/rich-text-editor')");

    const nextConfig = require('../../next.config.js') as {
      experimental?: { optimizePackageImports?: string[] };
      images?: { formats?: string[] };
    };
    expect(nextConfig.experimental?.optimizePackageImports).toEqual(
      expect.arrayContaining(['lucide-react', 'date-fns'])
    );
    expect(nextConfig.images?.formats).toEqual(
      expect.arrayContaining(['image/avif', 'image/webp'])
    );
  });
});
