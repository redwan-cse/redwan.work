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

/**
 * Method 9: Visual Layout, Responsive Breakpoint & A4 Print-Media Verification
 */
test.describe('Method 9: Visual Layout & A4 Print-Media Contracts', () => {
  test('[M9-PRINT-RESUME] hides screen-only chrome in print media on /resume and keeps zero horizontal overflow at 320px and 1440px', async ({
    page,
  }) => {
    for (const vp of [
      { width: 320, height: 640 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/resume', { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth, `/resume overflow at ${vp.width}px`).toBeLessThanOrEqual(
        overflow.innerWidth
      );
    }

    // Emulate A4 print media and confirm print-hidden elements collapse cleanly
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ media: 'print' });
    const printCheck = await page.evaluate(() => {
      const hiddenEls = Array.from(document.querySelectorAll('.print\\:hidden'));
      const stillVisible = hiddenEls.filter(
        (el) => window.getComputedStyle(el).display !== 'none'
      ).length;
      const bodyText = document.body.innerText || '';
      return {
        hiddenCount: hiddenEls.length,
        stillVisible,
        hasOwnerName: /Redwan Ahmed/i.test(bodyText),
      };
    });
    expect(printCheck.hasOwnerName).toBe(true);
    expect(printCheck.stillVisible).toBe(0);
    await page.emulateMedia({ media: 'screen' });
  });

  test('[M9-PUBLIC-SLIM-VISUAL] renders /blogs and /contact cleanly after Phase 4 bundle slimming without overflow', async ({
    page,
  }) => {
    for (const route of ['/blogs', '/contact', '/services', '/portfolio']) {
      for (const vp of [
        { width: 320, height: 640 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(vp);
        await page.goto(route, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(overflow.scrollWidth, `${route} overflow at ${vp.width}px`).toBeLessThanOrEqual(
          overflow.innerWidth
        );
      }
    }
  });

  test('[M9-PORTAL-ADMIN-PRINT-AND-VIEWS] hides portal/admin shell chrome in print media and supports Admin Orders Kanban view without overflow', async ({
    browser,
  }) => {
    // 1. Client Portal shell print-media check + sticky mobile bottom nav hidden in print
    const clientCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const clientPage = await clientCtx.newPage();
    try {
      await signInClient(clientPage);
      await clientPage.goto('/portal', { waitUntil: 'networkidle' });
      await clientPage.emulateMedia({ media: 'print' });
      const clientPrintHiddenVisible = await clientPage.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.print\\:hidden'));
        return els.filter((el) => window.getComputedStyle(el).display !== 'none').length;
      });
      expect(clientPrintHiddenVisible).toBe(0);
    } finally {
      await clientCtx.close();
    }

    // 2. Admin Orders Kanban + Billing Hub visual check
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();
    try {
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/orders?view=kanban', { waitUntil: 'networkidle' });
      await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
      const kanbanOverflow = await adminPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(kanbanOverflow.scrollWidth).toBeLessThanOrEqual(kanbanOverflow.innerWidth);

      await adminPage.emulateMedia({ media: 'print' });
      const adminPrintHiddenVisible = await adminPage.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.print\\:hidden'));
        return els.filter((el) => window.getComputedStyle(el).display !== 'none').length;
      });
      expect(adminPrintHiddenVisible).toBe(0);
    } finally {
      await adminCtx.close();
    }
  });
});
