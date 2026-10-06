import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, appendFileSync, readdirSync, realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';

const phases = ['startup', 'environment', 'dependencies', 'fixture_config', 'container', 'provider_version', 'jwks',
  'native_field', 'credential_denial', 'identity_binding', 'verifier_isolation', 'original_continuity',
  'other_revocation', 'recovery_exception', 'failure_outcomes', 'residual_jwt', 'cleanup'];
const resultPath = resolve(process.env.RUNNER_TEMP, 'password-provider-result.json');
let result = {passed: 0, expected: 10, phase: 'environment', cleanup: false, complete: false};
const metadata = {};
function command(name, args) {
  const r = spawnSync(name, args, {encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    env: Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]))});
  assert.equal(r.status, 0);
  return r.stdout;
}
function localOrigin(value, port) {
  const u = new URL(value);
  assert.equal(u.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(u.hostname));
  assert.equal(u.port, port);
  assert.equal(u.href, u.origin + '/');
  return u.origin;
}
async function json(url, headers = {}) {
  const r = await fetch(url, {headers, redirect: 'error', signal: AbortSignal.timeout(10000)});
  assert.equal(r.status, 200);
  return r.json();
}
try {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.version, 'v22.23.1');
  assert.ok(!readdirSync('.').some(f => f === '.env' || (f.startsWith('.env.') && !f.endsWith('.example'))));
  const temp = realpathSync(process.env.RUNNER_TEMP);
  assert.equal(realpathSync(process.env.AUTH_STATUS_FILE), resolve(temp, 'auth-status.json'));
  assert.equal(realpathSync(dirname(resultPath)), temp);
  const status = JSON.parse(readFileSync(process.env.AUTH_STATUS_FILE, 'utf8'));
  const api = localOrigin(status.API_URL, '54321');
  const mailbox = localOrigin(status.MAILPIT_URL ?? status.INBUCKET_URL, '54324');
  assert.ok(status.PUBLISHABLE_KEY.startsWith('sb_publishable_'));
  assert.ok(status.SECRET_KEY.startsWith('sb_secret_'));
  metadata.checkout = command('git', ['rev-parse', 'HEAD']).trim();
  assert.match(metadata.checkout, /^[0-9a-f]{40}$/);
  metadata.head = process.env.PASSWORD_PROOF_HEAD;
  assert.match(metadata.head, /^[0-9a-f]{40}$/);
  result.phase = 'dependencies';
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  metadata.sdk = {};
  for (const [name, expected] of [['@supabase/supabase-js', '2.112.3'], ['@supabase/auth-js', '2.112.3'], ['@supabase/ssr', '0.12.4']]) {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;
    assert.equal(installed, expected);
    assert.equal(lock.packages[`node_modules/${name}`].version, expected);
    metadata.sdk[name] = expected;
  }
  result.phase = 'fixture_config';
  assert.equal(command(resolve(temp, 'auth-cli/supabase'), ['--version']).trim(), '2.116.0');
  command('python3', ['-c', 'import pathlib,sys,tomllib; p=pathlib.Path(sys.argv[1]); c=tomllib.loads(p.read_text()); assert c["project_id"]=="redwan-auth-ci"; assert c["auth"]["site_url"]=="http://localhost:3399"; assert c["auth"]["jwt_expiry"]==120',
    resolve(temp, 'redwan-auth-ci/supabase/config.toml')]);
  result.phase = 'container';
  const containers = command('docker', ['ps', '--format', '{{.Names}}']).trim().split('\n');
  assert.equal(containers.filter(n => n === 'supabase_auth_redwan-auth-ci').length, 1);
  const inspected = JSON.parse(command('docker', ['inspect', 'supabase_auth_redwan-auth-ci']));
  assert.equal(inspected.length, 1);
  const container = inspected[0];
  assert.equal(container.Name, '/supabase_auth_redwan-auth-ci');
  assert.equal(container.State.Running, true);
  assert.match(container.Config.Image, /^(?:public\.ecr\.aws\/)?supabase\/gotrue:v2\.196\.0$/);
  assert.match(container.Image, /^sha256:[0-9a-f]{64}$/);
  metadata.imageId = container.Image;
  const image = JSON.parse(command('docker', ['image', 'inspect', container.Image]))[0];
  assert.ok(image.RepoDigests?.length);
  metadata.imageDigests = image.RepoDigests;
  for (const digest of metadata.imageDigests) assert.match(digest, /^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/);
  const env = Object.fromEntries(container.Config.Env.map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
  metadata.flags = {};
  for (const key of ['GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD', 'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION', 'GOTRUE_SESSIONS_SINGLE_PER_USER', 'GOTRUE_SECURITY_CAPTCHA_ENABLED']) {
    const value = env[key] ?? 'absent';
    assert.ok(['true', 'false', 'absent', ''].includes(value));
    metadata.flags[key] = value || 'absent';
  }
  assert.notEqual(metadata.flags.GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD, 'true');
  assert.notEqual(metadata.flags.GOTRUE_SESSIONS_SINGLE_PER_USER, 'true');
  assert.notEqual(metadata.flags.GOTRUE_SECURITY_CAPTCHA_ENABLED, 'true');
  assert.equal(env.GOTRUE_JWT_EXP, '120');
  result.phase = 'provider_version';
  const health = await json(api + '/auth/v1/health', {apikey: status.PUBLISHABLE_KEY});
  assert.equal(health.version, 'v2.196.0');
  metadata.auth = health.version;
  result.phase = 'jwks';
  const jwks = await json(api + '/auth/v1/.well-known/jwks.json');
  assert.ok(Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.every(k => ['EC', 'RSA'].includes(k.kty)));
  const envChild = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(envChild, {DISPOSABLE_PASSWORD_PROOF: 'true', NEXT_PUBLIC_SUPABASE_URL: api,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: status.SECRET_KEY,
    DISPOSABLE_MAILBOX_URL: mailbox, PASSWORD_PROOF_RESULT: resultPath});
  // Overwrite any stale receipt BEFORE the child; credentials never go on the command line.
  result.phase = 'startup';
  writeFileSync(resultPath, JSON.stringify(result), {mode: 0o600});
  const child = spawnSync(process.execPath, ['tests/reliability/password-provider.acceptance.mjs'], {
    env: envChild, encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024,
  });
  const measured = JSON.parse(readFileSync(resultPath, 'utf8'));
  assert.ok(phases.includes(measured.phase));
  assert.ok(Number.isInteger(measured.passed) && measured.passed >= 0 && measured.passed <= 10);
  assert.equal(measured.expected, 10);
  assert.equal(typeof measured.cleanup, 'boolean');
  assert.equal(typeof measured.complete, 'boolean');
  result = {passed: measured.passed, expected: 10, phase: measured.phase, cleanup: measured.cleanup,
    complete: child.status === 0 && measured.complete && measured.cleanup && measured.passed === 10};
} catch {
  result.complete = false;
} finally {
  writeFileSync(resultPath, JSON.stringify({...result, metadata}), {mode: 0o600});
  console.log(`Password provider proof: ${result.passed}/10; phase=${result.phase}; cleanup=${result.cleanup}; complete=${result.complete}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Disposable P1-C provider proof\n\n```json\n' +
      JSON.stringify({...result, metadata}, null, 2) + '\n```\n');
  }
}
process.exitCode = result.complete ? 0 : 1;
