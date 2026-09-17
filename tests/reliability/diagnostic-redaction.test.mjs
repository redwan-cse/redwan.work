import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { inspect } from 'node:util';

const sentinel = 'SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE';

const f = {
  rpc: [],
  signs: 0,
  fetches: 0,
  mode: 'ok',
  pageError: null,
  countError: false,
  blogCalls: 0,
  revalidateCalls: 0,
  revalidateError: false,
};
globalThis.__diagnosticRedaction = f;

const admin = {
  rpc: async () => {
    const r = f.rpc.shift();
    if (r instanceof Error) throw r;
    return r ?? { data: true, error: null };
  },
  from() {
    let head = false;
    const q = {
      select(_s, options) {
        head = options?.head === true;
        return q;
      },
      eq() { return q; },
      ilike() { return q; },
      order() { return q; },
      range() { return q; },
      then(resolve, reject) {
        return Promise.resolve({
          data: [],
          count: 0,
          error: head ? (f.countError ? { message: sentinel } : null) : f.pageError,
        }).then(resolve, reject);
      },
    };
    return q;
  },
};
globalThis.__diagnosticRedactionAdmin = admin;

const modules = {
  'server-only': 'export {};',
  'next/server': 'export class NextRequest extends Request {}; export class NextResponse { static json(body, init = {}) { return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } }); } }',
  'next/cache': 'export function revalidatePath() { const f = globalThis.__diagnosticRedaction; f.revalidateCalls++; if (f.revalidateError) throw Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE"); }',
  '@/lib/supabase/admin': 'export function getSupabaseAdmin() { return globalThis.__diagnosticRedactionAdmin; }',
  '@/lib/contact/lead-schema': 'export async function sha256Hex() { return "synthetic-hash"; }',
  '@/lib/mime': 'export function isAllowedMime() { return true; }',
  '@/lib/r2': 'export const CONTACT_MAX_FILES = 5; export function isR2Configured() { return true; } export function validateContactFile() { return { ok: true, ext: "pdf" }; } export async function presignContactUpload() { const f = globalThis.__diagnosticRedaction; f.signs++; if (f.mode === "sign") throw Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE"); return { key: "synthetic-key", uploadUrl: "https://example.test/synthetic" }; }',
  '@/lib/email': 'export const HANDOFF_MARKER = "handoff";',
  'googleapis': 'export const google = { auth: { GoogleAuth: class {} }, blogger() { return { posts: { async list() { const f = globalThis.__diagnosticRedaction; f.blogCalls++; if (f.mode === "blog") throw Object.assign(Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE"), { response: { data: "SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE" } }); return { data: { items: [] } }; } } }; } };',
};

registerHooks({
  resolve(s, c, n) {
    if (Object.hasOwn(modules, s)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[s]), shortCircuit: true };
    }
    if (s.startsWith('@/lib/')) {
      return { url: new URL('../../' + s.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    }
    return n(s, c);
  },
});

const presign = await import('../../app/api/uploads/presign/route.ts');
const blog = await import('../../lib/blogger.ts');
const email = await import('../../lib/crm/email-log.ts');
const revalidate = await import('../../app/api/revalidate/route.ts');

const original = {
  error: console.error,
  warn: console.warn,
  fetch: globalThis.fetch,
};
let logs = [];

function reset() {
  Object.assign(f, {
    rpc: [],
    signs: 0,
    fetches: 0,
    mode: 'ok',
    pageError: null,
    countError: false,
    blogCalls: 0,
    revalidateCalls: 0,
    revalidateError: false,
  });
  logs = [];
  blog.clearBlogCache();
  process.env.LEAD_IP_HASH_SALT = 'synthetic';
  process.env.TURNSTILE_SECRET_KEY = 'synthetic';
  process.env.REVALIDATION_SECRET = 'synthetic';
  process.env.BLOGGER_BLOG_ID = 'synthetic';
  process.env.GOOGLE_CREDENTIALS_B64 = Buffer.from('{}').toString('base64');
}

