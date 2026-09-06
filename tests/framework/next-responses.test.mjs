import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server.js';
import { parseCookieHeader } from '@supabase/ssr';

// Real Next.js request/response/cookie implementation, real SSR cookie parser.
// Only external identity and storage adapters are replaced. No network allowed.
const fixture = { client: null, options: null, fileCalls: [], fileResult: null, parseCookieHeader };
globalThis.__realFrameworkFixture = fixture;
const sources = {
  '@supabase/ssr': 'export const parseCookieHeader = globalThis.__realFrameworkFixture.parseCookieHeader; export function createServerClient(url, key, options) { globalThis.__realFrameworkFixture.options = options; return globalThis.__realFrameworkFixture.client; }',
  '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return globalThis.__realFrameworkFixture.client; }',
  '@/lib/crm/files': 'export async function getOwnedFileUrl(id, viewer) { const f = globalThis.__realFrameworkFixture; f.fileCalls.push({ id, viewer }); return f.fileResult; }',
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  if (specifier === '@/lib/auth/session') return nextResolve(new URL('../../lib/auth/session.ts', import.meta.url).href, context);
  if (Object.hasOwn(sources, specifier)) return { url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { proxy } = await import('../../proxy.ts');
const { GET: download } = await import('../../app/api/files/[id]/download/route.ts');
hooks.deregister();

const userId = '11111111-1111-4111-8111-111111111111';
const email = 'framework-fixture@example.test';
function setup({ role = 'admin', profile = { role, is_active: true }, profileError = null, claimsError = null, claims = { sub: userId, email, app_metadata: { role } }, throwAt = null, writes = [] } = {}) {
  fixture.fileCalls = [];
  fixture.fileResult = { ok: false, error: 'synthetic-private-error' };
  fixture.options = null;
  const reads = [];
  fixture.client = {
    auth: { getClaims: async () => {
      if (throwAt === 'claims') throw new Error('synthetic-private-error');
      for (const batch of writes) fixture.options.cookies.setAll(batch, { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Expires: '0', Vary: 'Cookie' });
      return { data: { claims }, error: claimsError };
    } },
    from(table) {
      assert.equal(table, 'profiles');
      return { select(columns) {
        assert.equal(columns, 'role, is_active');
        return { eq(column, id) {
          assert.equal(column, 'id'); assert.equal(id, userId); reads.push(id);
          return { maybeSingle: async () => {
            if (throwAt === 'profile') throw new Error('synthetic-private-error');
            return { data: profile, error: profileError };
          } };
        } };
      } };
    },
  };
  return reads;
}
function request(path, cookie = '') {
  return new NextRequest(new URL(path, 'https://example.test'), { headers: cookie ? { cookie } : {} });
}
function refreshed() {
  return [
    [{ name: 'session-fixture.0', value: 'part-one', options: { path: '/', maxAge: 3600 } }, { name: 'session-fixture.1', value: 'part-two', options: { path: '/', maxAge: 3600 } }],
    [{ name: 'session-fixture.0', value: 'updated', options: { path: '/', maxAge: 1800 } }, { name: 'session-fixture.1', value: '', options: { path: '/', maxAge: 0 } }],
  ];
}
function assertSessionHeaders(res) {
  assert.ok(res instanceof NextResponse);
  const lines = res.headers.getSetCookie();
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /HttpOnly/i); assert.match(line, /Secure/i); assert.match(line, /SameSite=lax/i); assert.match(line, /Path=\//i);
  }
  assert.equal(res.cookies.get('session-fixture.0').value, 'updated');
  assert.equal(res.cookies.get('session-fixture.1').value, '');
  assert.match(lines.find((line) => line.startsWith('session-fixture.1=')), /Max-Age=0/i);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('pragma'), 'no-cache');
  assert.equal(res.headers.get('expires'), '0');
  assert.equal(res.headers.get('vary'), 'Cookie');
}

