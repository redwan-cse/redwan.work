import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Only external adapters are mocked; the application modules are imported intact.
const fixture = { client: null, options: null };
globalThis.__sessionAuthorityFixture = fixture;
class ResponseStub {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers();
    this.cookieValues = new Map();
    this.cookies = {
      set: (name, value, options = {}) => this.cookieValues.set(name, { ...options, name, value }),
      getAll: () => [...this.cookieValues.values()],
    };
  }
  static next(init) { const r = new ResponseStub(); r.forwarded = init?.request?.headers; return r; }
  static redirect(url) { const r = new ResponseStub(null, { status: 307 }); r.headers.set('location', String(url)); return r; }
}
fixture.Response = ResponseStub;
const modules = {
  '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return globalThis.__sessionAuthorityFixture.client; }',
  '@supabase/ssr': 'export function createServerClient(url, key, options) { globalThis.__sessionAuthorityFixture.options = options; return globalThis.__sessionAuthorityFixture.client; } export function parseCookieHeader() { return []; }',
  'next/server': 'export const NextResponse = globalThis.__sessionAuthorityFixture.Response;',
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(modules, specifier)) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { getCurrentSession } = await import('../lib/auth/session.ts');
const { proxy } = await import('../proxy.ts');
hooks.deregister();
const userId = '11111111-1111-4111-8111-111111111111';
const email = 'authority-fixture@example.test';
function setup({ role = 'admin', profile = { role, is_active: true }, profileError = null, claimsError = null, throws = false, refresh = false, claims = { sub: userId, email, app_metadata: { role } } } = {}) {
  const reads = [];
  fixture.client = {
    auth: { getClaims: async () => {
      if (throws) throw new Error('synthetic-private-diagnostic');
      if (refresh) fixture.options.cookies.setAll([{ name: 'session-fixture', value: 'synthetic', options: { path: '/' } }], { 'Cache-Control': 'private, no-store' });
      return { data: { claims }, error: claimsError };
    } },
    from(table) {
      assert.equal(table, 'profiles');
      return { select(columns) {
        assert.equal(columns, 'role, is_active');
        return { eq(column, id) {
          assert.equal(column, 'id'); assert.equal(id, userId); reads.push(id);
          return { maybeSingle: async () => ({ data: profile, error: profileError }) };
        } };
      } };
    },
  };
  return reads;
}
function request(path) {
  const headers = new Headers();
  return { url: `https://example.test${path}`, nextUrl: new URL(`https://example.test${path}`), headers,
    cookies: { toString: () => headers.get('cookie') ?? '', set: (name, value) => headers.set('cookie', `${name}=${value}`) } };
}

test('session authority: current profile and verified claims must agree', async (t) => {
  for (const role of ['admin', 'client']) {
    await t.test(`accepts an active ${role}`, async () => {
      const reads = setup({ role });
      assert.deepEqual(await getCurrentSession(), { userId, email, role });
      assert.equal(reads.length, 1);
    });
    await t.test(`rejects an inactive ${role}`, async () => {
      setup({ role, profile: { role, is_active: false } });
      assert.equal(await getCurrentSession(), null);
    });
  }
  for (const [name, options] of [
    ['changed role', { profile: { role: 'client', is_active: true } }],
    ['missing profile', { profile: null }],
    ['profile error', { profileError: { message: 'synthetic-private-diagnostic' } }],
    ['invalid claims', { claimsError: { message: 'synthetic-private-diagnostic' } }],
    ['missing identity', { claims: { app_metadata: { role: 'admin' } } }],
    ['invalid identity type', { claims: { sub: 123, email, app_metadata: { role: 'admin' } } }],
    ['unsupported role', { role: 'owner' }],
  ]) {
    await t.test(`rejects ${name}`, async () => { setup(options); assert.equal(await getCurrentSession(), null); });
  }
  await t.test('rechecks profile on a later call', async () => {
    setup(); assert.notEqual(await getCurrentSession(), null);
    setup({ profile: { role: 'admin', is_active: false } });
    assert.equal(await getCurrentSession(), null);
  });
  await t.test('exceptions fail closed without provider diagnostics', async () => {
    setup({ throws: true });
    const logs = []; const original = console.error; console.error = (...args) => logs.push(args.join(' '));
    try { assert.equal(await getCurrentSession(), null); } finally { console.error = original; }
    assert.deepEqual(logs, ['Session authority check unavailable.']);
  });
});

test('proxy authority and session response handling', async (t) => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NODE_ENV'];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic-test-only';
  process.env.NODE_ENV = 'production';
  try {
    await t.test('active admin continues and refreshed cookies reach the request', async () => {
      setup({ refresh: true }); const req = request('/admin'); const res = await proxy(req);
      assert.equal(res.status, 200);
      assert.equal(req.headers.get('cookie'), 'session-fixture=synthetic');
      assert.equal(res.forwarded.get('cookie'), 'session-fixture=synthetic');
      const cookie = res.cookies.getAll()[0];
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'lax');
    });
    await t.test('changed admin role routes to logout, not its former panel', async () => {
      setup({ profile: { role: 'client', is_active: true } });
      const res = await proxy(request('/admin')); assert.equal(new URL(res.headers.get('location')).pathname, '/api/auth/logout');
    });
    await t.test('stale login remains reachable without a redirect loop', async () => {
      setup({ profile: { role: 'client', is_active: true } });
      const res = await proxy(request('/login')); assert.equal(res.status, 200); assert.equal(res.headers.get('location'), null);
    });
    await t.test('inactive client routes to deactivation logout', async () => {
      setup({ role: 'client', profile: { role: 'client', is_active: false } });
      const res = await proxy(request('/portal')); assert.equal(res.headers.get('location'), 'https://example.test/api/auth/logout?reason=deactivated');
    });
    await t.test('wrong-role redirect preserves refreshed cookies and cache control', async () => {
      setup({ role: 'client', refresh: true });
      const res = await proxy(request('/admin')); assert.equal(res.headers.get('location'), 'https://example.test/portal');
      assert.equal(res.cookies.getAll()[0].httpOnly, true);
      assert.equal(res.headers.get('cache-control'), 'private, no-store');
    });
    await t.test('profile outage returns a non-cacheable generic failure', async () => {
      setup({ profileError: { message: 'synthetic-private-diagnostic' } });
      const res = await proxy(request('/admin')); assert.equal(res.status, 503);
      assert.equal(res.headers.get('cache-control'), 'no-store'); assert.equal(res.body.includes('synthetic-private-diagnostic'), false);
    });
    await t.test('anonymous redirect retains the intended destination', async () => {
      setup({ claims: null }); const res = await proxy(request('/admin/emails?page=2'));
      assert.equal(new URL(res.headers.get('location')).searchParams.get('next'), '/admin/emails?page=2');
    });
    await t.test('recovery and invitation remain reachable', async () => {
      for (const path of ['/reset-password', '/invite/accept']) {
        const reads = setup({ profile: null }); assert.equal((await proxy(request(path))).status, 200); assert.equal(reads.length, 0);
      }
    });
  } finally {
    for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
  }
});
