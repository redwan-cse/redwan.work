import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.DISPOSABLE_AUTH_CI, 'true', 'Guarded disposable runner required');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(api.hostname) && api.protocol === 'http:' && api.port === '54321', 'Local Auth only');
const origin = 'http://localhost:3399';
const tools = createRequire(resolve(process.env.BROWSER_TOOLS_DIR, 'package.json'));
const { chromium } = tools('playwright');
const admin = createClient(api.origin, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = () => createClient(api.origin, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
function safe(result, message) { if (result.error) throw new Error(message); return result.data; }

// No URLs, tokens, passwords, response bodies, screenshots or traces are logged.
test('recovery links and preview consumption with real Auth', { timeout: 240000 }, async (t) => {
  const ids = [];
  let browser;
  let server;
  async function fresh() {
    const email = `preview-${randomBytes(10).toString('hex')}@example.test`;
    const data = safe(await admin.auth.admin.createUser({ email, password: randomBytes(24).toString('base64url'), email_confirm: true, app_metadata: { role: 'client' } }), 'Preview fixture creation failed');
    if (!data.user?.id) throw new Error('Preview fixture id missing');
    ids.push(data.user.id);
    safe(await admin.from('profiles').update({ role: 'client', is_active: true }).eq('id', data.user.id), 'Preview profile setup failed');
    const link = safe(await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${origin}/reset-password` } }), 'Recovery token generation failed');
    if (!link.properties?.hashed_token || !link.properties?.action_link) throw new Error('Recovery link properties absent');
    const raw = new URL(link.properties.action_link);
    if (raw.origin !== api.origin || raw.pathname !== '/auth/v1/verify') throw new Error('Refusing non-local verification link');
    const landing = new URL('/reset-password', origin);
    landing.searchParams.set('token_hash', link.properties.hashed_token);
    landing.searchParams.set('type', 'recovery');
    return { email, id: data.user.id, hash: link.properties.hashed_token, landing: landing.href, raw: raw.href };
  }
  async function context() {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return [origin, api.origin].includes(url.origin) ? route.continue() : route.abort();
    });
    return ctx;
  }
  async function consumeOnce(fixture) {
    const verifier = client();
    const data = safe(await verifier.auth.verifyOtp({ type: 'recovery', token_hash: fixture.hash }), 'Preview consumed a token before intentional verification');
    if (data.user?.id !== fixture.id || !data.session) throw new Error('Recovery session identity mismatch');
    const replay = await client().auth.verifyOtp({ type: 'recovery', token_hash: fixture.hash });
    if (!replay.error) throw new Error('Recovery token accepted twice');
    safe(await verifier.auth.signOut(), 'Recovery verifier logout failed');
  }
  try {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3399'], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
    let launchFailed = false; server.on('error', () => { launchFailed = true; });
    const deadline = Date.now() + 45000; let ready = false;
    while (Date.now() < deadline) {
      if (launchFailed || server.exitCode !== null) throw new Error('Preview test server failed to start');
      try { const r = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) }); await r.text(); if (r.status === 200) { ready = true; break; } } catch { /* bounded readiness only */ }
      await delay(200);
    }
    assert.ok(ready, 'Preview test server readiness failed');
    browser = await chromium.launch({ headless: true });
    for (const method of ['HEAD', 'GET']) {
      await t.test(`app recovery landing survives repeated ${method} previews`, async () => {
        let phase = 'fixture';
        try {
          const fixture = await fresh();
          phase = 'preview fetch';
          for (let i = 0; i < 2; i++) {
            const response = await fetch(fixture.landing, { method, redirect: 'manual', headers: { 'User-Agent': 'SyntheticEmailPreview/1.0' }, signal: AbortSignal.timeout(10000) });
            assert.equal(response.status, 200, 'Recovery landing must render without verification redirect');
            await response.text();
          }
          phase = 'verify token survival and one-time use'; await consumeOnce(fixture);
        } catch { throw new Error(`Recovery ${method} preview test failed at ${phase}; sensitive details withheld`); }
      });
    }
    await t.test('JavaScript preview and reload do not redeem the recovery token', async () => {
      let ctx; let phase = 'fixture';
      try {
        const fixture = await fresh(); ctx = await context(); const page = await ctx.newPage(); page.setDefaultTimeout(10000);
        let posts = 0; page.on('request', (request) => { if (request.method() === 'POST') posts++; });
        phase = 'browser preview';
        await page.goto(fixture.landing, { waitUntil: 'networkidle' });
        await page.getByLabel('New password', { exact: true }).waitFor({ state: 'visible' });
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByLabel('New password', { exact: true }).waitFor({ state: 'visible' });
        assert.equal(posts, 0, 'Passive recovery preview must not invoke a verification action');
        assert.equal((await ctx.cookies()).filter((cookie) => cookie.name.startsWith('sb-')).length, 0, 'Passive preview must not establish an auth session');
        phase = 'verify token survival and one-time use'; await consumeOnce(fixture);
      } catch { throw new Error(`JavaScript recovery preview failed at ${phase}; sensitive details withheld`); }
      finally { if (ctx) await ctx.close(); }
    });
    await t.test('a fresh user can reset after a separate preview, and cannot reuse the link', async () => {
      let preview; let human; let replay; let phase = 'fixture';
      try {
        const fixture = await fresh();
        preview = await context(); const previewPage = await preview.newPage();
        phase = 'separate preview'; await previewPage.goto(fixture.landing, { waitUntil: 'networkidle' });
        await preview.close(); preview = null;
        human = await context(); const page = await human.newPage(); page.setDefaultTimeout(15000);
        phase = 'human reset form'; await page.goto(fixture.landing);
        const password = randomBytes(24).toString('base64url');
        await page.getByLabel('New password', { exact: true }).fill(password);
        await page.getByLabel('Confirm new password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Save new password', exact: true }).click();
        await page.waitForURL((url) => url.pathname === '/portal');
        await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
        phase = 'verify new password'; const login = client();
        safe(await login.auth.signInWithPassword({ email: fixture.email, password }), 'Reset password did not take effect');
        safe(await login.auth.signOut(), 'Password-check logout failed');
        phase = 'browser replay'; replay = await context(); const replayPage = await replay.newPage(); replayPage.setDefaultTimeout(10000);
        await replayPage.goto(fixture.landing);
        const another = randomBytes(24).toString('base64url');
        await replayPage.getByLabel('New password', { exact: true }).fill(another);
        await replayPage.getByLabel('Confirm new password', { exact: true }).fill(another);
        await replayPage.getByRole('button', { name: 'Save new password', exact: true }).click();
        await replayPage.getByText('This link is invalid or has expired. Ask for a new one.', { exact: true }).waitFor();
      } catch { throw new Error(`Human recovery after preview failed at ${phase}; sensitive details withheld`); }
      finally { if (preview) await preview.close(); if (human) await human.close(); if (replay) await replay.close(); }
    });
    await t.test('control: GET of the direct Auth verification link consumes its token', async () => {
      let phase = 'fixture';
      try {
        const fixture = await fresh(); phase = 'direct verification GET';
        const response = await fetch(fixture.raw, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
        assert.equal(response.status, 303, 'Direct verification should redirect after redemption');
        const target = new URL(response.headers.get('location'));
        assert.ok(new URLSearchParams(target.hash.slice(1)).has('access_token'), 'Direct verification did not produce a session');
        await response.text();
        phase = 'reuse check'; const again = await client().auth.verifyOtp({ type: 'recovery', token_hash: fixture.hash });
        assert.ok(again.error, 'Direct verification link did not consume its token');
      } catch { throw new Error(`Direct-verification control failed at ${phase}; sensitive details withheld`); }
    });
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM'); await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
    let failed = 0;
    for (const id of ids) if ((await admin.auth.admin.deleteUser(id)).error) failed++;
    assert.equal(failed, 0, 'Preview fixture deletion failed');
    if (ids.length) {
      const result = await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids);
      safe(result, 'Preview cleanup count failed'); assert.equal(result.count, 0, 'Preview fixture profiles remain');
      console.log('Recovery preview fixture profile count after cleanup: 0');
    }
  }
});
