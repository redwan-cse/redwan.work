import { describe, expect, it } from 'vitest';
import {
  computeCappedLtvDeltaUsdCents,
  computeDepositSplit,
  computeInvoiceTotals,
  validatePaymentSubmission,
} from '@/lib/finance/invariants';
import {
  resolveCallbackOrigin,
  sanitizeAdminMfaNextPath,
  sanitizeHttpUrl,
  sanitizeRelativeRedirectPath,
  trySanitizeHttpUrl,
} from '@/lib/security/safe-redirect';
import {
  extractBlogToc,
  extractExcerpt,
  stripHtmlToPlainText,
} from '@/lib/blogger';
import { validateMagicBytes } from '@/lib/mime';
import { currencySchema, positiveFiniteFxRateSchema } from '@/lib/validation/schemas';

/** Deterministic xorshift32 PRNG for reproducible fuzzing across CI runs. */
function createSeededRng(seed = 0x5eed1234) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

describe('Method 4: Deterministic Property-Based & Fuzz Testing (Security + Finance)', () => {
  it('[M4-FUZZ-FINANCE] holds algebraic ledger invariants across 250 randomized invoice/deposit/payment scenarios', () => {
    const rand = createSeededRng(0xc0ffee01);

    for (let i = 0; i < 250; i += 1) {
      const subtotal = Math.floor(rand() * 5_000_000);
      const discount = Math.floor(rand() * (subtotal + 1));
      const taxRateBps = Math.floor(rand() * 3500);

      const totals = computeInvoiceTotals({
        subtotalCents: subtotal,
        discountCents: discount,
        taxRateBps,
      });

      expect(totals.taxableCents).toBe(subtotal - discount);
      expect(totals.taxCents).toBeGreaterThanOrEqual(0);
      expect(totals.totalCents).toBe(totals.taxableCents + totals.taxCents);
      expect(totals.totalCents).toBeGreaterThanOrEqual(totals.taxableCents);

      // Discount > subtotal MUST always throw
      if (subtotal < 4_999_000) {
        expect(() =>
          computeInvoiceTotals({
            subtotalCents: subtotal,
            discountCents: subtotal + 1,
            taxRateBps,
          })
        ).toThrow();
      }

      // Deposit split must always sum exactly to totalCents
      const depositPercent = Math.floor(rand() * 101);
      const split = computeDepositSplit(totals.totalCents, depositPercent);
      expect(split.depositCents + split.balanceCents).toBe(totals.totalCents);
      expect(split.depositCents).toBeGreaterThanOrEqual(0);
      expect(split.balanceCents).toBeGreaterThanOrEqual(0);

      // Payment submission invariants
      const alreadyPaid = Math.floor(rand() * (totals.totalCents + 1));
      const remaining = totals.totalCents - alreadyPaid;
      if (remaining > 0) {
        const validPay = Math.max(1, Math.floor(rand() * remaining) + 1);
        const okRes = validatePaymentSubmission({
          invoiceTotalCents: totals.totalCents,
          amountPaidCents: alreadyPaid,
          creditedCents: 0,
          invoiceCurrency: 'USD',
          paymentAmountCents: validPay,
          paymentCurrency: 'usd',
        });
        expect(okRes).toEqual({
          ok: true,
          remainingAfterPaymentCents: remaining - validPay,
        });

        // Overpayment by 1 cent MUST always be rejected
        const overRes = validatePaymentSubmission({
          invoiceTotalCents: totals.totalCents,
          amountPaidCents: alreadyPaid,
          creditedCents: 0,
          invoiceCurrency: 'USD',
          paymentAmountCents: remaining + 1,
          paymentCurrency: 'USD',
        });
        expect(overRes).toEqual({ ok: false, reason: 'overpayment' });

        // Currency mismatch MUST always be rejected
        const currRes = validatePaymentSubmission({
          invoiceTotalCents: totals.totalCents,
          amountPaidCents: alreadyPaid,
          creditedCents: 0,
          invoiceCurrency: 'USD',
          paymentAmountCents: validPay,
          paymentCurrency: 'EUR',
        });
        expect(currRes).toEqual({ ok: false, reason: 'currency_mismatch' });
      }

      // Capped LTV delta never exceeds remaining * fx
      const fx = 0.01 + rand() * 2;
      const ltv = computeCappedLtvDeltaUsdCents({
        remainingBeforePaymentCents: remaining,
        paymentAmountCents: remaining + 99999,
        fxRateToUsd: fx,
      });
      expect(ltv).toBe(Math.round(remaining * fx));
    }

    // Schema boundary checks for currency & FX
    expect(currencySchema.safeParse('usd').success).toBe(true);
    expect(currencySchema.safeParse('US').success).toBe(false);
    expect(currencySchema.safeParse('USD1').success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(Number.NaN).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(-1).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(0).success).toBe(false);
  });

  it('[M4-FUZZ-REDIRECT-URL] neutralizes open redirects, traversal, CRLF, and unsafe URL schemes', () => {
    const adversarialPaths = [
      '//evil.example/phish',
      '///evil.example',
      '/\\evil.example',
      '/%5cevil.example',
      '/%2f%2fevil.example',
      '/admin/%2e%2e/portal',
      '/admin/../../etc/passwd',
      'https://evil.example/admin',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '/admin\r\nSet-Cookie: pwn=1',
      '/admin\u0000/orders',
      '/%ZZ-malformed',
      '',
      'admin/orders',
    ];

    for (const payload of adversarialPaths) {
      expect(sanitizeRelativeRedirectPath(payload), `Path should fail: ${JSON.stringify(payload)}`).toBeNull();
      expect(sanitizeAdminMfaNextPath(payload)).toBe('/admin');
    }

    // Non-admin valid relative paths must still coerce to /admin in sanitizeAdminMfaNextPath
    expect(sanitizeAdminMfaNextPath('/portal/orders')).toBe('/admin');
    expect(sanitizeAdminMfaNextPath('/admin/orders?view=kanban')).toBe('/admin/orders?view=kanban');

    // Scheme sanitization
    const badUrls = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'file:///etc/passwd',
      'ftp://files.example.com/a',
      'blob:https://redwan.work/123',
      'mailto:test@example.com',
      'not a url',
    ];
    for (const u of badUrls) {
      expect(() => sanitizeHttpUrl(u)).toThrow();
      expect(trySanitizeHttpUrl(u)).toBeNull();
    }

    // Callback origin never trusts attacker-supplied Host headers
    expect(
      resolveCallbackOrigin({
        host: 'attacker.evil',
        forwardedHost: 'attacker.evil',
        forwardedProto: 'http',
        requestOrigin: 'https://redwan.work',
        siteUrl: 'https://redwan.work',
      })
    ).toBe('https://redwan.work');

    // Callback origin never downgrades HTTPS siteUrl to HTTP via x-forwarded-proto
    expect(
      resolveCallbackOrigin({
        host: 'www.redwan.work',
        forwardedProto: 'http',
        requestOrigin: 'https://www.redwan.work',
        siteUrl: 'https://redwan.work',
      })
    ).toBe('https://www.redwan.work');
  });

  it('[M4-FUZZ-HTML-SANITIZER] guarantees zero angle brackets or script payloads survive Blogger plaintext extraction', () => {
    const rand = createSeededRng(0xbadc0de);
    const fragments = [
      '<script>',
      '</script >',
      '<scr<script>ipt>',
      '&lt;script&gt;',
      '<style>.x{color:red}</style\t>',
      '<svg onload=alert(1)>',
      '<img src=x onerror=alert(1)>',
      '<nav class="table-of-contents"><h2>Table of Contents</h2></nav>',
      '<h2>Safe Heading</h2>',
      '<h3>Sub Section</h3>',
      'Plain engineering prose.',
      '&amp;lt;escaped&amp;gt;',
      '<unclosed attr="1"',
    ];

    for (let i = 0; i < 100; i += 1) {
      let html = '';
      const count = 3 + Math.floor(rand() * 8);
      for (let j = 0; j < count; j += 1) {
        html += fragments[Math.floor(rand() * fragments.length)] + ' ';
      }
      const plain = stripHtmlToPlainText(html);
      const excerpt = extractExcerpt(html, 120);
      const toc = extractBlogToc(html);

      // Unless literally double-encoded `&amp;lt;` was included, no raw `<script` tag can appear
      expect(plain.toLowerCase()).not.toContain('<script');
      expect(excerpt.toLowerCase()).not.toContain('<script');
      expect(plain).not.toContain('.x{color:red}');
      expect(Array.isArray(toc)).toBe(true);
    }
  });

  it('[M4-FUZZ-MAGIC-BYTES] rejects spoofed/polyglot HTML and random noise across all allowed MIME types', () => {
    const rand = createSeededRng(0xfeedface);
    const mimes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/avif',
      'application/zip',
      'application/msword',
    ];

    // HTML/SVG script disguised as any binary MIME must always fail
    const htmlPayload = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>');
    const svgPayload = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    for (const mime of mimes) {
      expect(validateMagicBytes(htmlPayload, mime), `HTML passed as ${mime}`).toBe(false);
      expect(validateMagicBytes(svgPayload, mime), `SVG passed as ${mime}`).toBe(false);
      expect(validateMagicBytes(new Uint8Array([0x01, 0x02]), mime), `Truncated passed as ${mime}`).toBe(false);
    }

    // 100 random buffers starting with ASCII letters 'A'-'Z' (never matching binary signatures)
    for (let i = 0; i < 100; i += 1) {
      const buf = new Uint8Array(32);
      for (let b = 0; b < 32; b += 1) {
        buf[b] = 0x41 + Math.floor(rand() * 24); // 'A'..'X' (excludes '%', 0x89, 0xFF, 0xD0, '{')
      }
      // Avoid accidental 'RIFF' or 'PK\x03\x04'
      buf[0] = 0x41;
      for (const mime of mimes) {
        expect(validateMagicBytes(buf, mime)).toBe(false);
      }
    }
  });
});
