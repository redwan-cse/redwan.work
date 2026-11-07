import { describe, expect, it } from 'vitest';
import { extractExcerpt, stripHtmlToPlainText } from '@/lib/blogger';

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
});
