import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import test, {after, afterEach, beforeEach} from 'node:test';

// Execute the real Server Actions; only framework/provider boundaries are mocked.
// These are not hosted SMTP, browser-cookie, or Supabase dashboard tests.
const fixture = {};
globalThis.__magicLinkRedirect = fixture;
const environmentKeys = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_VERCEL_URL',
  'VERCEL_URL',
  'LEAD_IP_HASH_SALT',
];
const originalEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]));
const notice = {notice: 'If that address has an account, a sign-in link is on its way.'};
const unavailable = {error: 'Sign-in links are temporarily unavailable. Please try again later.'};
const rateError = {error: 'Too many requests. Please try again later.'};

const modules = {
  'next/navigation': 'export function redirect(){throw Error("Unexpected navigation");}',
  'next/headers': `
    export async function headers(){
      return new Headers(globalThis.__magicLinkRedirect.requestHeaders);
    }
    export async function cookies(){throw Error("Unexpected cookie access");}
  `,
  '@/lib/contact/lead-schema': `
    import {createHash} from 'node:crypto';
    export async function sha256Hex(value){
      return createHash('sha256').update(value).digest('hex');
    }
  `,
  '@/lib/supabase/admin': `
    export function getSupabaseAdmin(){
      return {rpc: async (name, parameters) => {
        const f = globalThis.__magicLinkRedirect;
        if(name !== 'consume_rate_limit') throw Error("Unexpected RPC");
        f.rateCalls.push({name, parameters});
        if(f.rateThrows) throw Error("Synthetic rate-provider failure");
        return {data: f.rateAllowed, error: f.rateError};
      }};
    }
  `,
  '@/lib/supabase/server': `
    export async function createSupabaseServerClient(){
      const f = globalThis.__magicLinkRedirect;
      f.clientCalls++;
      return {auth: {
        signInWithOtp: async input => {
          f.sendCalls.push(input);
          return {error: f.sendError};
        },
        resetPasswordForEmail: async (email, options) => {
          f.resetCalls.push({email, options});
          return {error: null};
        },
        verifyOtp: async input => {
          f.verifyCalls.push(input);
          return {error: f.verifyError};
        },
        getClaims: async () => {
          f.claimCalls++;
          return {data: {claims: {app_metadata: {role: f.role}}}};
        },
      }};
    }
  `,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return Object.hasOwn(modules, specifier)
      ? {url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true}
      : next(specifier, context);
  },
});
let actions;
try {
  actions = await import('../../lib/auth/actions.ts');
} finally {
  hooks.deregister();
}

beforeEach(t => {
  Object.assign(fixture, {
    requestHeaders: {
      host: 'untrusted.example.test',
      origin: 'https://untrusted.example.test',
      'x-forwarded-host': 'preview.example.test',
      'x-forwarded-proto': 'http',
      'x-forwarded-for': '192.0.2.10',
    },
    rateAllowed: true,
    rateError: null,
    rateThrows: false,
    sendError: null,
    verifyError: null,
    role: 'client',
    clientCalls: 0,
    claimCalls: 0,
    rateCalls: [],
    sendCalls: [],
    resetCalls: [],
    verifyCalls: [],
    logs: [],
  });
  process.env.NEXT_PUBLIC_SITE_URL = 'https://canonical.example.test';
  process.env.NEXT_PUBLIC_VERCEL_URL = 'preview.example.test';
  process.env.VERCEL_URL = 'preview.example.test';
  process.env.LEAD_IP_HASH_SALT = 'synthetic-test-salt';
  t.mock.method(console, 'error', (...args) => fixture.logs.push(args));
});
afterEach(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
after(() => {
  delete globalThis.__magicLinkRedirect;
});

function form(email = '  Fixture@Example.Test  ') {
  const data = new FormData();
  data.set('email', email);
  return data;
}
async function request(data = form()) {
  return actions.requestMagicLinkAction({}, data);
}
function assertNoAuthCall() {
  assert.equal(fixture.clientCalls, 0);
  assert.deepEqual(fixture.sendCalls, []);
  assert.deepEqual(fixture.verifyCalls, []);
}

test('magic-link request pins the canonical login URL and never creates an account', async () => {
  assert.deepEqual(await request(), notice);
  assert.deepEqual(fixture.sendCalls, [{
    email: 'fixture@example.test',
    options: {
      shouldCreateUser: false,
      emailRedirectTo: 'https://canonical.example.test/login',
    },
  }]);
  assert.equal(fixture.clientCalls, 1);
  assert.deepEqual(fixture.rateCalls, [{
    name: 'consume_rate_limit',
    parameters: {
      p_kind: 'otp-ip',
      p_key_hash: createHash('sha256').update('synthetic-test-salt192.0.2.10').digest('hex'),
      p_window_seconds: 300,
      p_max_count: 5,
    },
  }]);
});

for (const [label, origin, expected] of [
  ['trailing slash', 'https://canonical.example.test/', 'https://canonical.example.test/login'],
  ['normalized host', 'https://CANONICAL.example.test:443/', 'https://canonical.example.test/login'],
  ['explicit HTTPS port', 'https://canonical.example.test:8443', 'https://canonical.example.test:8443/login'],
  ['localhost development', 'http://localhost:3000', 'http://localhost:3000/login'],
  ['loopback development', 'http://127.0.0.1:3000/', 'http://127.0.0.1:3000/login'],
]) {
  test(`magic-link canonical origin supports ${label}`, async () => {
    process.env.NEXT_PUBLIC_SITE_URL = origin;
    assert.deepEqual(await request(), notice);
    assert.equal(fixture.sendCalls[0]?.options.emailRedirectTo, expected);
  });
}

for (const [label, value] of [
  ['missing value', undefined],
  ['empty value', ''],
  ['malformed URL', 'not-an-origin'],
  ['relative URL', '/login'],
  ['scheme-relative URL', '//untrusted.example.test'],
  ['remote HTTP origin', 'http://canonical.example.test'],
  ['non-HTTP protocol', 'ftp://canonical.example.test'],
  ['embedded credentials', 'https://user:password@canonical.example.test'],
  ['non-root path', 'https://canonical.example.test/preview'],
  ['query string', 'https://canonical.example.test/?redirect=bad'],
  ['fragment', 'https://canonical.example.test/#bad'],
]) {
  test(`magic-link request refuses ${label} before creating an Auth client`, async () => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = value;
    assert.deepEqual(await request(), unavailable);
    assertNoAuthCall();
    assert.equal(fixture.rateCalls.length, 1);
  });
}

