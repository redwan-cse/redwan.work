import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { validatePlan, verifyOwnedRun } from '../acceptance/phase-b.mjs';

const cfg = {
  DISPOSABLE_AUTH_CI: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://gateway:8000',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  SUPABASE_SECRET_KEY: 'sb_secret_synthetic', APP_URL: 'http://app:3000',
  R2_ENDPOINT: 'http://storage:9000', R2_PRIVATE_BUCKET: 'synthetic-private',
  R2_PUBLIC_BUCKET: 'synthetic-public', R2_PRIVATE_ACCESS_KEY_ID: 'testonly1',
  R2_PRIVATE_SECRET_ACCESS_KEY: 'testonly2', R2_PUBLIC_ACCESS_KEY_ID: 'testonly3',
  R2_PUBLIC_SECRET_ACCESS_KEY: 'testonly4', LEAD_IP_HASH_SALT: 'testonly-salt'
};
const candidate = 'a'.repeat(40);
function plan() {
  return { version: 1, candidate, acceptance: cfg,
    services: ['database', 'gateway', 'auth', 'rest', 'storage', 'app', 'runner'].map(role => ({
      role, image: `example/${role}@sha256:${'b'.repeat(64)}`, command: ['sleep', 'infinity'],
      env: role === 'app' ? { ...cfg, NEXT_PUBLIC_SITE_URL: cfg.APP_URL } : {},
      tmpfs: [], memoryMB: 512
    }))
  };
}

// Load the real harness, relocating only its private session file. No public trust setter.
test('real safeFetch preserves same-origin and hostile Origin headers verbatim', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-origin-'));
  const sessionFile = path.join(dir, 'session.json');
  const runId = 'test-run-11111111-1111-4111-8111-111111111111';
  const source = fs.readFileSync(new URL('../acceptance/harness-env.mjs', import.meta.url), 'utf8');
  const needle = "const SESSION = '/tmp/phase-b-session.json';";
  assert.equal(source.split(needle).length, 2);
  const relocated = path.join(dir, 'harness.mjs');
  fs.writeFileSync(relocated, source.replace(needle, `const SESSION = ${JSON.stringify(sessionFile)};`));
  fs.writeFileSync(sessionFile, JSON.stringify({
    version: 1, candidate, runId, runnerId: 'owned-runner', networkId: 'owned-network', env: cfg
  }), { mode: 0o600 });
  const saved = new Map(Object.keys({ ...cfg, DISPOSABLE_RUN_ID: runId }).map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    Object.assign(process.env, cfg, { DISPOSABLE_RUN_ID: runId });
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options }); return new Response('{}');
    };
    const { safeFetch } = await import(pathToFileURL(relocated).href);
    for (const origin of [cfg.APP_URL, 'https://evil.invalid', 'null']) {
      const headers = new Headers({ origin });
      await safeFetch('/api/recovery', { method: 'POST', headers });
      assert.equal(calls.at(-1).options.headers.get('origin'), origin);
      assert.equal(headers.get('origin'), origin);
      assert.equal(calls.at(-1).options.redirect, 'manual');
    }
    await safeFetch('/api/recovery');
    assert.equal(calls.at(-1).options.headers.has('origin'), false);
    const before = calls.length;
    await assert.rejects(safeFetch('https://redwan.work/api/recovery'));
    await assert.rejects(safeFetch('http://gateway:8000/auth/v1/user', { headers: { cookie: 'session=synthetic' } }));
    assert.equal(calls.length, before);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('locally built content-addressed runner is accepted without a registry push', () => {
  const p = plan();
  p.services.at(-1).image = `sha256:${'c'.repeat(64)}`;
  assert.equal(validatePlan(p), p);
});

test('partial image IDs and mutable image tags remain forbidden', () => {
  for (const image of ['sha256:abc', 'runner:latest', `sha256:${'G'.repeat(64)}`]) {
    const p = plan(); p.services.at(-1).image = image;
    assert.throws(() => validatePlan(p));
  }
});

