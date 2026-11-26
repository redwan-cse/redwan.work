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

  it('[A11Y-V4-04] enforces WCAG AA badge contrast, refined tweakcn slate tokens, and 24px+ touch targets via FormCheckbox', () => {
    const serviceSlugSrc = readSrc('app/services/[slug]/page.tsx');
    expect(serviceSlugSrc).toContain('text-amber-800');
    expect(serviceSlugSrc).toContain('dark:text-amber-300');
    expect(serviceSlugSrc).not.toContain('text-amber-600 dark:text-amber-400');

    const css = readSrc('app/globals.css');
    expect(css).toContain('--border: oklch(0.8950 0.0140 255.5078)');
    expect(css).toContain('--input: oklch(0.8550 0.0160 255.0000)');
    expect(css).toContain('--border: oklch(0.3250 0.0596 254.9248)');
    expect(css).toContain('--input: oklch(0.3550 0.0480 256.0000)');

    const sheetSrc = readSrc('components/ui/sheet.tsx');
    expect(sheetSrc).toContain('h-8 w-8');

    const checkboxSrc = readSrc('components/ui/form-checkbox.tsx');
    expect(checkboxSrc).toContain('h-6 w-6');
    expect(checkboxSrc).toContain('h-4 w-4');

    const adminOrderDetailSrc = readSrc('app/(admin)/admin/orders/[id]/page.tsx');
    expect(adminOrderDetailSrc).toContain('<FormCheckbox');
    expect(adminOrderDetailSrc).toContain('name="is_final_delivery"');
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

  it('[UI-V4-08] prevents iOS Safari zoom and desktop shrinking on inputs, bounds dialogs/popovers, uses explicit flexible Turnstile with unmount cleanup, and compacts mobile privacy banner', () => {
    for (const uiPath of [
      'components/ui/input.tsx',
      'components/ui/textarea.tsx',
      'components/ui/select.tsx',
    ]) {
      const src = readSrc(uiPath);
      expect(src, `${uiPath} should use unified font-sans text-base across mobile and desktop`).toContain(
        'font-sans text-base'
      );
      expect(src, `${uiPath} must not shrink inputs on desktop via md:text-sm`).not.toContain('md:text-sm');
    }

    const labelSrc = readSrc('components/ui/label.tsx');
    expect(labelSrc).toContain('font-sans text-sm font-medium');

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
    expect(contactSrc).toContain('api.js?render=explicit');
    expect(contactSrc).toContain('turnstile.render(');
    expect(contactSrc).toContain('turnstile.remove(');
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

  it('[PORTAL-V4-10] renders unread notification badge as aria-hidden sibling (WCAG 2.5.3) and uses shortLabel in mobile bottom nav', () => {
    const shellSrc = readSrc('components/panel/panel-shell.tsx');
    expect(shellSrc).toContain('shortLabel?: string;');
    expect(shellSrc).toContain('item.shortLabel ?? item.label.split');
    expect(shellSrc).toMatch(/<\/PopoverTrigger>\s*\{unreadNotifications > 0 && \(/);
    expect(shellSrc).toContain('pointer-events-none absolute -top-1 -right-1');

    const portalLayoutSrc = readSrc('app/(client)/portal/layout.tsx');
    expect(portalLayoutSrc).toContain("shortLabel: 'Orders'");
    expect(portalLayoutSrc).toContain("shortLabel: 'New Order'");
  });

  it('[PORTAL-V4-11] guards Client Portal grid columns with min-w-0 and associates decline textarea labels', () => {
    const storeSrc = readSrc('components/panel/portal-order-store-form.tsx');
    expect(storeSrc).toContain('min-w-0 border-primary/30 bg-card/90 lg:col-span-5');
    expect(storeSrc).toContain('min-w-0 space-y-4 lg:col-span-7');
    expect(storeSrc).toContain('min-w-0 max-w-full');
    expect(storeSrc).toContain('text-base font-sans');
    expect(storeSrc).not.toContain('md:text-sm');

    const proposalsSrc = readSrc('app/(client)/portal/proposals/page.tsx');
    expect(proposalsSrc).toContain('htmlFor={`proposal-decline-${prp.id}`}');
    expect(proposalsSrc).toContain('id={`proposal-decline-${prp.id}`}');
  });

  it('[PORTAL-V4-12] enforces uniform non-shrinking form typography (font-sans text-base controls + text-sm labels) and 24px+ standalone back links across Client Portal', () => {
    for (const rel of [
      'app/(client)/portal/orders/[id]/page.tsx',
      'app/(client)/portal/invoices/[id]/page.tsx',
      'app/(client)/portal/proposals/[id]/page.tsx',
      'app/(client)/portal/tickets/[id]/page.tsx',
    ]) {
      expect(readSrc(rel), `${rel} back link should meet 24px target height`).toContain(
        'inline-flex min-h-6 items-center gap-1.5'
      );
    }

    for (const rel of [
      'app/(client)/portal/profile/page.tsx',
      'app/(client)/portal/tickets/page.tsx',
      'app/(client)/portal/invoices/[id]/page.tsx',
      'app/(client)/portal/orders/[id]/page.tsx',
      'components/panel/password-change-card.tsx',
      'components/panel/client-mfa-card.tsx',
      'components/panel/contract-live-chat.tsx',
      'components/panel/r2-file-uploader.tsx',
      'components/panel/portal-order-store-form.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src, `${rel} should not downgrade desktop form typography to md:text-xs`).not.toContain(
        'md:text-xs'
      );
      expect(src, `${rel} should not shrink desktop inputs to md:text-sm`).not.toContain(
        'md:text-sm'
      );
    }
  });

  it('[UI-V5-13] preserves ActionFeedbackForm space-y-* spacing on fieldset and eliminates oversized native checkboxes', () => {
    const affSrc = readSrc('components/panel/action-feedback-form.tsx');
    expect(affSrc).toContain('splitFieldsetSpacingClasses');
    expect(affSrc).toContain('space-[xy]-');

    for (const rel of [
      'components/admin/pipeline-hub-view.tsx',
      'components/admin/content-studio-drawers.tsx',
      'app/(admin)/admin/orders/page.tsx',
      'app/(admin)/admin/orders/[id]/page.tsx',
      'app/(admin)/admin/clients/[id]/page.tsx',
      'app/(admin)/admin/proposals/[id]/page.tsx',
      'app/(admin)/admin/tickets/[id]/page.tsx',
      'app/(client)/portal/orders/[id]/page.tsx',
      'components/panel/contract-live-chat.tsx',
      'components/panel/portal-order-store-form.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src, `${rel} should use FormCheckbox instead of oversized native h-6 w-6 checkbox`).not.toMatch(
        /h-6 w-6[^\n"]*accent-primary/
      );
      expect(src, `${rel} should render <FormCheckbox`).toContain('<FormCheckbox');
    }
  });

  it('[UI-V5-14] fixes Pillar select truncation, Retainer inline Status label alignment, and Content Studio tier labels', () => {
    const pipelineSrc = readSrc('components/admin/pipeline-hub-view.tsx');
    expect(pipelineSrc).not.toContain('lg:grid-cols-4');

    const billingSrc = readSrc('components/admin/billing-hub-view.tsx');
    expect(billingSrc).toContain('block h-9 min-w-[7.5rem] rounded-md border border-input bg-background px-3 text-base font-sans');
    expect(billingSrc).toContain('xl:col-span-5');

    const drawerSrc = readSrc('components/admin/content-studio-drawers.tsx');
    expect(drawerSrc).toContain('htmlFor="new-tier-price"');
    expect(drawerSrc).toContain('htmlFor="new-tier-dep"');
    expect(drawerSrc).toContain('htmlFor="new-tier-days"');
    expect(drawerSrc).toContain('htmlFor="new-tier-rev"');

    const settingsSrc = readSrc('app/(admin)/admin/settings/page.tsx');
    expect(settingsSrc).toContain('rows={5}');
    expect(settingsSrc).not.toContain('className="h-9 text-xs"');
  });

  it('[UI-V5-15] eliminates Next.js LCP/scroll warnings, Blogger 2MB unstable_cache overflow, and desktop input font shrinking across all form controls', () => {
    const layoutSrc = readSrc('app/layout.tsx');
    expect(layoutSrc).toContain('data-scroll-behavior="smooth"');

    const navSrc = readSrc('components/navigation.tsx');
    expect(navSrc).toContain('loading="eager"');

    const revealSrc = readSrc('components/motion/reveal.tsx');
    expect(revealSrc).toContain('loading="eager"');
    expect(revealSrc).toContain('preload');
    expect(revealSrc).not.toMatch(/\bpriority\b/);

    const bloggerSrc = readSrc('lib/blogger.ts');
    expect(bloggerSrc).toContain('compactBloggerPostItem');
    expect(bloggerSrc).toContain('MAX_NEXT_CACHE_BYTES');
    expect(bloggerSrc).toContain('blogger-all-posts-v2');

    // Verify no form control anywhere in app/ or components/ shrinks text on desktop via md:text-sm / md:text-xs
    const walkTsx = (dir: string, acc: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkTsx(full, acc);
        else if (entry.name.endsWith('.tsx')) acc.push(full);
      }
      return acc;
    };
    const tsxFiles = [
      ...walkTsx(path.join(ROOT, 'app')),
      ...walkTsx(path.join(ROOT, 'components')),
    ];
    for (const file of tsxFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf8');
      expect(src, `${rel} should not shrink inputs/selects on desktop via md:text-sm or md:text-xs`).not.toMatch(
        /<(?:Input|Textarea|select|SelectTrigger)\b[^>]*\bmd:text-(?:sm|xs)\b/
      );
    }
  });
});
