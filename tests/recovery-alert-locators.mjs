// Isolated, real-Chromium locator regression. No app server, Auth, DB or storage.
// Execute the actual awaited B/C/E alert expressions from the live acceptance
// source against synthetic DOM alerts, including an open-shadow route announcer.
// This does not establish recovery A-E acceptance or identify AGY's second alert.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const source = fs.readFileSync(new URL('./acceptance/test-browser-resume.mjs', import.meta.url), 'utf8');
const refusal = 'Recovery operation refused. Check the registered backup, current parent and permissions; no backup was discarded.';
const transport = 'Failed to fetch';
const warning = 'This browser cannot save the import ID. Copy the ID below before leaving so you can load it manually.';

function actualWait(letter) {
  const start = source.indexOf(`  await scenario('${letter}:`);
  const end = source.indexOf('  await scenario(', start + 1);
  assert.ok(start >= 0, 'Actual browser scenario required');
  const section = source.slice(start, end < 0 ? source.length : end);
  const matches = [...section.matchAll(/^\s*await (page\.getByRole\('alert'\)[^\r\n]*\.waitFor\(\));\s*$/gm)];
  assert.equal(matches.length, 1, 'Exactly one actual awaited alert expression required');
  // Same source-execution convention as the neighboring browser-evidence test.
  // Do not copy a proposed selector here: the committed acceptance code is tested.
  return new Function('page', `return ${matches[0][1]};`);
}

test('recovery alert selectors: real Chromium strictness and negative controls', { timeout: 30000 }, async t => {
  assert.ok(process.env.BROWSER_TOOLS_DIR, 'Use the existing isolated Playwright tool directory');
  const require = createRequire(path.resolve(process.env.BROWSER_TOOLS_DIR, 'package.json'));
  assert.equal(require('playwright/package.json').version, '1.58.2');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, timeout: 10000 });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort('blockedbyclient'));
  t.after(async () => { await context.close(); await browser.close(); });
  const wait = { B: actualWait('B'), C: actualWait('C'), E: actualWait('E') };

  async function withPage(alerts, work, { announcement = 'Backup recovery' } = {}) {
    const page = await context.newPage();
    try {
      page.setDefaultTimeout(350);
      await page.setContent('<!doctype html><html><body><next-route-announcer></next-route-announcer><main><h1>Backup recovery</h1></main></body></html>');
      await page.evaluate(({ rows, announcement }) => {
        if (announcement !== null) {
          const shadow = document.querySelector('next-route-announcer').attachShadow({ mode: 'open' });
          const alert = document.createElement('p');
          alert.setAttribute('role', 'alert');
          alert.textContent = announcement;
          shadow.append(alert);
        }
        for (const row of rows) {
          const alert = document.createElement('p');
          alert.setAttribute('role', 'alert');
          alert.textContent = row.text;
          if (row.hidden) alert.style.display = 'none';
          document.querySelector('main').append(alert);
        }
      }, { rows: alerts, announcement });
      await work(page);
    } finally {
      await page.close();
    }
  }

  await t.test('C finds the refusal with a second, open-shadow framework alert', async () => {
    await withPage([{ text: refusal }], async page => {
      assert.equal(await page.getByRole('alert').count(), 2);
      await wait.C(page);
    });
  });
  await t.test('C still finds the refusal with both framework and persistence alerts', async () => {
    await withPage([{ text: warning }, { text: refusal }], async page => {
      assert.equal(await page.getByRole('alert').count(), 3);
      await wait.C(page);
    });
  });
  await t.test('C accepts one visible, exact refusal without a framework alert', async () => {
    await withPage([{ text: refusal }], page => wait.C(page), { announcement: null });
  });
  await t.test('C cannot pass using only a framework alert', async () => {
    await withPage([], page => assert.rejects(wait.C(page), { name: 'TimeoutError' }));
  });
  await t.test('C cannot confuse an unauthenticated error with the required refusal', async () => {
    await withPage([{ text: 'Unauthorized.' }], page => assert.rejects(wait.C(page), { name: 'TimeoutError' }), { announcement: null });
  });
  await t.test('C requires the complete refusal, not a truncated or extended message', async () => {
    for (const text of ['Recovery operation refused.', refusal + ' Unexpected detail.']) {
      await withPage([{ text }], page => assert.rejects(wait.C(page), { name: 'TimeoutError' }), { announcement: null });
    }
  });
  await t.test('C requires a visible refusal', async () => {
    await withPage([{ text: refusal, hidden: true }], page => assert.rejects(wait.C(page), { name: 'TimeoutError' }));
  });
  await t.test('C still fails strictness for two genuine refusal alerts', async () => {
    await withPage([{ text: refusal }, { text: refusal }], page => assert.rejects(wait.C(page), /strict mode violation/));
  });
  await t.test('B finds the real transport error rather than the framework alert', async () => {
    await withPage([{ text: transport }], async page => {
      assert.equal(await page.getByRole('alert').count(), 2);
      await wait.B(page);
    });
  });
  await t.test('B matches Chromium native fetch rejection, not an invented transport message', async () => {
    await withPage([], async page => {
      const message = await page.evaluate(async () => {
        try { await fetch('https://transport.invalid/recovery-locator-fixture'); }
        catch (error) { return error.message; }
        throw new Error('The isolated network boundary must refuse this request');
      });
      assert.equal(message, transport);
      await page.evaluate(text => {
        const alert = document.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.textContent = text;
        document.querySelector('main').append(alert);
      }, message);
      await wait.B(page);
    });
  });
  await t.test('B cannot treat the framework alert as completed error rendering', async () => {
    await withPage([], page => assert.rejects(wait.B(page), { name: 'TimeoutError' }));
  });
  await t.test('B still fails strictness for duplicate transport error alerts', async () => {
    await withPage([{ text: transport }, { text: transport }], page => assert.rejects(wait.B(page), /strict mode violation/));
  });
  await t.test('E keeps its existing, distinct persistence-warning assertion', async () => {
    await withPage([{ text: warning }, { text: refusal }], page => wait.E(page));
  });
});
