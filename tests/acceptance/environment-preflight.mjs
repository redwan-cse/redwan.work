// Run only inside an owned Phase B runner, after schema/bucket initialization:
// node phase-b.mjs run PRIVATE_STATE node --test tests/acceptance/environment-preflight.mjs
// This is environment readiness, NOT the A-E restore acceptance suite.
// Missing dependencies fail, never skip. Fixtures stay in the exact owned run for approved disposal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { assertEnvironmentVerified, createAdminClient, safeFetch, FixtureTracker } from './harness-env.mjs';
const require = createRequire(import.meta.url);

export function validatePublicJwks(jwks) {
  assert.ok(jwks && Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.length <= 32, 'Public JWKS required');
  const ids = new Set();
  for (const key of jwks.keys) {
    assert.ok(key && ['EC', 'RSA'].includes(key.kty), 'Asymmetric public keys required');
    assert.ok(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(k => k in key), 'Private/symmetric material forbidden');
    assert.ok(typeof key.kid === 'string' && key.kid.length > 0 && !ids.has(key.kid), 'Unique key ID required');
    assert.ok(key.use === undefined || key.use === 'sig', 'Signing key required');
    assert.ok(key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.length === 1 && key.key_ops[0] === 'verify'), 'Public verification operations only');
    assert.ok(key.kty === 'EC' ? key.crv === 'P-256' && (key.alg === undefined || key.alg === 'ES256') : key.alg === undefined || key.alg === 'RS256', 'Unsupported signing algorithm');
    const parsed = createPublicKey({ key, format: 'jwk' });
    if (key.kty === 'RSA') assert.ok(parsed.asymmetricKeyDetails.modulusLength >= 2048, 'RSA key too short');
    ids.add(key.kid);
  }
  return jwks;
}

