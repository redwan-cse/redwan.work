import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  assert.equal(existsSync(file), false, `Refusing authenticated test with ${file} present`);
}
const status = JSON.parse(readFileSync(process.env.AUTH_STATUS_FILE, 'utf8'));
const api = new URL(status.API_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(api.hostname) && api.protocol === 'http:', 'Local API required');
assert.equal(api.port, '54321', 'Unexpected disposable API port');
assert.ok(typeof status.PUBLISHABLE_KEY === 'string' && status.PUBLISHABLE_KEY.startsWith('sb_publishable_'), 'New publishable key required');
assert.ok(typeof status.SECRET_KEY === 'string' && status.SECRET_KEY.startsWith('sb_secret_'), 'New secret key required');
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot', 'BROWSER_TOOLS_DIR', 'CI'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: 'http://localhost:3399',
  NEXT_PUBLIC_SUPABASE_URL: api.origin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  LEAD_IP_HASH_SALT: randomBytes(32).toString('hex'),
  DISPOSABLE_AUTH_CI: 'true',
});
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
assert.equal(build.status, 0, 'Build with disposable Auth configuration failed (raw output withheld)');
console.log('Disposable Auth build passed; local publishable/secret key presence validated.');
// Sequential processes avoid sharing the app port or browser/SDK globals.
for (const file of ['tests/auth/authenticated.test.mjs', 'tests/auth/recovery-previews.test.mjs']) {
  const result = spawnSync(process.execPath, ['--test', file], { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