test('posted redirects and request headers cannot override the configured origin', async () => {
  const data = form();
  for (const name of ['next', 'redirectTo', 'emailRedirectTo', 'origin']) {
    data.set(name, 'https://untrusted.example.test/steal');
  }
  assert.deepEqual(await request(data), notice);
  assert.equal(fixture.sendCalls[0]?.options.emailRedirectTo, 'https://canonical.example.test/login');
});

test('empty email is rejected before rate control or Auth', async () => {
  assert.deepEqual(await request(form('   ')), {error: 'Email is required.'});
  assertNoAuthCall();
  assert.deepEqual(fixture.rateCalls, []);
});

test('denied rate control prevents magic-link dispatch', async () => {
  fixture.rateAllowed = false;
  assert.deepEqual(await request(), rateError);
  assertNoAuthCall();
});

for (const mode of ['missing salt', 'RPC error', 'RPC exception']) {
  test(`unavailable rate control prevents dispatch with ${mode}`, async () => {
    if (mode === 'missing salt') delete process.env.LEAD_IP_HASH_SALT;
    if (mode === 'RPC error') fixture.rateError = {message: 'Synthetic internal detail'};
    if (mode === 'RPC exception') fixture.rateThrows = true;
    assert.deepEqual(await request(), rateError);
    assertNoAuthCall();
    assert.deepEqual(fixture.logs, [[
      mode === 'missing salt' ? 'OTP configuration unavailable.' : 'OTP rate control unavailable.',
    ]]);
  });
}

test('provider rate limiting keeps the existing safe message', async () => {
  fixture.sendError = {status: 429, message: 'Synthetic private provider detail'};
  assert.deepEqual(await request(), {
    error: 'Too many requests. Please wait a minute and try again.',
  });
  assert.equal(fixture.sendCalls.length, 1);
  assert.deepEqual(fixture.logs, []);
});

test('provider rejection does not disclose account existence or provider details', async () => {
  fixture.sendError = {status: 400, message: 'Synthetic account-not-found detail'};
  assert.deepEqual(await request(), notice);
  assert.equal(fixture.sendCalls[0]?.options.shouldCreateUser, false);
  assert.deepEqual(fixture.logs, []);
});

for (const [role, home] of [['client', '/portal'], ['admin', '/admin']]) {
  test(`existing token-hash verification returns the ${role} panel`, async () => {
    fixture.role = role;
    assert.deepEqual(await actions.consumeMagicLinkTokenAction('synthetic-token-hash'), {ok: true, home});
    assert.deepEqual(fixture.verifyCalls, [{type: 'magiclink', token_hash: 'synthetic-token-hash'}]);
    assert.equal(fixture.claimCalls, 1);
    assert.deepEqual(fixture.sendCalls, []);
  });
}

test('rejected token-hash verification never resolves a panel', async () => {
  fixture.verifyError = {message: 'Synthetic expired or consumed token'};
  assert.deepEqual(await actions.consumeMagicLinkTokenAction('synthetic-token-hash'), {
    ok: false,
    error: 'This link is invalid or has expired. Ask for a new one.',
  });
  assert.equal(fixture.claimCalls, 0);
});

test('rate control still protects token-hash consumption', async () => {
  fixture.rateAllowed = false;
  assert.deepEqual(await actions.consumeMagicLinkTokenAction('synthetic-token-hash'), {
    ok: false,
    ...rateError,
  });
  assertNoAuthCall();
});

test('password recovery retains its distinct canonical reset route', async () => {
  assert.deepEqual(await actions.requestPasswordResetAction({}, form()), {
    notice: 'If that address has an account, a reset link is on its way.',
  });
  assert.deepEqual(fixture.resetCalls, [{
    email: 'fixture@example.test',
    options: {redirectTo: 'https://canonical.example.test/reset-password'},
  }]);
  assert.deepEqual(fixture.sendCalls, []);
});
