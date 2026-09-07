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
const mailbox = new URL(status.MAILPIT_URL ?? status.INBUCKET_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(mailbox.hostname) && mailbox.protocol === 'http:' && mailbox.port === '54324', 'Disposable local mailbox required');
assert.ok(typeof status.PUBLISHABLE_KEY === 'string' && status.PUBLISHABLE_KEY.startsWith('sb_publishable_'), 'New publishable key required');
assert.ok(typeof status.SECRET_KEY === 'string' && status.SECRET_KEY.startsWith('sb_secret_'), 'New secret key required');
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SystemRoot', 'BROWSER_TOOLS_DIR', 'CI'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: 'http://localhost:3399',
  NEXT_PUBLIC_SUPABASE_URL: api.origin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  LEAD_IP_HASH_SALT: randomBytes(32).toString('hex'),
  DISPOSABLE_AUTH_CI: 'true', DISPOSABLE_MAILBOX_URL: mailbox.origin,
});
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (build.status !== 0) { console.log('::error::Disposable Auth configured build failed; raw output withheld.'); process.exit(1); }
console.log('Disposable Auth build passed; local publishable/secret key and mailbox presence validated.');
const phases = ['fixture setup', 'start application', 'request real recovery email through browser', 'receive actual SMTP message', 'validate mailbox message count', 'fetch received message', 'validate received recipient', 'validate template subject', 'validate email HTML', 'extract actual href without reconstructing token', 'HEAD and GET email link previews', 'JavaScript email preview', 'human reset using extracted email link', 'password verification', 'replay email link in a fresh browser'];
for (const file of ['tests/auth/authenticated.test.mjs', 'tests/auth/recovery-previews.test.mjs', 'tests/auth/mailbox-recovery.test.mjs']) {
  const result = spawnSync(process.execPath, ['--test', file], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  console.log(`Suite: ${file}`);
  for (const line of output.split('\n')) if (/^# (tests|pass|fail|cancelled|skipped) \d+$/.test(line)) console.log(line);
  if (result.status !== 0) {
    const phase = phases.find((value) => output.includes(`Mailbox recovery test failed at ${value};`));
    console.log(`::error::Disposable suite failed: ${file}${phase ? `; phase=${phase}` : ''}`);
    if (output.includes('fixture cleanup failed (details withheld)')) console.log('::error::Mailbox fixture cleanup failed.');
    process.exit(result.status ?? 1);
  }
}
