import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.DISPOSABLE_AUTH_CI, 'true', 'Guarded disposable runner required');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const mailbox = new URL(process.env.DISPOSABLE_MAILBOX_URL);
for (const [url, port] of [[api, '54321'], [mailbox, '54324']]) {
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:' && url.port === port, 'Only local disposable services allowed');
}
const origin = 'http://localhost:3399';
const tools = createRequire(resolve(process.env.BROWSER_TOOLS_DIR, 'package.json'));
const { chromium } = tools('playwright');
const admin = createClient(api.origin, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function safe(result, message) { if (result.error) throw new Error(message); return result.data; }
async function mail(path, options = {}) {
  const url = new URL(path, mailbox.origin);
  if (url.origin !== mailbox.origin) throw new Error('Nonlocal mailbox request refused');
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Disposable mailbox request failed');
  return response;
}
async function matching(email) {
  const body = await (await mail(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=100`)).json();
  if (!Array.isArray(body.messages) || body.total > 100) throw new Error('Unexpected mailbox inventory');
  return body.messages.filter((message) => message.To?.some((recipient) => recipient.Address === email));
}

test('recovery email from disposable SMTP mailbox survives preview and resets once', { timeout: 180000 }, async () => {
  let browser; let server; let userId;
  const contexts = []; const captured = new Set();
  const email = `mail-recovery-${randomBytes(10).toString('hex')}@example.test`;
  const oldPassword = randomBytes(24).toString('base64url');
  const newPassword = randomBytes(24).toString('base64url');
  let phase = 'fixture setup'; let failure = null;
  async function page() {
    const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
    await context.route('**/*', (route) => [origin, api.origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    const result = await context.newPage(); result.setDefaultTimeout(15000); return result;
  }
  try {
    const data = safe(await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true, app_metadata: { role: 'client' } }), 'Mailbox fixture creation failed');
    if (!data.user?.id) throw new Error('Fixture id missing'); userId = data.user.id;
    safe(await admin.from('profiles').update({ role: 'client', is_active: true }).eq('id', userId), 'Fixture profile update failed');
    assert.equal((await matching(email)).length, 0);
    phase = 'start application';
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3399'], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
    let launchFailed = false; server.on('error', () => { launchFailed = true; });
    let ready = false; const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (launchFailed || server.exitCode !== null) throw new Error('Application startup failed');
      try { const r = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) }); await r.text(); if (r.status === 200) { ready = true; break; } } catch { /* readiness only */ }
      await delay(200);
    }
    assert.ok(ready); browser = await chromium.launch({ headless: true });
    phase = 'request real recovery email through browser';
    const requestPage = await page(); await requestPage.goto(`${origin}/login`);
    await requestPage.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await requestPage.locator('#reset-email').fill(email);
    await requestPage.getByRole('button', { name: 'Send reset link', exact: true }).click();
    await requestPage.getByText('If that address has an account, a reset link is on its way.', { exact: true }).waitFor();
    phase = 'receive actual SMTP message';
    const mailDeadline = Date.now() + 30000; let messages = [];
    while (Date.now() < mailDeadline) { messages = await matching(email); if (messages.length) break; await delay(250); }
    if (!messages.length) throw new Error('No matching message');
    phase = 'validate mailbox message count'; assert.equal(messages.length, 1);
    for (const message of messages) captured.add(message.ID);
    phase = 'fetch received message';
    const message = await (await mail(`/api/v1/message/${encodeURIComponent(messages[0].ID)}`)).json();
    phase = 'validate received recipient'; assert.ok(message.To?.some((recipient) => recipient.Address === email));
    // Subject wording is provider-controlled, not the recovery-link acceptance contract.
    phase = 'validate template subject'; assert.ok(typeof message.Subject === 'string' && message.Subject.length > 0);
    phase = 'validate email HTML'; assert.equal(typeof message.HTML, 'string');
    phase = 'extract actual href without reconstructing token';
    const parser = await page();
    const links = await parser.evaluate((html) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a[href]')].map((anchor) => anchor.getAttribute('href')), message.HTML);
    assert.equal(links.length, 1);
    const href = links[0]; const target = new URL(href);
    assert.ok(target.origin === origin && target.pathname === '/reset-password' && !target.username && !target.password && !target.hash, 'Unexpected email destination');
    assert.equal(target.searchParams.get('type'), 'recovery'); assert.ok(target.searchParams.get('token_hash'));
    // This exact received DOM-decoded href is used below; no generateLink or token reconstruction.
    phase = 'HEAD and GET email link previews';
    for (const method of ['HEAD', 'GET']) {
      const response = await fetch(href, { method, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200); await response.text();
    }
    phase = 'JavaScript email preview';
    const preview = await page(); let posts = 0; preview.on('request', (req) => { if (req.method() === 'POST') posts++; });
    await preview.goto(href, { waitUntil: 'networkidle' }); await preview.getByLabel('New password', { exact: true }).waitFor();
    assert.equal(posts, 0); assert.equal((await preview.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-')).length, 0);
    phase = 'human reset using extracted email link';
    const human = await page(); await human.goto(href);
    await human.getByLabel('New password', { exact: true }).fill(newPassword);
    await human.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
    await human.getByRole('button', { name: 'Save new password', exact: true }).click();
    await human.waitForURL((url) => url.pathname === '/portal'); await human.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
    phase = 'password verification';
    const client = createClient(api.origin, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await client.auth.signInWithPassword({ email, password: oldPassword })).error, 'Old password accepted');
    safe(await client.auth.signInWithPassword({ email, password: newPassword }), 'New password rejected'); safe(await client.auth.signOut(), 'Logout failed');
    phase = 'replay email link in a fresh browser';
    const replay = await page(); await replay.goto(href); const attempted = randomBytes(24).toString('base64url');
    await replay.getByLabel('New password', { exact: true }).fill(attempted);
    await replay.getByLabel('Confirm new password', { exact: true }).fill(attempted);
    await replay.getByRole('button', { name: 'Save new password', exact: true }).click();
    await replay.getByText('This link is invalid or has expired. Ask for a new one.', { exact: true }).waitFor();
    console.log('Mailbox email received; extracted href survived HEAD/GET/Chromium preview; password reset succeeded; replay rejected.');
  } catch { failure = `Mailbox recovery test failed at ${phase}; sensitive details withheld`; }
  finally {
    let cleanupFailed = false;
    for (const context of contexts) { try { await context.close(); } catch { cleanupFailed = true; } }
    if (browser) { try { await browser.close(); } catch { cleanupFailed = true; } }
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM'); await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
    try {
      for (const message of await matching(email)) captured.add(message.ID);
      const ids = [...captured];
      if (ids.length) await (await mail('/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }) })).text();
      assert.equal((await matching(email)).length, 0);
      if (userId) {
        safe(await admin.auth.admin.deleteUser(userId), 'Fixture deletion failed');
        const count = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
        safe(count, 'Cleanup count failed'); assert.equal(count.count, 0);
      }
      console.log('Mailbox recovery cleanup: matching messages=0; fixture profiles=0.');
    } catch { cleanupFailed = true; }
    if (cleanupFailed) failure = `${failure ?? 'Mailbox assertions completed'}; fixture cleanup failed (details withheld)`;
  }
  if (failure) throw new Error(failure);
});
