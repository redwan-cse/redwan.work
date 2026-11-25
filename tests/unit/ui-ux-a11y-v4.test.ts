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

  it('[UI-V4-06] scales 4K TV (min-width: 2400px) container/root typography, adds fluid clamp() headings, and enforces high-visibility :focus-visible rings', () => {
    const css = readSrc('app/globals.css');
    expect(css).toContain('@media (width >= 2400px)');
    expect(css).toContain('max-width: 1840px');
    expect(css).toContain('@media (min-width: 2400px)');
    expect(css).toContain('clamp(18px, 0.52vw, 20px)');
    expect(css).toContain('text-fluid-display');
    expect(css).toContain('text-fluid-heading');
    expect(css).toContain('outline: 2px solid var(--ring)');
    expect(css).toContain('outline: 3px solid var(--ring)');

    const heroFieldSrc = readSrc('components/motion/antigravity-hero-field.tsx');
    expect(heroFieldSrc).toContain('hasPointerMoved');
    expect(heroFieldSrc).toContain('rect.width / 2 - 320');
  });

  it('[UI-V4-07] caps PanelShell main width for 4K TV, scrolls drawers, uses dvh, and prevents Toaster vs bottom-nav overlap', () => {
    const shellSrc = readSrc('components/panel/panel-shell.tsx');
    expect(shellSrc).toContain('min-h-dvh');
    expect(shellSrc).toContain('max-w-[1600px]');
    expect(shellSrc).toContain('min-h-0 flex-1 space-y-1 overflow-y-auto');
    expect(shellSrc).toContain('env(safe-area-inset-bottom)');

    for (const layoutPath of [
      'app/(admin)/admin/layout.tsx',
      'app/(client)/portal/layout.tsx',
    ]) {
      const src = readSrc(layoutPath);
      expect(src).toContain('position="top-right"');
      expect(src).toContain('mobileOffset=');
    }

    const kanbanSrc = readSrc('components/admin/orders-kanban-view.tsx');
    expect(kanbanSrc).toContain('overflow-x-auto');
    expect(kanbanSrc).toContain('w-[272px]');
    expect(kanbanSrc).toContain('2xl:grid-cols-6');
    expect(kanbanSrc).toContain('tabIndex={0}');
  });

  it('[UI-V4-08] prevents iOS Safari zoom on inputs, bounds dialogs/popovers, uses flexible Turnstile, and compacts mobile privacy banner', () => {
    for (const uiPath of [
      'components/ui/input.tsx',
      'components/ui/textarea.tsx',
      'components/ui/select.tsx',
    ]) {
      expect(readSrc(uiPath), `${uiPath} should use 16px text on mobile`).toContain('text-base md:text-sm');
    }

    const dialogSrc = readSrc('components/ui/dialog.tsx');
    expect(dialogSrc).toContain('w-[calc(100%-2rem)]');
    expect(dialogSrc).toContain('max-h-[90dvh]');

    const alertDialogSrc = readSrc('components/ui/alert-dialog.tsx');
    expect(alertDialogSrc).toContain('w-[calc(100%-2rem)]');
    expect(alertDialogSrc).toContain('max-h-[90dvh]');

    const popoverSrc = readSrc('components/ui/popover.tsx');
    expect(popoverSrc).toContain('max-w-[calc(100vw-1.5rem)]');

    const blogModalSrc = readSrc('components/blog-preview-modal.tsx');
    expect(blogModalSrc).not.toContain('[&>button]:hidden');
    expect(blogModalSrc).toContain('max-h-[90dvh]');

    const contactSrc = readSrc('components/enhanced-contact-form.tsx');
    expect(contactSrc).toContain('data-size="flexible"');
    expect(contactSrc).toContain('w-[112px] shrink-0 sm:w-[140px]');

    const cookieSrc = readSrc('components/cookie-preferences.tsx');
    expect(cookieSrc).toContain('window.innerWidth >= 640');
    expect(cookieSrc).toContain('max-h-[min(38dvh,300px)]');
  });

  it('[UI-V4-09] reserves /portfolio Suspense skeleton height and preserves A4 invoice print headers & full-width layout', () => {
    const portfolioSrc = readSrc('app/portfolio/page.tsx');
    expect(portfolioSrc).toContain('min-h-[920px]');

    const clientInvSrc = readSrc('app/(client)/portal/invoices/[id]/page.tsx');
    expect(clientInvSrc).not.toContain('flex flex-wrap items-center justify-between gap-3 print:hidden');
    expect(clientInvSrc).toContain('<div className="print:hidden">');

    const adminInvSrc = readSrc('app/(admin)/admin/invoices/[id]/page.tsx');
    expect(adminInvSrc).toContain('hidden border-slate-300 bg-white shadow-none print:block');
    expect(adminInvSrc).toContain('grid gap-6 lg:grid-cols-12 print:block');
  });
});
