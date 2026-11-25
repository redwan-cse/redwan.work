import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentSession,
  mockGetSupabaseAdmin,
  mockGetSiteSettingsAndResume,
  mockGetPublicObjectBytes,
} = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockGetSiteSettingsAndResume: vi.fn(),
  mockGetPublicObjectBytes: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));
vi.mock('@/lib/cms/queries', () => ({
  getSiteSettingsAndResume: mockGetSiteSettingsAndResume,
}));
vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    getPublicObjectBytes: mockGetPublicObjectBytes,
  };
});

import { GET as getOrderMessages } from '@/app/api/orders/[id]/messages/route';
import { serveStoredResumePdf } from '@/lib/resume/route-handler';
import { clearBlogCache, getLatestBlogPostTimestamp } from '@/lib/blogger';

const ROOT = process.cwd();

describe('Deep Audit v3 Core Web Vitals, Bundle Slimming & Caching Regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[PERF-V3-01] uses domAnimation (no domMax or layoutId), wires Tailwind v4 next/font variables, and keeps Toaster off public routes', () => {
    const motionProvider = fs.readFileSync(
      path.join(ROOT, 'components/motion/motion-provider.tsx'),
      'utf8'
    );
    expect(motionProvider).toContain('domAnimation');
    expect(motionProvider).not.toContain('domMax');

    for (const rel of [
      'components/navigation.tsx',
      'components/panel/panel-shell.tsx',
      'components/services-showcase.tsx',
      'components/portfolio-showcase.tsx',
      'components/blog-browser.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must not use layoutId`).not.toContain('layoutId');
    }

    const rootLayout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    expect(rootLayout).toContain('--font-inter');
    expect(rootLayout).toContain('--font-jetbrains-mono');
    expect(rootLayout).not.toContain('<Toaster');
    expect(rootLayout).not.toContain('challenges.cloudflare.com');

    const globalsCss = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    expect(globalsCss).toContain('--font-sans: var(--font-inter)');
    expect(globalsCss).toContain('--font-mono: var(--font-jetbrains-mono)');
    expect(globalsCss).not.toContain('--font-sans: Inter, system-ui');
  });

  it('[PERF-V3-02] guarantees 0ms Hero LCP opacity, RSC /resume with lazy print island, no CSP-blocked font @import, and lazyOnload analytics', () => {
    const revealSrc = fs.readFileSync(path.join(ROOT, 'components/motion/reveal.tsx'), 'utf8');
    expect(revealSrc).not.toContain("blur(4px)");
    expect(revealSrc).toContain('hidden: { opacity: 1');

    const resumeView = fs.readFileSync(path.join(ROOT, 'components/resume-view.tsx'), 'utf8');
    expect(resumeView.trimStart().startsWith("'use client'")).toBe(false);
    expect(resumeView).not.toContain('useReactToPrint');
    expect(resumeView).not.toContain('InteractiveCard');
    expect(resumeView).toContain('ResumePrintHost');

    const printableResume = fs.readFileSync(
      path.join(ROOT, 'components/printable-resume.tsx'),
      'utf8'
    );
    expect(printableResume).not.toContain('fonts.googleapis.com');

    const analytics = fs.readFileSync(
      path.join(ROOT, 'components/analytics-scripts.tsx'),
      'utf8'
    );
    expect(analytics).toContain('strategy="lazyOnload"');
    expect(analytics).not.toContain('strategy="afterInteractive"');

    const authLayout = fs.readFileSync(path.join(ROOT, 'app/(auth)/layout.tsx'), 'utf8');
    expect(authLayout).not.toContain('MarketingFrame');
    expect(authLayout).not.toContain('AntigravityHeroField');
  });

  it('[PERF-V3-03] GET /api/orders/[id]/messages supports ?after delta filtering and returns 304 Not Modified on ETag match', async () => {
    const orderId = '11111111-2222-4333-8444-555555555555';
    const clientId = '22222222-3333-4444-8555-666666666666';
    const capturedGtArgs: Array<[string, string]> = [];
    let vaultQueries = 0;

    mockGetCurrentSession.mockResolvedValue({
      userId: clientId,
      email: 'client@disposable.test',
      fullName: 'Client User',
      role: 'client',
    });

    const msgRows = [
      {
        id: 'msg-2',
        body: 'Delta reply',
        created_at: '2026-11-25T10:05:00.000Z',
        is_internal_note: false,
        author_id: 'admin-1',
        attachment_file_ids: [],
        author: { full_name: 'Redwan', role: 'admin' },
      },
    ];

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: orderId, client_id: clientId, code: 'ORD-1001', title: 'Audit', status: 'in_progress' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'order_messages') {
          const chain = {
            eq: () => chain,
            order: () => chain,
            limit: () => chain,
            gt: (col: string, val: string) => {
              capturedGtArgs.push([col, val]);
              return chain;
            },
            then: (resolve: (val: { data: typeof msgRows; error: null }) => void) =>
              resolve({ data: msgRows, error: null }),
          };
          return { select: () => chain };
        }
        if (table === 'vault_files') {
          vaultQueries += 1;
        }
        return {};
      }),
    });

    const firstReq = new NextRequest(
      `https://redwan.work/api/orders/${orderId}/messages?after=2026-11-25T10:00:00.000Z`
    );
    const firstRes = await getOrderMessages(firstReq, { params: Promise.resolve({ id: orderId }) });
    expect(firstRes.status).toBe(200);
    expect(capturedGtArgs).toEqual([['created_at', '2026-11-25T10:00:00.000Z']]);
    expect(vaultQueries).toBe(0);
    const etag = firstRes.headers.get('etag');
    expect(etag).toMatch(/^W\/"/);
    const body = (await firstRes.json()) as { messages: unknown[]; delta: boolean };
    expect(body.delta).toBe(true);
    expect(body.messages).toHaveLength(1);

    // Repeat with matching If-None-Match -> 304 Not Modified
    const secondReq = new NextRequest(
      `https://redwan.work/api/orders/${orderId}/messages?after=2026-11-25T10:00:00.000Z`,
      { headers: { 'if-none-match': etag! } }
    );
    const secondRes = await getOrderMessages(secondReq, { params: Promise.resolve({ id: orderId }) });
    expect(secondRes.status).toBe(304);
    expect(secondRes.headers.get('etag')).toBe(etag);
  });

  it('[PERF-V3-04] serveStoredResumePdf skips resume_items lookup, emits weak ETag + edge caching, and serves 304 on match', async () => {
    vi.stubEnv('R2_ENDPOINT', 'https://r2.disposable.test');
    vi.stubEnv('R2_PUBLIC_BUCKET', 'public-bucket');
    vi.stubEnv('R2_PUBLIC_ACCESS_KEY_ID', 'ak');
    vi.stubEnv('R2_PUBLIC_SECRET_ACCESS_KEY', 'sk');
    try {
      const pdf = Buffer.from('%PDF-1.7\nresume-bytes\n%%EOF\n', 'ascii');
      mockGetSiteSettingsAndResume.mockResolvedValue({
        settings: {
          resume_pdf_url: 'https://assets.redwan.work/assets/resume/Md_Redwan_Ahmed_Resume.pdf',
          full_name: 'Md. Redwan Ahmed',
        },
        items: [],
      });
      mockGetPublicObjectBytes.mockResolvedValue(pdf);

      const first = await serveStoredResumePdf(new NextRequest('https://redwan.work/resume.pdf'));
      expect(first.status).toBe(200);
      expect(mockGetSiteSettingsAndResume).toHaveBeenCalledWith({ skipResumeItems: true });
      const etag = first.headers.get('etag');
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
      expect(first.headers.get('cache-control')).toContain('s-maxage=3600');
      expect(first.headers.get('cache-control')).toContain('stale-while-revalidate=86400');

      const second = await serveStoredResumePdf(
        new NextRequest('https://redwan.work/resume.pdf', {
          headers: { 'if-none-match': etag! },
        })
      );
      expect(second.status).toBe(304);
      expect(second.headers.get('etag')).toBe(etag);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('[PERF-V3-05] uses lightweight getLatestBlogPostTimestamp and ISR revalidate on sitemap.ts', async () => {
    const sitemapSrc = fs.readFileSync(path.join(ROOT, 'app/sitemap.ts'), 'utf8');
    expect(sitemapSrc).toMatch(/export\s+const\s+revalidate\s*=\s*3600/);
    expect(sitemapSrc).toContain('getLatestBlogPostTimestamp');
    expect(sitemapSrc).not.toContain('getBlogPostsPage');

    const prevFixture = process.env.BLOGGER_FIXTURE_POSTS_JSON;
    try {
      process.env.BLOGGER_FIXTURE_POSTS_JSON = JSON.stringify([
        {
          id: 'p1',
          title: 'Latest Post',
          content: '<p>body</p>',
          url: 'https://blogs.redwan.work/p1',
          published: '2026-11-20T12:34:56.000Z',
        },
      ]);
      clearBlogCache();
      const latest = await getLatestBlogPostTimestamp();
      expect(latest).toBe('2026-11-20T12:34:56.000Z');
    } finally {
      if (prevFixture === undefined) {
        delete process.env.BLOGGER_FIXTURE_POSTS_JSON;
      } else {
        process.env.BLOGGER_FIXTURE_POSTS_JSON = prevFixture;
      }
      clearBlogCache();
    }
  });
});
