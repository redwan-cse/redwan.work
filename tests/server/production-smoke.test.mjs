import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

// Tests the built app over loopback HTTP, not a proxy/module stub.
// No real identity, database, mailbox, storage or production credentials.
test('production server: credential-free route and header contracts', { timeout: 90000 }, async (t) => {
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    assert.equal(existsSync(file), false, `Refusing server smoke test with ${file} present`);
  }
  assert.ok(existsSync('.next/BUILD_ID'), 'Run npm run build first');
  const port = 3199;
  const origin = `http://127.0.0.1:${port}`;
  // Allowlist process plumbing only; never inherit app credentials.
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: 'https://example.test' });
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: 'ignore' });
  let launchError = null;
  server.on('error', (error) => { launchError = error; });
  async function get(path) {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin, 'Only loopback requests allowed');
    return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  }
  try {
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      assert.equal(server.exitCode, null, 'Next server exited before readiness');
      try { const response = await get('/login'); if (response.status === 200) { await response.text(); ready = true; break; } await response.text(); } catch { /* bounded readiness retry only */ }
      await delay(200);
    }
    assert.ok(ready, 'Next server did not become ready');

    await t.test('public homepage renders with security headers', async () => {
      const response = await get('/');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
      assert.match(response.headers.get('strict-transport-security') ?? '', /includeSubDomains/);
      await response.text();
    });
    for (const path of ['/admin', '/admin/emails?page=2', '/admin/assets', '/portal', '/portal/files', '/portal/invoices']) {
      await t.test(`missing auth configuration denies ${path}`, async () => {
        const response = await get(path);
        assert.equal(response.status, 307);
        const target = new URL(response.headers.get('location'), origin);
        assert.equal(target.origin, origin);
        assert.equal(target.pathname, '/login');
        assert.equal(target.searchParams.get('next'), path);
        await response.text();
      });
    }
    for (const path of ['/login', '/reset-password', '/invite/accept']) {
      await t.test(`auth screen remains reachable: ${path}`, async () => {
        const response = await get(path); assert.equal(response.status, 200);
        assert.match(await response.text(), /<html/);
      });
    }
    await t.test('file download without a session returns generic 401 JSON', async () => {
      const response = await get('/api/files/11111111-1111-4111-8111-111111111111/download');
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Unauthorized' });
    });
    await t.test('unauthenticated retention request cannot execute cleanup', async () => {
      const response = await get('/api/cron/r2-retention');
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'Invalid or missing credentials' });
    });
  } finally {
    if (server.exitCode === null && server.signalCode === null && server.pid) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await Promise.race([exited, delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
  }
});