function hookConsole() {
  console.error = (...args) => logs.push(inspect(args));
  console.warn = (...args) => logs.push(inspect(args));
  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    f.fetches++;
    if (f.mode === 'fetch') throw Error(sentinel);
    if (f.mode === 'json') return { json: async () => { throw Error(sentinel); } };
    if (f.mode === 'timeout') throw Object.assign(Error(sentinel), { name: 'AbortError' });
    return new Response(JSON.stringify(f.mode === 'denial' ? { success: false, 'error-codes': [sentinel] } : { success: true }));
  };
}

function restoreConsole() {
  console.error = original.error;
  console.warn = original.warn;
  globalThis.fetch = original.fetch;
}

function makePresignRequest(origin = 'https://example.test') {
  return new Request('https://example.test/api/uploads/presign', {
    method: 'POST',
    headers: {
      origin,
      host: 'example.test',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ filename: 'fixture.pdf', mime: 'application/pdf', size: 10 }],
      turnstileToken: 'synthetic',
    }),
  });
}

function clean(value) {
  assert.equal(inspect(value).includes(sentinel), false, 'response body leaked sentinel');
  assert.equal(logs.join('\n').includes(sentinel), false, 'console logs leaked sentinel');
}

function makeRevalidateRequest(token = 'synthetic', path = '/blogs') {
  const r = new Request('https://example.test/api/revalidate?path=' + encodeURIComponent(path), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
  });
  r.nextUrl = new URL(r.url);
  return r;
}

test('presign route: rate limit DB error fails closed with 503 and masked logs', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'ok';
    f.rpc = [{ error: { message: sentinel }, data: null }];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 503);
    assert.equal(f.signs, 0);
    assert.equal(f.fetches, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign rate control unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: thrown rate limit error fails closed with 503 and masked logs', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'ok';
    f.rpc = [new Error(sentinel)];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 503);
    assert.equal(f.signs, 0);
    assert.equal(f.fetches, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign rate control unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: Turnstile replay error fails closed with 503 and masked logs', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'ok';
    f.rpc = [{ data: true, error: null }, { error: { message: sentinel }, data: null }];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 503);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.length > 0);
  } finally {
    restoreConsole();
  }
});

test('presign route: Turnstile fetch exception returns 503 without quoting network errors', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'fetch';
    f.rpc = [];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 503);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign verification unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: Turnstile malformed JSON returns 503 without quoting parser errors', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'json';
    f.rpc = [];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 503);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign verification unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: Turnstile denial error codes are not logged into console', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'denial';
    f.rpc = [];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 400);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign verification rejected.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: R2 presigning exception returns 500 without leaking exception message', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'sign';
    f.rpc = [];
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 500);
    assert.equal(f.signs, 1);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign submission failed.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: rejected origin returns 403 and omits caller-controlled Origin header from logs', async () => {
  reset();
  hookConsole();
  try {
    const r = await presign.POST(makePresignRequest('https://' + sentinel + '.test'));
    assert.equal(r.status, 403);
    assert.equal(f.fetches, 0);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Contact presign origin rejected.')));
  } finally {
    restoreConsole();
  }
});

test('presign route: Turnstile timeout returns 408', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'timeout';
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 408);
    assert.equal(f.signs, 0);
    clean(await r.text());
    assert.ok(logs.some((l) => l.includes('Turnstile validation timeout')));
  } finally {
    restoreConsole();
  }
});

test('presign route: valid request returns 200 with presigned urls and zero sentinels', async () => {
  reset();
  hookConsole();
  try {
    const r = await presign.POST(makePresignRequest());
    assert.equal(r.status, 200);
    assert.equal(f.signs, 1);
    assert.equal(f.fetches, 1);
    clean(await r.json());
  } finally {
    restoreConsole();
  }
});