export function verifySessionJwt(token, jwks, { issuer, subject, now = Math.floor(Date.now() / 1000) }) {
  validatePublicJwks(jwks);
  assert.ok(typeof token === 'string' && token.length < 16384, 'Bounded session JWT required');
  const pieces = token.split('.');
  assert.ok(pieces.length === 3 && pieces.every(p => /^[A-Za-z0-9_-]+$/.test(p)), 'JWT encoding invalid');
  const header = JSON.parse(Buffer.from(pieces[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(pieces[1], 'base64url'));
  assert.ok(['ES256', 'RS256'].includes(header.alg) && !header.crit, 'Asymmetric JWT required');
  const key = jwks.keys.find(k => k.kid === header.kid);
  assert.ok(key && (key.alg === undefined || key.alg === header.alg), 'Unknown signing key');
  assert.equal(key.kty, header.alg === 'ES256' ? 'EC' : 'RSA');
  assert.ok(verify('sha256', Buffer.from(pieces.slice(0, 2).join('.')), {
    key: createPublicKey({ key, format: 'jwk' }), ...(header.alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' } : {})
  }, Buffer.from(pieces[2], 'base64url')), 'JWT signature invalid');
  assert.equal(claims.iss, issuer, 'Unexpected issuer');
  assert.equal(claims.sub, subject, 'Unexpected subject');
  assert.equal(claims.role, 'authenticated', 'User sessions must not carry service authority');
  assert.ok(claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated')), 'Unexpected audience');
  assert.ok(Number.isSafeInteger(claims.exp) && claims.exp > now, 'Expired JWT');
  if (claims.nbf !== undefined) assert.ok(Number.isSafeInteger(claims.nbf) && claims.nbf <= now, 'JWT not active');
  if (claims.iat !== undefined) assert.ok(Number.isSafeInteger(claims.iat) && claims.iat <= now + 30, 'JWT issued in future');
  return claims;
}

// Never print provider bodies, cookies, tokens, signed URLs, private JWKs or fixtures.
export async function probeGateway(env, request = safeFetch) {
  const endpoint = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`;
  for (const headers of [
    {}, { apikey: 'sb_secret_invalid' },
    { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: 'Bearer not-a-jwt' },
    { apikey: 'sb_secret_invalid', authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }
  ]) {
    const response = await request(endpoint, { headers });
    assert.ok([401, 403].includes(response.status), 'Gateway accepted invalid or insufficient authority');
    await response.body?.cancel();
  }
  const response = await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }
  });
  assert.equal(response.status, 200, 'JWKS discovery unavailable');
  return validatePublicJwks(await response.json());
}

export async function establishSyntheticAdminSession(
  { admin, client, id, email, password, jwks, issuer, readCookies },
  { now = Date.now, monotonicNow = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}
) {
  const updated = await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', id).select('id,tokens_valid_after').single();
  assert.ok(!updated.error && updated.data?.id === id, 'Synthetic profile setup failed');
  // Migration0020 advances this cutoff to the next whole second on promotion.
  // Wait for the persisted value, never lower it or retry a stale sign-in.
  const cutoff = updated.data.tokens_valid_after;
  assert.ok(Number.isSafeInteger(cutoff) && cutoff >= 0 && Number.isSafeInteger(cutoff * 1000), 'Synthetic account cutoff invalid');
  const deadline = monotonicNow() + 5000;
  for (;;) {
    const time = now();
    assert.ok(Number.isSafeInteger(time) && time >= 0, 'Synthetic account clock invalid');
    const remaining = cutoff * 1000 - time;
    if (remaining <= 0) break;
    const budget = deadline - monotonicNow();
    assert.ok(remaining <= 5000 && budget > 0, 'Synthetic account cutoff wait exceeded');
    await sleep(Math.min(remaining, budget));
  }
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ok(!signedIn.error && signedIn.data?.session && readCookies().length, 'Synthetic sign-in failed');
  const claims = verifySessionJwt(signedIn.data.session.access_token, jwks, {
    issuer, subject: id, now: Math.floor(now() / 1000)
  });
  assert.ok(Number.isSafeInteger(claims.iat) && claims.iat >= cutoff, 'Synthetic session predates account cutoff');
  const caller = await client.from('profiles').select('id').eq('id', id).single();
  assert.ok(!caller.error && caller.data?.id === id, 'Caller JWT not accepted by PostgREST');
}

export async function probeBrowser(env, cookies, runtime) {
  const browser = await runtime.chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  let context;
  const allowed = [env.APP_URL, env.NEXT_PUBLIC_SUPABASE_URL, env.R2_ENDPOINT].map(v => new URL(v).origin);
  try {
    context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const origin = new URL(route.request().url()).origin;
      return allowed.includes(origin) ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.goto(`${env.APP_URL}/admin/recovery`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/login', 'Anonymous browser was not redirected');
    // The browser constructs Origin. No route interception changes headers or fabricates responses.
    const anonymousStatus = await page.evaluate(async () => (await fetch('/api/recovery', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    })).status);
    assert.equal(anonymousStatus, 401, 'Natural same-origin POST did not reach the Auth boundary');
    const hostile = await safeFetch('/api/recovery', {
      method: 'POST', headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(hostile.status, 403, 'Cross-origin POST was not refused');
    await hostile.body?.cancel();
    await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: env.APP_URL })));
    await page.goto(`${env.APP_URL}/admin/recovery`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/admin/recovery', 'Authenticated browser could not open recovery');
    await page.getByRole('heading', { name: 'Backup recovery', exact: true }).waitFor();
    await page.getByLabel('Import ID', { exact: true }).waitFor();
    const status = await page.evaluate(async () => (await fetch('/api/recovery', { cache: 'no-store' })).status);
    assert.equal(status, 200, 'Authenticated catalog unavailable');
    // Real geometry and real focus, not source-class or ARIA-text assertions.
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile overflow');
    await page.getByLabel('Import ID', { exact: true }).focus();
    await page.keyboard.type('11111111-1111-4111-8111-111111111111');
    assert.equal(await page.getByLabel('Import ID', { exact: true }).inputValue(), '11111111-1111-4111-8111-111111111111');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Load saved import', 'Unexpected keyboard focus');
    return { anonymousOrigin: true, authenticatedCatalog: true, mobileOverflow: false, keyboardEntry: true };
  } finally {
    try { await context?.close(); }
    finally { await browser.close(); }
  }
}

export async function runPreflight() {
  const session = assertEnvironmentVerified();
  const env = session.env;
  let phase = 'browser-runtime';
  const tracker = new FixtureTracker();
  const evidencePath = '/tmp/phase-b-preflight.json';
  const record = result => fs.writeFileSync(evidencePath, JSON.stringify({
    candidate: session.candidate, runId: session.runId, phase, ...result,
    fixtures: tracker.getManifest(), acceptanceAE: 'not-executed'
  }, null, 2), { mode: 0o600 });
  try {
    // Launcher passes an allowlisted environment. Configure this baked-in path before importing.
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const browserRequire = createRequire('/opt/browser/package.json');
    assert.equal(browserRequire('playwright-core/package.json').version, '1.58.2');
    const runtime = browserRequire('playwright-core');
    assert.ok(fs.existsSync(runtime.chromium.executablePath()), 'Prepared Chromium missing');
    phase = 'gateway-negative-authority-and-jwks';
    const jwks = await probeGateway(env);
    phase = 'schema-readiness';
    const admin = createAdminClient();
    const imports = await admin.from('recovery_imports').select('id,completed_files,object_plan').limit(1);
    assert.ok(!imports.error, 'Apply disposable schema through 0040 before preflight');
    phase = 'storage-readiness';
    const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
    for (const kind of ['PRIVATE', 'PUBLIC']) {
      const storage = new S3Client({ endpoint: env.R2_ENDPOINT, region: 'auto', forcePathStyle: true,
        credentials: { accessKeyId: env[`R2_${kind}_ACCESS_KEY_ID`], secretAccessKey: env[`R2_${kind}_SECRET_ACCESS_KEY`] }, maxAttempts: 1 });
      try { await storage.send(new HeadBucketCommand({ Bucket: env[`R2_${kind}_BUCKET`] })); }
      finally { storage.destroy(); }
    }
    phase = 'synthetic-admin-session';
    const email = `preflight-${randomUUID()}@example.test`;
    const password = `Synthetic!${randomBytes(24).toString('hex')}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'admin' } });
    assert.ok(!created.error && created.data?.user?.id, 'Synthetic user creation failed');
    const id = tracker.trackUser(created.data.user.id);
    record({ state: 'running' });
    const { createServerClient } = require('@supabase/ssr');
    let cookies = [];
    const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: safeFetch }, cookies: { getAll: () => cookies, setAll: values => { cookies = values; } }
    });
    await establishSyntheticAdminSession({
      admin, client, id, email, password, jwks,
      issuer: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`, readCookies: () => cookies
    });
    phase = 'real-browser-origin-and-auth';
    const browser = await probeBrowser(env, cookies, runtime);
    phase = 'complete';
    record({ state: 'environment-ready', browser });
    console.log('PASS: disposable environment preflight only. Restore acceptance A-E is not executed.');
    return { candidate: session.candidate, state: 'environment-ready', browser };
  } catch {
    record({ state: 'failed', failureCategory: phase });
    throw Error(`Environment preflight failed at ${phase}; exact owned fixtures retained. See private preflight evidence.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runPreflight(); }
  catch { console.error('FAIL: disposable environment preflight. No live acceptance or cleanup claim.'); process.exitCode = 1; }
}
