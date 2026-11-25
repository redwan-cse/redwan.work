import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('UI/UX & WCAG AA Accessibility Audit v4 (PR A) Regressions', () => {
  it('[A11Y-V4-01] gates external GA4/Clarity scripts behind webdriver check and explicit consent while keeping lazyOnload', () => {
    const src = readSrc('components/analytics-scripts.tsx');
    expect(src).toContain('navigator.webdriver === true');
    expect(src).toContain('scriptsEnabled');
    expect(src).toContain('allowsAnalyticsStorage()');
    expect(src).toContain('strategy="lazyOnload"');
    expect(src).not.toContain('strategy="afterInteractive"');
  });

  it('[A11Y-V4-02] gives CommandDialog accessible DialogTitle/DialogDescription and neutralizes CommandSeparator inside listbox', () => {
    const commandSrc = readSrc('components/ui/command.tsx');
    expect(commandSrc).toContain('<DialogTitle className="sr-only">');
    expect(commandSrc).toContain('<DialogDescription className="sr-only">');
    expect(commandSrc).toContain('role="presentation"');
    expect(commandSrc).toContain('aria-label={ariaLabel ??');
    expect(commandSrc).toContain('focus-visible:ring-2');

    const paletteSrc = readSrc('components/admin/admin-command-palette.tsx');
    expect(paletteSrc).toContain('event.repeat');
    expect(paletteSrc).toContain('[role="dialog"]');
  });

  it('[A11Y-V4-03] defaults CardTitle to h2 and enforces h1 landmarks on invoices/new, portal/invoices/[id], and error boundaries', () => {
    const cardSrc = readSrc('components/ui/card.tsx');
    expect(cardSrc).toContain("as: Comp = 'h2'");

    const newInvoiceSrc = readSrc('app/(admin)/admin/invoices/new/page.tsx');
    expect(newInvoiceSrc).toContain('<h1');

    const portalInvoiceSrc = readSrc('app/(client)/portal/invoices/[id]/page.tsx');
    expect(portalInvoiceSrc).toContain('<h1');

    for (const rel of [
      'app/not-found.tsx',
      'app/error.tsx',
      'app/(admin)/admin/error.tsx',
      'app/(client)/portal/error.tsx',
      'app/(client)/portal/not-found.tsx',
      'app/blogs/error.tsx',
    ]) {
      expect(readSrc(rel), `${rel} should render an <h1> landmark`).toContain('<h1');
    }
  });

  it('[A11Y-V4-04] enforces WCAG AA badge contrast, WCAG 1.4.11 non-text border/input contrast, and 24px+ touch targets', () => {
    const serviceSlugSrc = readSrc('app/services/[slug]/page.tsx');
    expect(serviceSlugSrc).toContain('text-amber-800');
    expect(serviceSlugSrc).toContain('dark:text-amber-300');
    expect(serviceSlugSrc).not.toContain('text-amber-600 dark:text-amber-400');

    const css = readSrc('app/globals.css');
    expect(css).toContain('--border: oklch(0.6400 0.0180 255.5078)');
    expect(css).toContain('--input: oklch(0.6200 0.0200 255.0000)');
    expect(css).toContain('--border: oklch(0.5250 0.0350 255.0000)');
    expect(css).toContain('--input: oklch(0.5450 0.0350 256.0000)');

    const sheetSrc = readSrc('components/ui/sheet.tsx');
    expect(sheetSrc).toContain('h-8 w-8');

    const adminOrderDetailSrc = readSrc('app/(admin)/admin/orders/[id]/page.tsx');
    expect(adminOrderDetailSrc).toContain('name="is_final_delivery"');
    expect(adminOrderDetailSrc).toContain('h-6 w-6');
  });

  it('[A11Y-V4-05] removes hidden sr-only focus trap on /login, wires RichTextEditor ARIA props, and enables keyboard Table scroll & carousel Pause', () => {
    const loginSrc = readSrc('app/(auth)/login/page.tsx');
    expect(loginSrc).not.toContain("'sr-only'");

    const contactSrc = readSrc('components/enhanced-contact-form.tsx');
    expect(contactSrc).toContain('error={!!errors.projectSummary}');
    expect(contactSrc).toContain('ariaDescribedBy={errors.projectSummary ? "projectSummary-error" : undefined}');

    const rteSrc = readSrc('components/ui/rich-text-editor.tsx');
    expect(rteSrc).not.toContain("mode === 'preview' && 'sr-only'");
    expect(rteSrc).toContain("mode === 'preview' && 'hidden'");

    const tableSrc = readSrc('components/ui/table.tsx');
    expect(tableSrc).toContain('tabIndex={0}');
    expect(tableSrc).toContain('role="region"');

    const carouselSrc = readSrc('components/testimonial-carousel.tsx');
    expect(carouselSrc).toContain('Pause review autoplay');
    expect(carouselSrc).toContain('-ml-4 flex');

    const recoverySrc = readSrc('app/(admin)/admin/recovery/page.tsx');
    expect(recoverySrc).toContain('role="progressbar"');
  });
});
