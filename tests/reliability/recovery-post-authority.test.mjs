import assert from 'node:assert/strict';
import test, {after, beforeEach} from 'node:test';
import {registerHooks} from 'node:module';

const actor = '11111111-1111-4111-8111-111111111111';
const importId = '22222222-2222-4222-8222-222222222222';
const result = {projectId: null, fileIds: ['33333333-3333-4333-8333-333333333333']};
const state = {};
globalThis.__recoveryPostAuthority = state;
beforeEach(() => Object.assign(state, {
  session: {userId: actor, email: 'synthetic@example.test', role: 'admin'},
  profile: {role: 'admin', is_active: true}, profileError: null,
  user: {id: actor, banned_until: null}, authError: null, authThrows: false,
  row: {id: importId, actor, result}, authCalls: [], reads: [], rpcCalls: 0,
}));
const modules = {
  'server-only': 'export {};',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__recoveryPostAuthority.session;}',
  '@/lib/supabase/admin': `
    export function getSupabaseAdmin() {
      const state = globalThis.__recoveryPostAuthority;
      return {
        auth: {admin: {async getUserById(id) {
          state.authCalls.push(id);
          if (state.authThrows) throw new Error('Synthetic private Auth error');
          return {data: {user: state.user}, error: state.authError};
        }}},
        from(table) {
          const filters = {};
          const query = {
            select(){return query;}, eq(key,value){filters[key]=value;return query;},
            async maybeSingle() {
              if (table === 'profiles') return {data: state.profile, error: state.profileError};
              state.reads.push({table, filters});
              if (table !== 'recovery_imports') throw new Error('Unexpected synthetic table');
              const row = state.row;
              return {data: row && row.id === filters.id && row.actor === filters.actor ? row : null, error: null};
            },
          };
          return query;
        },
        async rpc(){state.rpcCalls++;throw new Error('Completed replay must not call a write RPC');},
      };
    }
  `,
  'next/server': 'export class NextRequest {} export const NextResponse={json:(body,init)=>Response.json(body,init)};',
  '@/lib/r2': `export async function presignPrivateGet(){throw new Error('Unexpected signing');}
    export async function presignPrivatePut(){throw new Error('Unexpected signing');}`,
  '@/lib/crm/recovery-storage': `
    export async function readRecoveryBytes(){throw new Error('Unexpected storage read');}
    export async function writeRecoveryBytes(){throw new Error('Unexpected storage write');}
    export async function writeRestoredObject(){throw new Error('Unexpected object write');}
  `,
  '@/lib/crm/recovery-archive': 'export const RECOVERY_MAX_BYTES=104857600; export function decodeRecoveryArchive(){throw new Error("Unexpected archive decode");}',
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(modules, specifier)) {
      return {url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true};
    }
    if (specifier === '@/lib/crm/workflow-access') {
      return {url: new URL('../../lib/crm/workflow-access.ts', import.meta.url).href, shortCircuit: true};
    }
    return next(specifier, context);
  },
});
const {POST} = await import('../../app/api/recovery/route.ts');
after(() => {hooks.deregister();delete globalThis.__recoveryPostAuthority;});

function request(origin = 'http://app.test') {
  const url = new URL('http://app.test/api/recovery');
  const request = new Request(url, {
    method: 'POST', headers: {origin, 'content-type': 'application/json'},
    body: JSON.stringify({action: 'restore', id: importId}),
  });
  Object.defineProperty(request, 'nextUrl', {value: url});
  return request;
}
async function assertDenied() {
  const response = await POST(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {error: 'Unauthorized.'});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(state.reads, [], 'denial must precede even completed-import reads');
  assert.equal(state.rpcCalls, 0);
}

for (const [name, value] of [
  ['future ban', '2999-01-01T00:00:00Z'], ['malformed ban', 'bad-date'],
  ['empty ban', ''], ['non-string ban', 42],
]) {
  test(`completed restore POST rejects ${name} before returning saved results`, async () => {
    state.user.banned_until = value;
    await assertDenied();
    assert.deepEqual(state.authCalls, [actor]);
  });
}
for (const mode of ['error', 'throw', 'missing', 'mismatched']) {
  test(`completed restore POST fails closed on Auth ${mode}`, async () => {
    if (mode === 'error') state.authError = {message: 'Synthetic private provider error'};
    if (mode === 'throw') state.authThrows = true;
    if (mode === 'missing') state.user = null;
    if (mode === 'mismatched') state.user.id = importId;
    await assertDenied();
  });
}
for (const [name, value] of [
  ['unbanned', null], ['omitted ban', undefined], ['expired ban', '2000-01-01T00:00:00Z'],
]) {
  test(`completed restore POST remains idempotent for ${name} current admin`, async () => {
    state.user.banned_until = value;
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {result});
    assert.deepEqual(state.authCalls, [actor]);
    assert.deepEqual(state.reads, [{table: 'recovery_imports', filters: {id: importId, actor}}]);
    assert.equal(state.rpcCalls, 0);
  });
}
test('completed replay rechecks a new ban, and an explicit unban restores access', async () => {
  assert.equal((await POST(request())).status, 200);
  state.reads = [];
  state.user.banned_until = '2999-01-01T00:00:00Z';
  await assertDenied();
  state.user.banned_until = null;
  const restored = await POST(request());
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), {result});
  assert.deepEqual(state.authCalls, [actor, actor, actor]);
});
for (const mode of ['anonymous', 'client', 'inactive', 'role-change', 'profile-error']) {
  test(`completed replay rejects ${mode} before current Auth lookup`, async () => {
    if (mode === 'anonymous') state.session = null;
    if (mode === 'client') state.session.role = 'client';
    if (mode === 'inactive') state.profile.is_active = false;
    if (mode === 'role-change') state.profile.role = 'client';
    if (mode === 'profile-error') state.profileError = {message: 'Synthetic error'};
    await assertDenied();
    assert.deepEqual(state.authCalls, []);
  });
}
test('completed replay remains actor-scoped for an active different admin', async () => {
  state.row.actor = importId;
  const response = await POST(request());
  assert.equal(response.status, 400);
  assert.equal(state.rpcCalls, 0);
  assert.deepEqual(state.authCalls, [actor]);
  assert.equal(state.reads[0].filters.actor, actor);
});
test('cross-origin completed replay is rejected before any session or Auth query', async () => {
  const response = await POST(request('http://other.test'));
  assert.equal(response.status, 403);
  assert.deepEqual(state.authCalls, []);
  assert.deepEqual(state.reads, []);
  assert.equal(state.rpcCalls, 0);
});
