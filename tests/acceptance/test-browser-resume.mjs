// Actual built Chromium + HTTP + Auth + PostgreSQL + object storage acceptance.
// No mocked responses, header rewriting or source mutation. Missing runtime fails.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import { prepareResumeFixture } from './failing-resume-after-reload.mjs';
import { assertEnvironmentVerified, getSessionCookie, safeFetch, ENV } from './harness-env.mjs';

test('Recovery browser A-E: saved checkpoint, lost response, authority, expiry and usability', { timeout: 300000 }, async t => {
  const session = assertEnvironmentVerified();
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  const require = createRequire('/opt/browser/package.json');
  assert.equal(require('playwright-core/package.json').version, '1.58.2');
  const { chromium } = require('playwright-core');
  assert.ok(fs.existsSync(chromium.executablePath()), 'Prepared Chromium required');
  const f = await prepareResumeFixture(t);
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  t.after(() => browser.close());
  const allowed = [ENV.APP_URL, ENV.SUPABASE_URL, ENV.R2_ENDPOINT].map(url => new URL(url).origin);
  const cookies = raw => raw.split('; ').map(part => {
    const at = part.indexOf('=');
    return { name: part.slice(0, at), value: part.slice(at + 1), url: ENV.APP_URL };
  });
  const contexts = [];
  t.after(async () => { for (const c of contexts) await c.close(); });
  async function newPage({ cookie = f.adminCookie, disabledStorage = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
    contexts.push(context);
    context.setDefaultTimeout(15000);
    await context.route('**/*', route => allowed.includes(new URL(route.request().url()).origin) ? route.continue() : route.abort('blockedbyclient'));
    await context.addCookies(cookies(cookie));
    if (disabledStorage) await context.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Synthetic storage disabled', 'SecurityError'); } });
    });
    const page = await context.newPage();
    await page.goto(`${ENV.APP_URL}/admin/recovery`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Backup recovery', exact: true }).waitFor();
    await page.waitForFunction(() => {
      const el = document.getElementById('recovery-import-id');
      return el instanceof HTMLInputElement && !el.disabled;
    });
    return page;
  }
  const status = async id => {
    const response = await safeFetch(`/api/recovery?importId=${id}`, { headers: { cookie: f.adminCookie } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const row = async id => {
    const read = await f.admin.from('recovery_imports').select('result,completed_files,created_at').eq('id', id).single();
    assert.ok(!read.error && read.data);
    return read.data;
  };
  async function load(page, id) {
    await page.getByLabel('Import ID', { exact: true }).fill(id);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).searchParams.get('importId') === id && response.request().method() === 'GET'),
      page.getByRole('button', { name: 'Load saved import', exact: true }).click(),
    ]);
    await page.waitForFunction(() => {
      const el = document.getElementById('recovery-import-id');
      return el instanceof HTMLInputElement && !el.disabled;
    });
  }
  async function resume(page) {
    const check = page.getByRole('checkbox');
    assert.equal(await check.isChecked(), false, 'Fresh confirmation required');
    assert.equal(await page.getByRole('button', { name: 'Resume restore', exact: true }).isEnabled(), false);
    await check.check();
    await page.getByRole('button', { name: 'Resume restore', exact: true }).click();
  }
  async function completed(page) {
    await page.getByRole('status').filter({ hasText: 'Restore completed.' }).waitFor();
  }
  const passed = [];
  // Node subtests report failures without necessarily rejecting the awaited call.
  // A failing scenario must stop later mutations and never emit a green summary.
  async function scenario(name, work) {
    let succeeded = false;
    await t.test(name, async () => {
      try { await work(); succeeded = true; passed.push(name); }
      catch { throw Error(`Recovery browser scenario failed: ${name}. Inspect private local evidence; no secrets published.`); }
    });
    assert.ok(succeeded, 'Stop after failed browser scenario');
  }
  await scenario('A: partial checkpoint reload, confirmation, new-tab manual resume and keyboard/mobile', async () => {
    const page = await newPage();
    const writes = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/recovery' && request.method() === 'POST') writes.push(request.postDataJSON());
    });
    await load(page, f.id);
    await page.getByRole('status').filter({ hasText: '1 of 2 files checkpointed' }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('recovery-import-id')), f.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('status').filter({ hasText: '1 of 2 files checkpointed' }).waitFor();
    assert.equal(writes.length, 0, 'Load/reload must not write or restore');
    assert.equal((await row(f.id)).completed_files.length, 1);
    assert.equal((await row(f.id)).result, null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '375px horizontal overflow');
    await page.getByLabel('Import ID', { exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Load saved import');
    const anotherTab = await newPage();
    assert.equal(await anotherTab.evaluate(() => sessionStorage.getItem('recovery-import-id')), null);
    await load(anotherTab, f.id);
    await resume(anotherTab); await completed(anotherTab);
    const result = await f.verifyCompleted(f.id);
    assert.deepEqual((await status(f.id)).result, result);
    await page.reload({ waitUntil: 'domcontentloaded' }); await completed(page);
    assert.equal(writes.length, 0, 'Completed result reload must not repeat POST');
  });
  await scenario('B: committed final response is dropped and recovered by read-only reload', async () => {
    const id = await f.openImport();
    const page = await newPage();
    let dropped = false, commits = 0;
    await page.route('**/api/recovery', async route => {
      const req = route.request();
      if (req.method() !== 'POST' || req.postDataJSON()?.action !== 'restore') return route.continue();
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      const body = await response.json();
      // A final result proves the real commit; the database is checked below.
      if (response.status() === 200 && body.result) {
        commits++; dropped = true;
        await response.dispose(); return route.abort('connectionreset');
      }
      // Do not fulfill a fabricated/intercepted response: abort this pending
      // delivery too, then manually reload and confirm the real checkpoint.
      await response.dispose(); return route.abort('connectionreset');
    });
    await load(page, id);
    // Each transport fault aborts delivery after one real request. Resume from
    // the server checkpoint until the third request commits, bounded by 2 files.
    for (let attempt = 0; attempt < 3; attempt++) {
      await resume(page);
      await page.getByRole('alert').waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (dropped) break;
      await page.getByRole('status').filter({ hasText: 'files checkpointed' }).waitFor();
    }
    assert.equal(dropped, true); assert.equal(commits, 1);
    await completed(page);
    const result = await f.verifyCompleted(id);
    assert.deepEqual((await status(id)).result, result);
    await page.reload({ waitUntil: 'domcontentloaded' }); await completed(page);
    assert.equal(commits, 1, 'Reload did not resubmit final commit');
  });
  await scenario('C: cross-admin read refusal preserves the owner checkpoint', async () => {
    const id = await f.openImport();
    const email = `cross-admin-${randomUUID()}@example.test`;
    const password = `Synthetic!${randomBytes(24).toString('hex')}`;
    const user = await f.admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'admin' } });
    assert.ok(!user.error && user.data?.user?.id);
    f.tracker.trackUser(user.data.user.id);
    const update = await f.admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', user.data.user.id).select('id').single();
    assert.ok(!update.error && update.data);
    // Profile promotion invalidates tokens issued before its next-second cutoff.
    const cutoff = await f.admin.from('profiles').select('tokens_valid_after').eq('id', user.data.user.id).single();
    assert.ok(!cutoff.error && cutoff.data);
    const wait = Math.max(0, Number(cutoff.data.tokens_valid_after) * 1000 - Date.now() + 100);
    assert.ok(wait < 3000, 'Unexpected fixture clock skew');
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const page = await newPage({ cookie: await getSessionCookie(email, password) });
    const before = await row(id);
    await load(page, id);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Resume restore', exact: true }).count(), 0);
    assert.deepEqual(await row(id), before);
  });
  await scenario('D: unsealed validation and expired unfinished import refuse automatic restore', async () => {
    const id = await f.openImport({ preview: false });
    const page = await newPage();
    await load(page, id);
    assert.equal((await status(id)).state, 'uploading');
    await page.getByRole('button', { name: 'Check uploaded ZIP', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '0 of 2 files checkpointed' }).waitFor();
    assert.equal((await status(id)).state, 'ready');
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    const denied = await safeFetch(`${ENV.SUPABASE_URL}/rest/v1/rpc/acceptance_expire_recovery_import`, {
      method: 'POST', headers: { apikey: session.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_actor: f.adminUser, p_id: id }),
    });
    assert.ok([401, 403].includes(denied.status), 'Anonymous caller must not age fixtures');
    await denied.body?.cancel();
    const foreign = await f.admin.rpc('acceptance_expire_recovery_import', { p_actor: f.clientUser, p_id: id });
    assert.ok(!foreign.error && foreign.data === false, 'Actor mismatch must not mutate');
    const direct = await f.admin.from('recovery_imports').update({ created_at: new Date(Date.now() - 90000000).toISOString() }).eq('id', id);
    assert.ok(direct.error, 'Direct service-role table writes must remain denied');
    // Bootstrap-only RPC ages one owned synthetic import. Production migration
    // permissions remain unchanged; direct service-role UPDATE stays denied.
    const expired = await f.admin.rpc('acceptance_expire_recovery_import', { p_actor: f.adminUser, p_id: id });
    assert.ok(!expired.error && expired.data === true);
    const again = await f.admin.rpc('acceptance_expire_recovery_import', { p_actor: f.adminUser, p_id: id });
    assert.ok(!again.error && again.data === false, 'Expiry fixture control is single-transition');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('status').filter({ hasText: 'unfinished import expired' }).waitFor();
    assert.equal((await status(id)).state, 'expired');
    assert.equal((await row(id)).result, null);
    assert.equal(await page.getByRole('button', { name: 'Resume restore', exact: true }).count(), 0);
  });
  await scenario('E: storage-disabled manual recovery and forget-reference semantics', async () => {
    const id = await f.openImport();
    const page = await newPage({ disabledStorage: true });
    await load(page, id);
    await page.getByRole('alert').filter({ hasText: 'Copy the ID below' }).waitFor();
    await resume(page); await completed(page);
    await f.verifyCompleted(id);
    const normal = await newPage();
    await load(normal, id); await completed(normal);
    const before = await row(id);
    await normal.getByRole('button', { name: 'Forget browser reference', exact: true }).click();
    assert.equal(await normal.evaluate(() => sessionStorage.getItem('recovery-import-id')), null);
    assert.deepEqual(await row(id), before);
    await load(normal, id); await completed(normal);
  });
  fs.writeFileSync('/tmp/recovery-browser-evidence.json', JSON.stringify({
    candidate: session.candidate, runId: session.runId, state: 'passed', scenarios: passed,
    scope: 'disposable Chromium recovery assertions only; not release acceptance',
    fixturePolicy: 'retained-in-owned-run-pending-explicit-disposal'
  }, null, 2), { mode: 0o600 });
});
