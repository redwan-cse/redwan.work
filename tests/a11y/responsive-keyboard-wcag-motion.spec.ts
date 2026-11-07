import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const RESPONSIVE_VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const RESPONSIVE_ROUTES = ['/', '/services', '/portfolio', '/resume', '/contact', '/blogs', '/login'];
const WCAG_ROUTES = [
  '/',
  '/services',
  '/portfolio',
  '/resume',
  '/contact',
  '/blogs',
  '/privacy',
  '/tos',
  '/login',
];

test.describe('Responsive Layout, Keyboard Navigation, WCAG AA Contrast & Reduced Motion', () => {
  test('[RESPONSIVE-320-1920] renders public and auth routes without horizontal overflow from 320px to 1920px', async ({
    page,
  }) => {
    for (const route of RESPONSIVE_ROUTES) {
      for (const vp of RESPONSIVE_VIEWPORTS) {
        await page.setViewportSize(vp);
        const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(resp?.status(), `HTTP status on ${route} @ ${vp.width}px`).toBe(200);

        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(
          metrics.scrollWidth,
          `Horizontal overflow detected on ${route} at ${vp.width}px (${metrics.scrollWidth} > ${metrics.innerWidth})`
        ).toBeLessThanOrEqual(metrics.innerWidth);
      }
    }
  });

  test('[KEYBOARD-FOCUS] supports skip-to-content link, mobile navigation drawer Escape dismissal, and modal dialog focus/Escape', async ({
    page,
  }) => {
    // 1. Desktop keyboard skip-link jumps focus directly to #main-content
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');

    const activeId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(activeId).toBe('main-content');

    // 2. Mobile navigation drawer opens via keyboard and closes cleanly on Escape
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/services');
    const menuBtn = page.getByRole('button', { name: 'Toggle navigation menu' });
    await menuBtn.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 3. Portfolio case-study modal opens via keyboard and closes on Escape
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/portfolio');
    const caseStudyBtn = page.getByRole('button', { name: /Read Full Case Study/i }).first();
    await expect(caseStudyBtn).toBeVisible();
    await caseStudyBtn.focus();
    await page.keyboard.press('Enter');
    const caseModal = page.getByRole('dialog');
    await expect(caseModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(caseModal).toBeHidden();
  });

  test('[WCAG-AUTOMATED] passes axe-core WCAG 2.0/2.1/2.2 Level A & AA audits across light and dark themes', async ({
    browser,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: 'reduce',
        colorScheme: theme,
      });
      await ctx.addInitScript((selectedTheme) => {
        window.localStorage.setItem('theme', selectedTheme);
      }, theme);
      const page = await ctx.newPage();

      try {
        for (const route of WCAG_ROUTES) {
          await page.goto(route, { waitUntil: 'networkidle' });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

          const summary = results.violations.map(
            (v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.html).join(' | ')}`
          );
          expect(summary, `Axe violations on ${route} (${theme} theme)`).toEqual([]);
        }
      } finally {
        await ctx.close();
      }
    }
  });

  test('[REDUCED-MOTION] honors prefers-reduced-motion across canvas particle field, carousels, and CSS transitions', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await page.goto('/', { waitUntil: 'networkidle' });

      const heroField = page.locator('[data-hero-field]').first();
      await expect(heroField).toHaveAttribute('data-reduced-motion', 'true');

      const carouselSection = page.locator('[data-autoplay]');
      if ((await carouselSection.count()) > 0) {
        await expect(carouselSection.first()).toHaveAttribute('data-autoplay', 'disabled');
      }

      const animDurationMs = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.transition = 'opacity 500ms ease';
        document.body.appendChild(probe);
        const computed = window.getComputedStyle(probe).transitionDuration;
        probe.remove();
        const numeric = parseFloat(computed);
        return computed.endsWith('ms') ? numeric : numeric * 1000;
      });
      expect(animDurationMs).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  });
});
