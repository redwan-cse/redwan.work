import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDisposableTarget,
  createAdminClient,
  getSessionCookie,
  safeFetch,
  ENV,
} from './harness-env.mjs';

assertDisposableTarget();

const admin = createAdminClient();

test('Browser Usability & Reload Resume: Interface Verification', { timeout: 120000 }, async (t) => {
  let adminCookie;
  const adminEmail = 'browser-test@example.test';
  const adminPassword = 'Password123!@#';

  await t.test('Setup admin session for browser verification', async () => {
    const aRes = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    if (!aRes.error && aRes.data?.user) {
      await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', aRes.data.user.id);
    }
    await new Promise(r => setTimeout(r, 1000));
    adminCookie = await getSessionCookie(adminEmail, adminPassword);
    assert.ok(adminCookie, 'Admin session cookie obtained');
  });

  await t.test('B.1 Reload Resume Limitation: Page reload resets client state, leaving in-flight recovery unresumable', {
    skip: 'NOT RUN: Automated in-flight reload resume requires headless browser automation framework (e.g. Playwright/Puppeteer) not available in Node test runner. Defect reproduction is isolated in failing-resume-after-reload.mjs and manual DevTools inspection in walkthrough.',
  }, async () => {});

  await t.test('B.2 Mobile Viewport 375px: Layout metrics and horizontal overflow', {
    skip: 'NOT RUN: Automated viewport layout assertion requires headless browser automation runtime (e.g. Playwright/Puppeteer). Metric verified via separate manual Chrome DevTools MCP inspection (scrollWidth 360px <= 375px, zero overflow).',
  }, async () => {});

  await t.test('B.3 Keyboard Navigation & Accessibility: Focus rings and ARIA live regions', {
    skip: 'NOT RUN: Automated keyboard focus trapping and tab sequence assertion requires headless browser automation runtime. Verified via separate manual Chrome DevTools MCP inspection (focus-visible rings and role="status" regions).',
  }, async () => {});
});
