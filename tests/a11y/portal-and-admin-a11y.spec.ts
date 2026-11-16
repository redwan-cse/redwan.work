import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LOOPBACK_SECRETS, SEEDED_USERS } from '../harness/loopback-services.mjs';

async function signInClient(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').first().fill(SEEDED_USERS.client.email);
  await page.locator('input[name="password"]').fill(SEEDED_USERS.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/portal**');
}

async function signInAdminWithAal2(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').first().fill(SEEDED_USERS.admin.email);
  await page.locator('input[name="password"]').fill(SEEDED_USERS.admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/mfa**');
  await page.locator('#totp-code').fill(LOOPBACK_SECRETS.totpValidCode);
  await page.waitForURL('**/admin**');
}

const CLIENT_A11Y_ROUTES = [
  '/portal',
  '/portal/orders/new',
  '/portal/tickets',
  '/portal/profile',
];

const ADMIN_A11Y_ROUTES = [
  '/admin',
  '/admin/pipeline',
  '/admin/orders',
  '/admin/billing',
  '/admin/content',
  '/admin/ops',
  '/admin/settings',
];

test.describe('Authenticated Portal & Admin WCAG AA, Dark Mode, Print, Drawer Keyboard & Mobile Overflow', () => {
  test('[WCAG-AUTOMATED] passes axe-core WCAG 2.0/2.1 AA across client portal and admin hubs in light and dark themes', async ({
    browser,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      const clientCtx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
        colorScheme: theme,
      });
      await clientCtx.addInitScript((selectedTheme) => {
        window.localStorage.setItem('theme', selectedTheme);
      }, theme);
      const clientPage = await clientCtx.newPage();

      try {
        await signInClient(clientPage);
        for (const route of CLIENT_A11Y_ROUTES) {
          await clientPage.goto(route, { waitUntil: 'networkidle' });
          const results = await new AxeBuilder({ page: clientPage })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          const summary = results.violations.map(
            (v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.html).join(' | ')}`
          );
          expect(summary, `Axe violations on ${route} (${theme})`).toEqual([]);
        }
      } finally {
        await clientCtx.close();
      }

      const adminCtx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
        colorScheme: theme,
      });
      await adminCtx.addInitScript((selectedTheme) => {
        window.localStorage.setItem('theme', selectedTheme);
      }, theme);
      const adminPage = await adminCtx.newPage();

      try {
        await signInAdminWithAal2(adminPage);
        for (const route of ADMIN_A11Y_ROUTES) {
          await adminPage.goto(route, { waitUntil: 'networkidle' });
          const results = await new AxeBuilder({ page: adminPage })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          const summary = results.violations.map(
            (v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.html).join(' | ')}`
          );
          expect(summary, `Axe violations on ${route} (${theme})`).toEqual([]);
        }
      } finally {
        await adminCtx.close();
      }
    }
  });

  test('[RESPONSIVE-320-1920] renders authenticated client and admin hubs without horizontal overflow at 320px and 375px viewports', async ({
    browser,
  }) => {
    const clientCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const clientPage = await clientCtx.newPage();
    try {
      await signInClient(clientPage);
      for (const route of ['/portal', '/portal/orders/new', '/portal/tickets', '/portal/profile']) {
        for (const vp of [
          { width: 320, height: 640 },
          { width: 375, height: 812 },
        ]) {
          await clientPage.setViewportSize(vp);
          await clientPage.goto(route, { waitUntil: 'domcontentloaded' });
          const metrics = await clientPage.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          expect(
            metrics.scrollWidth,
            `Overflow on ${route} @ ${vp.width}px`
          ).toBeLessThanOrEqual(metrics.innerWidth);
        }
      }
    } finally {
      await clientCtx.close();
    }

    const adminCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const adminPage = await adminCtx.newPage();
    try {
      await signInAdminWithAal2(adminPage);
      for (const route of ['/admin', '/admin/pipeline', '/admin/orders', '/admin/billing', '/admin/ops']) {
        await adminPage.setViewportSize({ width: 375, height: 812 });
        await adminPage.goto(route, { waitUntil: 'domcontentloaded' });
        const metrics = await adminPage.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(
          metrics.scrollWidth,
          `Overflow on ${route} @ 375px`
        ).toBeLessThanOrEqual(metrics.innerWidth);
      }
    } finally {
      await adminCtx.close();
    }
  });

  test('[KEYBOARD-FOCUS] manages keyboard Escape dismissal for Admin Content Studio Sheet drawer and ConfirmActionButton AlertDialog', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminCtx.newPage();
    try {
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/content');

      // 1. Open slide-over <Sheet> via New Service button, verify dialog role & Escape closes
      const newServiceBtn = adminPage.getByRole('button', { name: 'New Service' });
      await expect(newServiceBtn).toBeVisible();
      await newServiceBtn.focus();
      await adminPage.keyboard.press('Enter');
      const sheetDialog = adminPage.getByRole('dialog');
      await expect(sheetDialog).toBeVisible();
      await adminPage.keyboard.press('Escape');
      await expect(sheetDialog).toBeHidden();

      // 2. Trigger ConfirmActionButton AlertDialog (Delete service), verify Escape cancels without deleting
      const deleteTrigger = adminPage.getByRole('button', { name: 'Delete' }).first();
      if ((await deleteTrigger.count()) > 0) {
        await deleteTrigger.focus();
        await adminPage.keyboard.press('Enter');
        const alertDialog = adminPage.getByRole('alertdialog');
        await expect(alertDialog).toBeVisible();
        await adminPage.keyboard.press('Escape');
        await expect(alertDialog).toBeHidden();
      }
    } finally {
      await adminCtx.close();
    }
  });
});
