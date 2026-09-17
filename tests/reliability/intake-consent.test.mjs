import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {BUDGET_ERROR, NDA_ERROR, parseBudgetRange, parseNdaValues} from '../../lib/contact/intake-contract.ts';

// State store for contact test harness
const state = {
  rateLimits: new Map(), // hash -> count
  leads: [],
  storedObjects: new Map(), // key -> size
  rpcFailures: false,
  dbInsertError: null,
  turnstileSuccess: true,
  turnstileError: false,
};
globalThis.__intakeConsentTest = state;

const modules = {
  'server-only': 'export {};',
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    const s = globalThis.__intakeConsentTest;
    return {
      rpc: async (name, args) => {
        if (s.rpcFailures) return { data: null, error: { message: 'synthetic RPC error' } };
        if (name === 'consume_rate_limit') {
          const key = args.p_kind + ':' + args.p_key_hash;
          const current = s.rateLimits.get(key) ?? 0;
          if (current >= args.p_max_count) return { data: false, error: null };
          s.rateLimits.set(key, current + 1);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
      from: (table) => {
        const query = {
          insert: (val) => {
            if (s.dbInsertError) return { select: () => ({ single: async () => ({ data: null, error: s.dbInsertError }) }) };
            const ticketNumber = s.leads.length + 1000;
            s.leads.push({...val, ticket_number: ticketNumber});
            return {
              select: () => ({
                single: async () => ({ data: { ticket_number: ticketNumber }, error: null }),
              }),
            };
          },
        };
        return query;
      },
    };
  }`,
  '@/lib/r2': `export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_SIZE_BYTES = 10485760;
export function isValidContactKey(key) {
  return typeof key === 'string' && /^contact\\/[0-9a-f-]{36}\\/[0-9a-f-]{36}\\.[a-z0-9]+$/.test(key);
}
export async function verifyStoredObjectSize(key, size) {
  const s = globalThis.__intakeConsentTest;
  const stored = s.storedObjects.get(key);
  return stored !== undefined && stored === size;
}`,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier)) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]),
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/contact/intake-contract') {
      return {
        url: new URL('../../lib/contact/intake-contract.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/contact/lead-schema') {
      return {
        url: new URL('../../lib/contact/lead-schema.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === '@/lib/contact/lead-store') {
      return {
        url: new URL('../../lib/contact/lead-store.ts', import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier === 'next/server') {
      return nextResolve('next/server.js', context);
    }
    return nextResolve(specifier, context);
  },
});

const {POST} = await import('../../app/api/contact/route.ts');
const {parseLeadPayload} = await import('../../lib/contact/lead-schema.ts');
hooks.deregister();

const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
});

function resetState() {
  state.rateLimits.clear();
  state.leads = [];
  state.storedObjects.clear();
  state.rpcFailures = false;
  state.dbInsertError = null;
  state.turnstileSuccess = true;
  state.turnstileError = false;

  process.env.NODE_ENV = 'production';
  process.env.LEAD_IP_HASH_SALT = 'synthetic-ip-salt-32-chars-long-here';
  process.env.TURNSTILE_SECRET_KEY = 'synthetic-turnstile-secret-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'synthetic-supabase-secret-key';

  globalThis.fetch = async (url) => {
    const urlStr = typeof url === 'string' ? url : url.href;
    if (urlStr.includes('turnstile/v0/siteverify')) {
      if (state.turnstileError) throw new Error('Turnstile API unreachable');
      return new Response(JSON.stringify({success: state.turnstileSuccess}));
    }
    return new Response('{}');
  };
}

function baseLeadForm(entries = []) {
  const f = new FormData();
  f.set('name', 'Sarah Test');
  f.set('email', 'sarah@example.test');
  f.set('projectSummary', 'Need full stack Next.js and Supabase development.');
  f.set('gdprConsent', 'true');
  f.set('cf-turnstile-response', 'synthetic-token-1234');
  for (const [k, v] of entries) {
    if (v === null) f.delete(k);
    else f.set(k, v);
  }
  return f;
}

const dummyMeta = {ipHash: 'synthetic-ip-hash', userAgent: 'Synthetic Test Runner'};

// -----------------------------------------------------------------------------
// 1. Intake NDA Contract (I01)
// -----------------------------------------------------------------------------
test('I01: accepted NDA vocabulary permutations', () => {
  // Omitted
  assert.deepEqual(parseNdaValues([]), {ok: true, required: false});
  // Empty string
  assert.deepEqual(parseNdaValues(['']), {ok: true, required: false});
  // Literal 'false'
  assert.deepEqual(parseNdaValues(['false']), {ok: true, required: false});
  // Literal 'true'
  assert.deepEqual(parseNdaValues(['true']), {ok: true, required: true});
  // Exact legacy form string
  assert.deepEqual(parseNdaValues(['Yes - NDA or strict confidentiality required']), {
    ok: true,
    required: true,
  });

  // Integrated lead schema parsing
  for (const [val, expected] of [
    [null, false],
    ['', false],
    ['false', false],
    ['true', true],
    ['Yes - NDA or strict confidentiality required', true],
  ]) {
    const f = baseLeadForm(val !== null ? [['ndaConfidentiality', val]] : []);
    const res = parseLeadPayload(f, dummyMeta);
    assert.equal(res.ok, true);
    assert.equal(res.lead.nda_required, expected);
  }
});

test('I01: rejects invalid, unknown, or duplicate NDA values', () => {
  for (const invalid of ['yes', 'TRUE', '1', 'on', 'unknown', 'nda', 'True']) {
    assert.deepEqual(parseNdaValues([invalid]), {ok: false, error: NDA_ERROR});
    const f = baseLeadForm([['ndaConfidentiality', invalid]]);
    const res = parseLeadPayload(f, dummyMeta);
    assert.equal(res.ok, false);
    assert.equal(res.error, NDA_ERROR);
  }

  // Duplicate values
  assert.deepEqual(parseNdaValues(['true', 'true']), {ok: false, error: NDA_ERROR});
  assert.deepEqual(parseNdaValues(['', '']), {ok: false, error: NDA_ERROR});

  // File blob input
  const fBlob = baseLeadForm();
  fBlob.append('ndaConfidentiality', new Blob(['test']), 'test.txt');
  assert.equal(parseLeadPayload(fBlob, dummyMeta).ok, false);
});

// -----------------------------------------------------------------------------
// 2. Whole-Dollar USD Budget Contract (I02)
// -----------------------------------------------------------------------------
test('I02: valid whole-dollar USD budget ranges', () => {
  // Both blank -> null
  assert.deepEqual(parseBudgetRange('', ''), {ok: true, minimum: null, maximum: null});
  assert.deepEqual(parseBudgetRange('   ', '   '), {ok: true, minimum: null, maximum: null});

  // Valid non-negative whole dollars with min <= max
  assert.deepEqual(parseBudgetRange('0', '0'), {ok: true, minimum: 0, maximum: 0});
  assert.deepEqual(parseBudgetRange('100', '500'), {ok: true, minimum: 100, maximum: 500});
  assert.deepEqual(parseBudgetRange(' 5000 ', ' 10000 '), {ok: true, minimum: 5000, maximum: 10000});
  assert.deepEqual(parseBudgetRange('10000000', '10000000'), {
    ok: true,
    minimum: 10000000,
    maximum: 10000000,
  });

  // Integration through parseLeadPayload
  const f = baseLeadForm([
    ['budgetMin', '1500'],
    ['budgetMax', '3000'],
  ]);
  const res = parseLeadPayload(f, dummyMeta);
  assert.equal(res.ok, true);
  assert.equal(res.lead.budget_min, 1500);
  assert.equal(res.lead.budget_max, 3000);
});

test('I02: rejects invalid ranges without coercion', () => {
  const invalidCases = [
    ['1.5', '2'], // Decimals
    ['100', '200.50'], // Decimals
    ['1e3', '2000'], // Exponents
    ['0x10', '20'], // Hex
    ['100USD', '200'], // Currency suffix
    ['$100', '$200'], // Currency prefix
    ['-1', '100'], // Negative
    ['+50', '100'], // Explicit sign
    ['500', '100'], // Inverted min > max
    ['', '500'], // Asymmetric blank
    ['500', ''], // Asymmetric blank
    ['0', '10000001'], // Out of bounds > 10M
    ['0', '999999999999999999999999'], // Non-safe integer
    ['1,000', '2,000'], // Comma formatted
    ['NaN', '500'], // NaN
  ];

  for (const [min, max] of invalidCases) {
    assert.deepEqual(parseBudgetRange(min, max), {ok: false, error: BUDGET_ERROR});
    const f = baseLeadForm([
      ['budgetMin', min],
      ['budgetMax', max],
    ]);
    const res = parseLeadPayload(f, dummyMeta);
    assert.equal(res.ok, false);
    assert.equal(res.error, BUDGET_ERROR);
  }

  // Duplicate budget fields
  const fDup = baseLeadForm([['budgetMin', '100'], ['budgetMax', '500']]);
  fDup.append('budgetMin', '200');
  assert.equal(parseLeadPayload(fDup, dummyMeta).ok, false);
});

// -----------------------------------------------------------------------------
// 3. Explicit Consent Contract (Issue #45)
// -----------------------------------------------------------------------------
test('explicit consent: requires literal "true" and rejects non-literal/duplicate values', () => {
  // Reject missing / false / truthy variants
  for (const invalid of [null, '', 'false', 'TRUE', '1', 'on', 'yes', ' true ']) {
    const f = baseLeadForm(invalid !== null ? [['gdprConsent', invalid]] : []);
    if (invalid === null) f.delete('gdprConsent');
    const res = parseLeadPayload(f, dummyMeta);
    assert.equal(res.ok, false);
    assert.match(res.error, /Please agree to the Data & Privacy policy/);
  }

  // Duplicate fields
  const fDup = baseLeadForm();
  fDup.append('gdprConsent', 'true'); // second entry
  assert.equal(parseLeadPayload(fDup, dummyMeta).ok, false);

  const fDupDiff = baseLeadForm();
  fDupDiff.append('gdprConsent', 'false');
  assert.equal(parseLeadPayload(fDupDiff, dummyMeta).ok, false);

  // Valid literal true generates valid ISO timestamp
  const fValid = baseLeadForm([['gdprConsent', 'true']]);
  const resValid = parseLeadPayload(fValid, dummyMeta);
  assert.equal(resValid.ok, true);
  assert.ok(Number.isFinite(Date.parse(resValid.lead.consent_at)));
});

// -----------------------------------------------------------------------------
// 4. Contact Route Security & Turnstile Replay Prevention
// -----------------------------------------------------------------------------
test('contact route: rejects cross-origin requests with 403', async () => {
  resetState();
  const form = baseLeadForm();
  const req = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: form,
    headers: {
      origin: 'https://evil-attacker.site',
      host: 'redwan.work',
    },
  });

  const res = await POST(req);
  assert.equal(res.status, 403);
  assert.equal(state.leads.length, 0);
});

test('contact route: fails closed (503) if mandatory secrets are missing', async () => {
  for (const envVar of [
    'LEAD_IP_HASH_SALT',
    'TURNSTILE_SECRET_KEY',
    'SUPABASE_SECRET_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
  ]) {
    resetState();
    delete process.env[envVar];
    const form = baseLeadForm();
    const req = new NextRequest('https://redwan.work/api/contact', {
      method: 'POST',
      body: form,
      headers: {origin: 'https://redwan.work', host: 'redwan.work'},
    });

    const res = await POST(req);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(state.leads.length, 0);
  }
});

test('contact route: enforces Turnstile token validation and single-use replay protection', async () => {
  resetState();
  const token = 'valid-one-time-token-xyz';
  const form1 = baseLeadForm([['cf-turnstile-response', token]]);
  const req1 = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: form1,
    headers: {
      origin: 'https://redwan.work',
      host: 'redwan.work',
      'cf-connecting-ip': '203.0.113.1',
    },
  });

  // First request succeeds
  const res1 = await POST(req1);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.match(data1.ticketRef, /^TKT-\d+$/);
  assert.equal(state.leads.length, 1);

  // Second request with SAME token is rejected as replayed token (400)
  const form2 = baseLeadForm([['cf-turnstile-response', token]]);
  const req2 = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: form2,
    headers: {
      origin: 'https://redwan.work',
      host: 'redwan.work',
      'cf-connecting-ip': '203.0.113.2', // different IP, same token
    },
  });

  const res2 = await POST(req2);
  assert.equal(res2.status, 400);
  const data2 = await res2.json();
  assert.match(data2.error, /Verification token already used/);
  assert.equal(state.leads.length, 1); // No new lead persisted
});

test('contact route: enforces IP rate limit of 5 requests/hour with 429', async () => {
  resetState();
  const ip = '198.51.100.42';

  for (let i = 0; i < 5; i++) {
    const form = baseLeadForm([['cf-turnstile-response', `token-${i}`]]);
    const req = new NextRequest('https://redwan.work/api/contact', {
      method: 'POST',
      body: form,
      headers: {
        origin: 'https://redwan.work',
        host: 'redwan.work',
        'cf-connecting-ip': ip,
      },
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
  }
  assert.equal(state.leads.length, 5);

  // 6th request from same IP returns 429
  const formOver = baseLeadForm([['cf-turnstile-response', 'token-6']]);
  const reqOver = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: formOver,
    headers: {
      origin: 'https://redwan.work',
      host: 'redwan.work',
      'cf-connecting-ip': ip,
    },
  });
  const resOver = await POST(reqOver);
  assert.equal(resOver.status, 429);
  assert.equal(state.leads.length, 5);
});

// -----------------------------------------------------------------------------
// 5. Attachment Scope, Size & Storage Verification
// -----------------------------------------------------------------------------
test('contact route: validates attachments and verifies stored object sizes against R2', async () => {
  resetState();
  const validKey = 'contact/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf';
  state.storedObjects.set(validKey, 1024); // Stored size 1024 bytes

  const attachments = [
    {key: validKey, filename: 'spec.pdf', mime: 'application/pdf', size_bytes: 1024},
  ];
  const form = baseLeadForm([['attachments', JSON.stringify(attachments)]]);
  const req = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: form,
    headers: {origin: 'https://redwan.work', host: 'redwan.work'},
  });

  const res = await POST(req);
  assert.equal(res.status, 200);
  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].attachments.length, 1);
  assert.equal(state.leads[0].attachments[0].key, validKey);

  // Size mismatch in stored object (e.g. wire claims 1024, but stored is 2048) -> 400
  resetState();
  state.storedObjects.set(validKey, 2048);
  const formMismatch = baseLeadForm([['attachments', JSON.stringify(attachments)]]);
  const reqMismatch = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: formMismatch,
    headers: {origin: 'https://redwan.work', host: 'redwan.work'},
  });
  const resMismatch = await POST(reqMismatch);
  assert.equal(resMismatch.status, 400);
  assert.match((await resMismatch.json()).error, /Attachment data is invalid/);
  assert.equal(state.leads.length, 0);

  // Foreign ticket key submitted in contact route -> 400
  resetState();
  const ticketKey = 'private/user-uuid/ticket_123/attachment.pdf';
  state.storedObjects.set(ticketKey, 1024);
  const formForeign = baseLeadForm([
    ['attachments', JSON.stringify([{key: ticketKey, filename: 'spec.pdf', mime: 'application/pdf', size_bytes: 1024}])],
  ]);
  const reqForeign = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: formForeign,
    headers: {origin: 'https://redwan.work', host: 'redwan.work'},
  });
  const resForeign = await POST(reqForeign);
  assert.equal(resForeign.status, 400);
  assert.equal(state.leads.length, 0);
});

// -----------------------------------------------------------------------------
// 6. Lead Persistence Masking & Fail-Closed Errors
// -----------------------------------------------------------------------------
test('contact route: database failure returns generic 502 without leaking postgres errors', async () => {
  resetState();
  state.dbInsertError = {message: 'internal postgres error: violates check constraint leads_summary_check'};
  const form = baseLeadForm();
  const req = new NextRequest('https://redwan.work/api/contact', {
    method: 'POST',
    body: form,
    headers: {origin: 'https://redwan.work', host: 'redwan.work'},
  });

  const res = await POST(req);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.match(data.error, /We could not process your message right now/);
  assert.equal(JSON.stringify(data).includes('violates check constraint'), false);
});