test('prepared runner recipe is locked, credential-free and built before isolation', async () => {
  const { runnerRecipe, browserLock } = await import('../acceptance/prepare-browser.mjs');
  const recipe = runnerRecipe({ candidate, baseImage: `node@sha256:${'b'.repeat(64)}` });
  assert.match(recipe, /npm ci --ignore-scripts/);
  assert.match(recipe, /install --with-deps chromium/);
  assert.match(recipe, /USER 1000:1000/);
  assert.match(recipe, /org\.opencontainers\.image\.revision/);
  assert.doesNotMatch(recipe, /SUPABASE_SECRET_KEY|GOTRUE_JWT_SECRET|COPY \. /);
  assert.equal(browserLock.packages['node_modules/playwright-core'].version, '1.58.2');
  assert.match(browserLock.packages['node_modules/playwright-core'].integrity, /^sha512-/);
  assert.throws(() => runnerRecipe({ candidate, baseImage: 'node:latest' }));
  assert.throws(() => runnerRecipe({ candidate: 'main', baseImage: `node@sha256:${'b'.repeat(64)}` }));
});

function jwtFixture(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'ES256', use: 'sig' };
  const claims = { sub: '11111111-1111-4111-8111-111111111111', aud: 'authenticated',
    role: 'authenticated', iss: 'http://gateway:8000/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 300, ...overrides };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })}.${encode(claims)}`;
  const signature = sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return { token: `${data}.${signature.toString('base64url')}`, jwks: { keys: [jwk] }, claims };
}

test('actual asymmetric signatures and caller identity are verified', async () => {
  const { verifySessionJwt } = await import('../acceptance/environment-preflight.mjs');
  const fixture = jwtFixture();
  assert.equal(verifySessionJwt(fixture.token, fixture.jwks, {
    issuer: fixture.claims.iss, subject: fixture.claims.sub
  }).sub, fixture.claims.sub);
  assert.throws(() => verifySessionJwt(`${fixture.token.slice(0, -10)}AAAAAAAAAA`, fixture.jwks, {
    issuer: fixture.claims.iss, subject: fixture.claims.sub
  }));
  assert.throws(() => verifySessionJwt(fixture.token, fixture.jwks, {
    issuer: fixture.claims.iss, subject: '22222222-2222-4222-8222-222222222222'
  }));
});

test('expired, wrong-issuer and privileged session claims fail', async () => {
  const { verifySessionJwt } = await import('../acceptance/environment-preflight.mjs');
  for (const overrides of [{ exp: 1 }, { iss: 'https://example.invalid' }, { role: 'service_role' }]) {
    const f = jwtFixture(overrides);
    assert.throws(() => verifySessionJwt(f.token, f.jwks, {
      issuer: 'http://gateway:8000/auth/v1', subject: f.claims.sub
    }));
  }
});

test('public JWKS rejects symmetric and private key material', async () => {
  const { validatePublicJwks } = await import('../acceptance/environment-preflight.mjs');
  for (const key of [{ kty: 'oct', k: 'secret' }, { kty: 'EC', d: 'private' }]) {
    assert.throws(() => validatePublicJwks({ keys: [key] }));
  }
  assert.throws(() => validatePublicJwks({ keys: [] }));
  const f = jwtFixture();
  assert.equal(validatePublicJwks(f.jwks), f.jwks);
  assert.throws(() => validatePublicJwks({ keys: [f.jwks.keys[0], f.jwks.keys[0]] }));
});

test('gateway preflight refuses successful or redirected negative-authority probes', async () => {
  const { probeGateway } = await import('../acceptance/environment-preflight.mjs');
  for (const status of [200, 201, 302, 404, 500]) {
    let calls = 0;
    await assert.rejects(probeGateway(cfg, async () => { calls++; return new Response('{}', { status }); }));
    assert.equal(calls, 1);
  }
});

