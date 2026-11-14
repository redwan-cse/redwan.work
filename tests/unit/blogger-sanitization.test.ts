import { describe, expect, it } from 'vitest';
import {
  createBloggerAuthFromBase64,
  extractBlogToc,
  extractExcerpt,
  getBlogPaginationMeta,
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
    `;
    const plain = stripHtmlToPlainText(bloggerHtml);
    expect(plain).not.toContain('.code-block-wrap');
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
});
