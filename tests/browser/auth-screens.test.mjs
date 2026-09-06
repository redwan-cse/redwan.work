import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

// Browser tooling lives outside the app dependency tree and never ships with it.
assert.ok(process.env.BROWSER_TOOLS_DIR, 'BROWSER_TOOLS_DIR must identify the isolated Playwright installation');
const tools = createRequire(resolve(process.env.BROWSER_TOOLS_DIR, 'package.json'));
const { chromium } = tools('playwright');

test('built application in real Chromium: unauthenticated acceptance', { timeout: 180000 }, async (t) => {
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    assert.equal(existsSync(file), false, `Refusing browser test with ${file} present`);
  }
  assert.ok(existsSync('.next/BUILD_ID'), 'Build the application first');
  const origin = 'http://127.0.0.1:3299';
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: 'https://example.test' });
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3299'], { env, stdio: 'ignore' });
  let launchError = null;
  server.on('error', (error) => { launchError = error; });
  let browser;
  try {
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      assert.equal(server.exitCode, null, 'Server exited before readiness');
      try {
        const response = await fetch(`${origin}/login`, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
        await response.text();
        if (response.status === 200) { ready = true; break; }
      } catch { /* bounded readiness polling, not test retries */ }
      await delay(200);
    }
    assert.ok(ready, 'Next server failed readiness');
    browser = await chromium.launch({ headless: true });
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      await t.test(`${name}: redirect, hydrated forms, keyboard and validation`, async () => {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        // Third-party browser requests cannot leave the runner. App JS stays real.
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          return url.origin === origin ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        const posts = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (req) => { if (req.method() === 'POST') posts.push(req.url()); });
        try {
          for (const path of ['/admin/emails?page=2', '/portal/files']) {
            await page.goto(`${origin}${path}`);
            await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('next') === path);
            await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'visible' });
            // A successful UI transition proves the real React app hydrated.
            await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
            await page.getByRole('button', { name: 'Send reset link', exact: true }).waitFor({ state: 'visible' });
            await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
            await page.getByLabel('Password', { exact: true }).waitFor({ state: 'visible' });
            assert.equal(await page.locator('input[name="next"]').inputValue(), path);
          }
          const email = page.locator('#email');
          const password = page.getByLabel('Password', { exact: true });
          await email.focus(); await page.keyboard.press('Tab');
          assert.equal(await password.evaluate((element) => element === document.activeElement), true);
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          assert.equal(await email.evaluate((element) => element.validity.valueMissing), true);
          await email.fill('invalid-address'); await password.fill('synthetic-browser-fixture');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          assert.equal(await email.evaluate((element) => element.validity.typeMismatch), true);
          assert.equal(posts.length, 0, 'Invalid form must not call the auth action');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Login must not overflow horizontally');

          await page.goto(`${origin}/reset-password`);
          await page.getByText('Invalid link', { exact: true }).waitFor({ state: 'visible' });
          assert.equal(await page.locator('input[name="password"]').count(), 0);
          await page.goto(`${origin}/invite/accept`);
          await page.getByText('Invalid invitation', { exact: true }).waitFor({ state: 'visible' });
          assert.equal(await page.locator('input[name="password"]').count(), 0);
          assert.deepEqual(errors, [], 'No uncaught browser/hydration exceptions');
        } finally { await context.close(); }
      });
    }
  } finally {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM');
      await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
  }
});
