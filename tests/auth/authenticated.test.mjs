import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.DISPOSABLE_AUTH_CI, 'true', 'Use the guarded local runner');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(api.hostname) && api.port === '54321' && api.protocol === 'http:', 'Only disposable local Auth allowed');
const origin = 'http://localhost:3399';
const tools = createRequire(resolve(process.env.BROWSER_TOOLS_DIR, 'package.json'));
const { chromium } = tools('playwright');
const admin = createClient(api.origin, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function ok(result, message) { assert.ok(!result.error, message); return result.data; }

test('real Supabase Auth, Postgres and Chromium', { timeout: 240000 }, async (t) => {
  const users = [];
  const contexts = [];
  let browser;
  let server;
  async function profile(id, patch) {
    ok(await admin.from('profiles').update(patch).eq('id', id), 'Fixture profile update failed');
    const data = ok(await admin.from('profiles').select('role,is_active').eq('id', id).single(), 'Fixture profile read failed');
    for (const [key, value] of Object.entries(patch)) assert.equal(data[key], value);
  }
  async function user(role) {
    const password = randomBytes(24).toString('base64url');
    const email = `auth-${randomBytes(8).toString('hex')}@example.test`;
    const data = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } }), 'Fixture user creation failed');
    assert.ok(data.user?.id, 'Fixture id absent');
    const fixture = { id: data.user.id, email, password, role }; users.push(fixture);
    await profile(fixture.id, { role, is_active: true });
    return fixture;
  }
  async function signIn(fixture) {
    const context = await browser.newContext(); contexts.push(context);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return [origin, api.origin].includes(url.origin) ? route.continue() : route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.goto(`${origin}/login`);
    await page.locator('#email').fill(fixture.email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => url.pathname === (fixture.role === 'admin' ? '/admin' : '/portal'));
    await page.getByRole('heading', { name: fixture.role === 'admin' ? 'Overview' : 'Dashboard', exact: true }).waitFor({ state: 'visible' });
    return { page, context };
  }
  try {
    // A fresh service must expose all unchanged migrations before testing panels.
    ok(await admin.from('email_log').select('id').limit(1), 'Migration 0016 table unavailable');
    const alice = await user('admin'); const bob = await user('client');
    await t.test('Auth issues asymmetric JWTs verifiable with the local JWKS', async () => {
      const client = createClient(api.origin, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const data = ok(await client.auth.signInWithPassword({ email: bob.email, password: bob.password }), 'SDK password login failed');
      assert.ok(data.session, 'Session absent');
      const token = data.session.access_token;
      const [headerPart, payloadPart, signaturePart] = token.split('.');
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
      assert.equal(header.alg, 'ES256', 'Asymmetric JWT required; no legacy fallback');
      const response = await fetch(`${api.origin}/auth/v1/.well-known/jwks.json`);
      assert.equal(response.status, 200);
      const jwks = await response.json();
      const jwk = jwks.keys.find((key) => key.kid === header.kid);
      assert.ok(jwk && !jwk.d, 'Public verification key absent');
      assert.equal(verify('sha256', Buffer.from(`${headerPart}.${payloadPart}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signaturePart, 'base64url')), true);
      const claims = ok(await client.auth.getClaims(), 'SDK verified claims failed');
      assert.equal(claims.claims.sub, bob.id);
      const refreshed = ok(await client.auth.refreshSession(), 'Real refresh failed');
      assert.ok(refreshed.session && refreshed.session.access_token, 'Refreshed session absent');
      ok(await client.auth.signOut(), 'SDK logout failed');
    });
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3399'], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
    let launchError; server.on('error', (error) => { launchError = error; });
    const deadline = Date.now() + 45000; let ready = false;
    while (Date.now() < deadline) {
      if (launchError) throw new Error('Application launch failed');
      assert.equal(server.exitCode, null, 'Application exited before readiness');
      try { const r = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) }); await r.text(); if (r.status === 200) { ready = true; break; } } catch { /* readiness only */ }
      await delay(200);
    }
    assert.ok(ready, 'Application readiness failed');
    browser = await chromium.launch({ headless: true });
    await t.test('admin login, role routing and browser logout', async () => {
      const { page, context } = await signIn(alice);
      await page.goto(`${origin}/portal`); await page.waitForURL((url) => url.pathname === '/admin');
      const cookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
      assert.ok(cookies.length > 0, 'Auth cookies absent');
      for (const cookie of cookies) { assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Lax'); }
      await page.getByRole('button', { name: 'Sign out', exact: true }).filter({ visible: true }).click();
      await page.waitForURL((url) => url.pathname === '/login');
      await page.goto(`${origin}/admin`); await page.waitForURL((url) => url.pathname === '/login');
    });
    await t.test('client login and wrong-role redirect', async () => {
      const { page } = await signIn(bob);
      await page.goto(`${origin}/admin`); await page.waitForURL((url) => url.pathname === '/portal');
      await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
    });
    await t.test('existing client browser loses panel access after profile deactivation', async () => {
      const { page } = await signIn(bob);
      try {
        await profile(bob.id, { is_active: false });
        await page.goto(`${origin}/portal`); await page.waitForURL((url) => url.pathname === '/login');
        await page.getByText('Your account has been deactivated. Contact the administrator.', { exact: true }).waitFor();
      } finally { await profile(bob.id, { is_active: true }); }
    });
    await t.test('existing admin browser loses panel access when profile authority changes', async () => {
      const { page } = await signIn(alice);
      try {
        await profile(alice.id, { role: 'client' });
        await page.goto(`${origin}/admin`); await page.waitForURL((url) => url.pathname === '/login');
        await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      } finally { await profile(alice.id, { role: 'admin' }); }
    });
  } finally {
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM'); await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
    let failures = 0;
    for (const fixture of users) { const result = await admin.auth.admin.deleteUser(fixture.id); if (result.error) failures++; }
    assert.equal(failures, 0, 'Fixture account cleanup failed');
    if (users.length) {
      const result = await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', users.map((fixture) => fixture.id));
      ok(result, 'Cleanup count query failed'); assert.equal(result.count, 0, 'Fixture profiles remain');
      console.log('Fixture profile cleanup count: 0');
    }
  }
});