// Sequential subtests isolate mutable adapter and environment state.
test('real Next.js proxy and route contracts', async (t) => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NODE_ENV'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => { throw new Error('Network forbidden in framework suite'); };
  console.error = (...args) => logs.push(args.join(' '));
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic-not-a-credential';
  process.env.NODE_ENV = 'production';
  try {
    await t.test('real classes are used, not framework stubs', () => {
      assert.ok(request('/admin') instanceof Request);
      assert.ok(NextResponse.next() instanceof Response);
    });
    for (const [role, path] of [['admin', '/admin'], ['client', '/portal']]) {
      await t.test(`active ${role} continues with serialized and forwarded cookie chunks`, async () => {
        setup({ role, writes: refreshed() });
        const req = request(path, 'unrelated=keep'); const res = await proxy(req);
        assert.equal(res.status, 200); assert.equal(res.headers.get('x-middleware-next'), '1');
        assertSessionHeaders(res);
        assert.equal(req.cookies.get('session-fixture.0').value, 'updated');
        const forwarded = res.headers.get('x-middleware-request-cookie');
        const forwardedRequest = request(path, forwarded);
        assert.equal(forwardedRequest.cookies.get('session-fixture.0').value, 'updated');
        assert.equal(forwardedRequest.cookies.get('unrelated').value, 'keep');
        assert.ok(res.headers.get('x-middleware-override-headers').split(',').includes('cookie'));
        assert.ok(fixture.options.cookies.getAll().some((c) => c.name === 'session-fixture.0' && c.value === 'updated'));
      });
    }
    for (const [role, path, target] of [['client', '/admin', '/portal'], ['admin', '/portal', '/admin'], ['admin', '/login', '/admin'], ['client', '/login', '/portal']]) {
      await t.test(`${role} ${path} redirects to ${target} and preserves cookies`, async () => {
        setup({ role, writes: refreshed() }); const res = await proxy(request(path));
        assert.equal(res.status, 307); assert.equal(res.headers.get('location'), `https://example.test${target}`);
        assertSessionHeaders(res);
        assert.equal(res.headers.get('x-middleware-next'), null);
        assert.equal(res.headers.get('x-middleware-request-cookie'), null);
      });
    }
    for (const [role, nextRole] of [['admin', 'client'], ['client', 'admin']]) {
      await t.test(`changed ${role} authority logs out while login remains reachable`, async () => {
        setup({ role, profile: { role: nextRole, is_active: true } });
        const res = await proxy(request(role === 'admin' ? '/admin' : '/portal'));
        assert.equal(res.status, 307); assert.equal(res.headers.get('location'), 'https://example.test/api/auth/logout');
        assert.equal((await proxy(request('/login'))).headers.get('location'), null);
      });
      await t.test(`inactive ${role} redirects with the deactivation reason`, async () => {
        setup({ role, profile: { role, is_active: false } });
        const res = await proxy(request(role === 'admin' ? '/admin' : '/portal'));
        assert.equal(res.headers.get('location'), 'https://example.test/api/auth/logout?reason=deactivated');
      });
    }
    await t.test('anonymous redirect keeps encoded destination and refreshed headers', async () => {
      setup({ claims: null, writes: refreshed() }); const res = await proxy(request('/admin/emails?page=2'));
      assert.equal(res.status, 307); assert.equal(new URL(res.headers.get('location')).searchParams.get('next'), '/admin/emails?page=2');
      assertSessionHeaders(res);
    });
    await t.test('recovery/invitation bypass panel routing, not session response preservation', async () => {
      for (const path of ['/reset-password', '/invite/accept']) {
        const reads = setup({ profile: null, writes: refreshed() }); const res = await proxy(request(path));
        assert.equal(res.status, 200); assert.equal(reads.length, 0); assertSessionHeaders(res);
      }
    });
    for (const options of [{ profileError: { message: 'synthetic-private-error' }, writes: refreshed() }, { throwAt: 'profile' }, { throwAt: 'claims' }]) {
      await t.test(`dependency failure is generic and non-cacheable: ${options.throwAt ?? 'result error'}`, async () => {
        setup(options); const res = await proxy(request('/admin'));
        assert.equal(res.status, 503); assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(await res.text(), 'Authentication is temporarily unavailable.');
        if (options.writes) assert.equal(res.headers.getSetCookie().length, 2);
      });
    }
    await t.test('missing configuration denies panels but leaves auth pages reachable', async () => {
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      try {
        const res = await proxy(request('/portal?tab=files'));
        assert.equal(res.status, 307); assert.equal(new URL(res.headers.get('location')).searchParams.get('next'), '/portal?tab=files');
        for (const path of ['/login', '/reset-password', '/invite/accept']) assert.equal((await proxy(request(path))).status, 200);
      } finally { process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key; }
    });
    await t.test('development cookies remain HttpOnly and SameSite but not Secure', async () => {
      process.env.NODE_ENV = 'development';
      try {
        setup({ writes: refreshed() }); const res = await proxy(request('/admin'));
        for (const value of res.headers.getSetCookie()) { assert.match(value, /HttpOnly/i); assert.match(value, /SameSite=lax/i); assert.doesNotMatch(value, /; Secure/i); }
      } finally { process.env.NODE_ENV = 'production'; }
    });
    await t.test('download with no accepted session is 401 and never queries storage', async () => {
      for (const options of [{ claims: null }, { profile: null }, { profile: { role: 'admin', is_active: false } }, { profile: { role: 'client', is_active: true } }]) {
        setup(options); const res = await download(request('/api/files/fixture/download'), { params: Promise.resolve({ id: 'fixture' }) });
        assert.ok(res instanceof NextResponse); assert.equal(res.status, 401);
        assert.deepEqual(await res.json(), { error: 'Unauthorized' }); assert.equal(fixture.fileCalls.length, 0);
      }
    });
    await t.test('authorized-session file denial is a generic 404', async () => {
      setup({ role: 'client' }); const res = await download(request('/api/files/fixture/download'), { params: Promise.resolve({ id: 'fixture' }) });
      assert.equal(res.status, 404); assert.deepEqual(await res.json(), { error: 'File not found.' });
      assert.deepEqual(fixture.fileCalls, [{ id: 'fixture', viewer: { userId, role: 'client' } }]);
    });
    await t.test('missing file id is 404 without storage lookup', async () => {
      setup(); const res = await download(request('/api/files/fixture/download'), { params: Promise.resolve({ id: '' }) });
      assert.equal(res.status, 404); assert.deepEqual(await res.json(), { error: 'File not found.' }); assert.equal(fixture.fileCalls.length, 0);
    });
    await t.test('allowed download returns 302 without fetching the target', async () => {
      setup(); fixture.fileResult = { ok: true, url: 'https://example.test/synthetic-download', filename: 'fixture.pdf' };
      const res = await download(request('/api/files/fixture/download'), { params: Promise.resolve({ id: 'fixture' }) });
      assert.equal(res.status, 302); assert.equal(res.headers.get('location'), fixture.fileResult.url);
    });
    assert.equal(logs.some((line) => line.includes('synthetic-private-error')), false);
  } finally {
    globalThis.fetch = originalFetch; console.error = originalError;
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
    delete globalThis.__realFrameworkFixture;
  }
});