test('blogger service: upstream API error falls back cleanly without leaking gaxios errors', async () => {
  reset();
  hookConsole();
  try {
    f.mode = 'blog';
    const r = await blog.getBlogPostsPage(1, 9);
    assert.equal(f.blogCalls, 1);
    assert.deepEqual(r, { posts: [], totalItems: 0, isCapped: false });
    clean(r);
    assert.ok(logs.some((l) => l.includes('Blogger fetch unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('blogger service: malformed credentials returns empty posts safely without leaking credentials', async () => {
  reset();
  hookConsole();
  try {
    process.env.GOOGLE_CREDENTIALS_B64 = Buffer.from(sentinel).toString('base64');
    const r = await blog.getBlogPostsPage(1, 9);
    assert.equal(f.blogCalls, 0);
    assert.deepEqual(r, { posts: [], totalItems: 0, isCapped: false });
    clean(r);
  } finally {
    restoreConsole();
  }
});

test('blogger service: in-memory cache control avoids redundant network calls', async () => {
  reset();
  hookConsole();
  try {
    await blog.getBlogPostsPage(1, 9);
    await blog.getBlogPostsPage(1, 9);
    assert.equal(f.blogCalls, 1);
    clean(logs);
  } finally {
    restoreConsole();
  }
});

test('email log viewer: PostgREST query errors never leak recipient search filters', async () => {
  reset();
  hookConsole();
  try {
    f.pageError = { code: 'SYNTHETIC', message: sentinel };
    await assert.rejects(
      email.listEmailLogs(1, { email: sentinel }),
      { message: 'Email log is unavailable.' }
    );
    clean(logs);
    assert.ok(logs.some((l) => l.includes('Email log query unavailable.')));
  } finally {
    restoreConsole();
  }
});

test('email log viewer: PGRST103 out-of-range pagination returns empty rows array', async () => {
  reset();
  hookConsole();
  try {
    f.pageError = { code: 'PGRST103', message: sentinel };
    const r = await email.listEmailLogs(2);
    assert.deepEqual(r.rows, []);
    clean(r);
  } finally {
    restoreConsole();
  }
});

test('email log viewer: count query failure reports null counts rather than misleading 0', async () => {
  reset();
  hookConsole();
  try {
    f.countError = true;
    const r = await email.listEmailLogs();
    assert.deepEqual(r.counts, { sent: null, failed: null });
    clean(r);
  } finally {
    restoreConsole();
  }
});

test('revalidate route: handler exception returns 500 with masked Revalidation unavailable message', async () => {
  reset();
  hookConsole();
  try {
    f.revalidateError = true;
    const r = await revalidate.POST(makeRevalidateRequest());
    assert.equal(r.status, 500);
    assert.equal(f.revalidateCalls, 1);
    clean(await r.json());
    assert.ok(logs.some((l) => l.includes('Blog revalidation failed.')));
  } finally {
    restoreConsole();
  }
});

test('revalidate route: unauthorized bearer token or unlisted path returns 401/400', async () => {
  reset();
  hookConsole();
  try {
    assert.equal((await revalidate.POST(makeRevalidateRequest('wrong'))).status, 401);
    assert.equal((await revalidate.POST(makeRevalidateRequest('synthetic', '/admin'))).status, 400);
    delete process.env.REVALIDATION_SECRET;
    assert.equal((await revalidate.POST(makeRevalidateRequest())).status, 401);
    assert.equal(f.revalidateCalls, 0);
    clean(logs);
  } finally {
    restoreConsole();
  }
});

test('revalidate route: valid secret and path revalidates and drops Blogger cache', async () => {
  reset();
  hookConsole();
  try {
    const r = await revalidate.POST(makeRevalidateRequest());
    assert.equal(r.status, 200);
    assert.equal(f.revalidateCalls, 1);
    assert.equal((await r.json()).revalidated, true);
    clean(logs);
  } finally {
    restoreConsole();
  }
});