test('gateway preflight checks every credential denial before trusting public JWKS', async () => {
  const { probeGateway } = await import('../acceptance/environment-preflight.mjs');
  const f = jwtFixture();
  const calls = [];
  const result = await probeGateway(cfg, async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/.well-known/jwks.json')
      ? new Response(JSON.stringify(f.jwks)) : new Response('{}', { status: 401 });
  });
  assert.deepEqual(result, f.jwks);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0].options.headers, {});
  assert.equal(calls[1].options.headers.apikey, 'sb_secret_invalid');
  assert.equal(calls[2].options.headers.apikey, cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[3].options.headers.authorization, 'Bearer not-a-jwt');
  assert.equal(calls[4].options.headers.apikey, 'sb_secret_invalid');
  assert.ok(calls.every(c => new URL(c.url).origin === cfg.NEXT_PUBLIC_SUPABASE_URL));
});

test('symmetric JWT headers are rejected even alongside a valid public JWKS', async () => {
  const { verifySessionJwt } = await import('../acceptance/environment-preflight.mjs');
  const f = jwtFixture();
  const parts = f.token.split('.');
  parts[0] = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'fixture-key' })).toString('base64url');
  assert.throws(() => verifySessionJwt(parts.join('.'), f.jwks, { issuer: f.claims.iss, subject: f.claims.sub }));
});

test('prepared browser runner cannot become writable or overlay the tested source', () => {
  const runId = 'test-run-11111111-1111-4111-8111-111111111111';
  const services = plan().services.map(s => ({ role: s.role, id: `owned-${s.role}`, imageId: 'sha256:pinned' }));
  const state = { version: 1, runId, candidate, networkId: 'owned-net', services };
  for (const mode of ['valid', 'writable', 'source-overlay']) {
    const inspect = (...args) => {
      if (args[0] === 'network') return JSON.stringify([{
        Id: state.networkId, Internal: true, Driver: 'bridge', Labels: { 'work.redwan.phase-b': runId },
        Containers: Object.fromEntries(services.map(s => [s.id, {}]))
      }]);
      const service = services.find(s => s.id === args[2]);
      const browser = service.role === 'runner';
      return JSON.stringify([{
        Id: service.id, Image: service.imageId, State: { Running: true },
        Config: { Labels: { 'work.redwan.phase-b': runId, 'work.redwan.phase-b.role': service.role,
          ...(browser ? { 'work.redwan.acceptance.browser': '1.58.2' } : {}) } },
        HostConfig: { CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], Dns: ['127.0.0.1'],
          ReadonlyRootfs: mode !== 'writable', PortBindings: {} },
        Mounts: browser ? [{ Type: 'tmpfs', Destination: mode === 'source-overlay' ? '/work' : '/tmp' }] : [],
        NetworkSettings: { Networks: { owned: { NetworkID: state.networkId, Aliases: [service.role] } } }
      }]);
    };
    if (mode === 'valid') assert.equal(verifyOwnedRun(state, inspect), true);
    else assert.throws(() => verifyOwnedRun(state, inspect));
  }
});

test('preflight cannot run without the owned private launcher session', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-refusal-'));
  try {
    const entry = fs.readFileSync(new URL('../acceptance/environment-preflight.mjs', import.meta.url), 'utf8');
    const harness = fs.readFileSync(new URL('../acceptance/harness-env.mjs', import.meta.url), 'utf8');
    const missing = JSON.stringify(path.join(dir, 'session-that-does-not-exist.json'));
    fs.writeFileSync(path.join(dir, 'harness-env.mjs'), harness.replace(
      "const SESSION = '/tmp/phase-b-session.json';", `const SESSION = ${missing};`
    ));
    fs.writeFileSync(path.join(dir, 'environment-preflight.mjs'), entry);
    const result = spawnSync(process.execPath, ['--test', path.join(dir, 'environment-preflight.mjs')], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /FAIL: disposable environment preflight/);
    assert.doesNotMatch(result.stdout + result.stderr, /PASS: disposable environment preflight/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
