import { describe, expect, it } from 'vitest';
import {
  clearBlogCache,
  compactBloggerPostItem,
  createBloggerAuthFromBase64,
  extractBlogToc,
  extractExcerpt,
  getBlogPaginationMeta,
  getBlogPostsPage,
  stripHtmlToPlainText,
} from '@/lib/blogger';

describe('blogger HTML-to-plaintext sanitization (CodeQL Alert #1)', () => {
  it('eliminates nested multi-character <script> reconstructions and unclosed angle brackets', () => {
    const nested = 'Intro <scr<script>ipt>alert(1)</script> outro';
    const unclosed = 'Hello <script src="https://evil.example/x.js" world';
    const encodedNested = 'Start &lt;scr&lt;script&gt;ipt&gt;payload&lt;/script&gt; end';

    expect(extractExcerpt(nested, 200)).not.toContain('<script');
    expect(extractExcerpt(nested, 200)).not.toContain('<');
    expect(extractExcerpt(nested, 200)).not.toContain('>');

    expect(extractExcerpt(unclosed, 200)).not.toContain('<script');
    expect(extractExcerpt(unclosed, 200)).not.toContain('<');

    expect(extractExcerpt(encodedNested, 200)).not.toContain('<script');
    expect(extractExcerpt(encodedNested, 200)).not.toContain('<');

    expect(stripHtmlToPlainText('<p>Clean <strong>article</strong> body</p>')).toBe(
      'Clean article body'
    );
  });

  it('preserves double-encoded literal entity text without turning &amp;lt; into angle brackets', () => {
    const sample = 'Literal entity: &amp;lt;tag&amp;gt; stays safe';
    const out = extractExcerpt(sample, 200);
    expect(out).toBe('Literal entity: &lt;tag&gt; stays safe');
  });

  it('strips embedded CSS styles, scripts, code-block headers, and static TOC navs from excerpts', () => {
    const bloggerHtml = `
      <style>
        /* Clean Code Block Window */
        .code-block-wrap { margin: 24px 0 !important; border: 1px solid #d0d7de; }
      </style>
      <nav class="table-of-contents">
        <h2>Table of Contents</h2>
        <a href="#intro">Introduction</a>
      </nav>
      <h2>Introduction <a class="heading-anchor" href="#intro">#</a></h2>
      <p>Hardening Linux <strong>ksmbd</strong> endpoints against pre-auth remote execution.</p>
      <div class="code-block-header"><span>bash</span><button>Copy</button></div>
      <script>console.log('ignored');</script>
      <script type="text/javascript">window.__pwn = 1;</script >
      <style media="all">.malformed-close { display: none; }</style\t bar="1">
    `;
    const plain = stripHtmlToPlainText(bloggerHtml);
    expect(plain).not.toContain('.code-block-wrap');
    expect(plain).not.toContain('.malformed-close');
    expect(plain).not.toContain('window.__pwn');
    expect(plain).not.toContain('margin:');
    expect(plain).not.toContain('Copy');
    expect(plain).not.toContain('console.log');
    expect(plain).not.toContain('Introduction#');
    expect(plain).not.toContain('Introduction #');
    expect(plain).toContain('Hardening Linux ksmbd endpoints against pre-auth remote execution.');
  });

  it('extracts structured h2/h3 Table of Contents and falls back to static TOC nav when headings lack h2/h3', () => {
    const htmlWithHeadings = `
      <style>.code-block-wrap { color: red; }</style>
      <nav class="table-of-contents"><h2 class="toc-title">Table of Contents</h2></nav>
      <h2>First Section <a class="heading-anchor" href="#first">#</a></h2>
      <h3>Sub Detail</h3>
      <h2>First Section</h2>
    `;
    const toc = extractBlogToc(htmlWithHeadings);
    expect(toc).toEqual([
      { level: 2, id: 'first-section', text: 'First Section' },
      { level: 3, id: 'sub-detail', text: 'Sub Detail' },
      { level: 2, id: 'first-section-2', text: 'First Section' },
    ]);

    const staticNavHtml = `<nav class="table-of-contents"><a href="#part-one">Part One</a><a href="#part-two">Part Two</a></nav>`;
    expect(extractBlogToc(staticNavHtml)).toEqual([
      { level: 2, id: 'part-one', text: 'Part One' },
      { level: 2, id: 'part-two', text: 'Part Two' },
    ]);
  });

  it('computes 1+9 featured-plus-grid page 1 pagination and page 2+ offsets accurately', () => {
    expect(getBlogPaginationMeta(10, 1)).toEqual({
      totalPages: 1,
      startIndex: 0,
      pageSize: 10,
    });
    expect(getBlogPaginationMeta(12, 1)).toEqual({
      totalPages: 2,
      startIndex: 0,
      pageSize: 10,
    });
    expect(getBlogPaginationMeta(12, 2)).toEqual({
      totalPages: 2,
      startIndex: 10,
      pageSize: 9,
    });
    expect(getBlogPaginationMeta(20, 3)).toEqual({
      totalPages: 3,
      startIndex: 19,
      pageSize: 9,
    });
  });

  it('creates Blogger JWT auth directly without triggering GoogleAuth credentials deprecation warnings', () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => {
      warnings.push(`${w.name}: ${w.message}`);
    };
    process.on('warning', onWarning);
    try {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'service_account',
          client_email: 'blogger-reader@example.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nTEST_PLACEHOLDER_KEY\n-----END PRIVATE KEY-----\n',
        })
      ).toString('base64');

      const auth = createBloggerAuthFromBase64(payload);
      expect(auth).not.toBeNull();
      expect(auth?.email).toBe('blogger-reader@example.iam.gserviceaccount.com');
      expect(warnings.some((w) => /credentials.*deprecated/i.test(w))).toBe(false);
    } finally {
      process.off('warning', onWarning);
    }
  });

  it('compacts multi-megabyte raw Blogger HTML payloads safely below Next.js 2MB Data Cache limit while preserving metadata', async () => {
    const hugeBody =
      '<style>.code{color:red}</style><img src="https://cdn.example.com/hero.webp" alt="hero"/>' +
      '<h2>Architecture Overview</h2><p>Deep security analysis of kernel hardening and network segmentation.</p>' +
      '<h3>Threat Model</h3>' +
      `<pre><code>${'A'.repeat(110_000)}</code></pre>`;

    const compacted = compactBloggerPostItem({
      id: 'big-1',
      title: 'Large Research Post',
      content: hugeBody,
      url: 'https://blogs.redwan.work/2026/11/large-post.html',
      published: '2026-11-20T00:00:00.000Z',
      labels: ['Security', 'Linux'],
    });

    expect(compacted.imageUrl).toBe('https://cdn.example.com/hero.webp');
    expect(compacted.excerpt).toContain('Deep security analysis of kernel hardening');
    expect(compacted.readingMinutes).toBeGreaterThanOrEqual(2);
    expect(compacted.toc).toEqual([
      { level: 2, id: 'architecture-overview', text: 'Architecture Overview' },
      { level: 3, id: 'threat-model', text: 'Threat Model' },
    ]);
    expect(compacted.content.length).toBeLessThanOrEqual(365);

    const prevFixture = process.env.BLOGGER_FIXTURE_POSTS_JSON;
    try {
      // 30 posts x ~110 KB raw HTML = ~3.3 MB (> Next.js 2 MB Data Cache limit)
      const rawFixture = Array.from({ length: 30 }, (_, idx) => ({
        id: `heavy-${idx + 1}`,
        title: `Heavy Post #${idx + 1}`,
        content: hugeBody,
        url: `https://blogs.redwan.work/2026/11/heavy-${idx + 1}.html`,
        published: '2026-11-20T00:00:00.000Z',
        labels: ['Security'],
      }));
      const rawBytes = Buffer.byteLength(JSON.stringify(rawFixture), 'utf8');
      expect(rawBytes).toBeGreaterThan(3_000_000);

      process.env.BLOGGER_FIXTURE_POSTS_JSON = JSON.stringify(rawFixture);
      clearBlogCache();

      const page = await getBlogPostsPage(1, 30, 30);
      expect(page.totalItems).toBe(30);
      expect(page.posts).toHaveLength(30);
      const cachedBytes = Buffer.byteLength(JSON.stringify(page), 'utf8');
      expect(cachedBytes).toBeLessThan(100_000);
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
