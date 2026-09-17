import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash, createHmac} from 'node:crypto';
import test from 'node:test';

const f = {
  rate: {data: true, error: null},
  rateCalls: 0,
  calls: [],
  magicOtpCalls: [],
  verifyCalls: [],
  updateCalls: [],
  sessionUser: null,
  consumedTokens: new Set(),
  consumedRetryKeys: new Set(),
  cookieStore: new Map(),
  claims: {data: {claims: {app_metadata: {role: 'client'}}}, error: null},
  magicOtpResult: {error: null},
  resetResult: {error: null},
  verifyResult: {error: null},
  updateResult: {error: null},
  redirects: [],
};
globalThis.__recoveryControls = f;

const modules = {
  'next/navigation': 'export function redirect(dest){globalThis.__recoveryControls.redirects.push(dest);throw Object.assign(new Error("Synthetic redirect"),{destination:dest});}',
  'next/headers': `
    export async function headers(){return new Headers({host:"attacker.invalid","x-forwarded-host":"attacker.invalid","x-forwarded-for":"synthetic"});}
    export async function cookies(){
      const f=globalThis.__recoveryControls;
      return {
        get(name){return f.cookieStore.has(name)?{value:f.cookieStore.get(name)}:undefined;},
        set(name,value){f.cookieStore.set(name,value);},
        delete(name){f.cookieStore.delete(name);}
      };
    }
  `,
  '@/lib/supabase/server': 'export async function createSupabaseServerClient(){const f=globalThis.__recoveryControls;return {auth:{async resetPasswordForEmail(email,options){f.calls.push({email,options});return f.resetResult;},async signInWithOtp(params){f.magicOtpCalls.push(params);return f.magicOtpResult;},async verifyOtp(params){f.verifyCalls.push(params);if(f.verifyResult?.error)return f.verifyResult;if(f.consumedTokens.has(params.token_hash))return {data:{user:null,session:null},error:{message:"Token already used or expired"}};f.consumedTokens.add(params.token_hash);f.sessionUser={sub:"usr-synthetic",sessionId:f.sessionUser?.sessionId||"sess-synthetic",role:f.claims?.data?.claims?.app_metadata?.role||"client"};return {data:{user:{id:"usr-synthetic"},session:{id:f.sessionUser.sessionId}},error:null};},async updateUser(params){f.updateCalls.push(params);return f.updateResult;},async getClaims(){if(f.sessionUser)return {data:{claims:{sub:f.sessionUser.sub,session_id:f.sessionUser.sessionId||"sess-synthetic",app_metadata:{role:f.claims?.data?.claims?.app_metadata?.role||f.sessionUser.role}}},error:null};return f.claims;}}};}',
  '@/lib/supabase/admin': `export function getSupabaseAdmin(){
    const f=globalThis.__recoveryControls;
    return {
      rpc: async (name, params) => {
        if (name === 'consume_rate_limit') {
          f.rateCalls++;
          return f.rate;
        }
        if (name === 'claim_auth_retry_nonce') {
          f.claimCalls = (f.claimCalls || 0) + 1;
          if (f.claimRpcError) return { data: null, error: f.claimRpcError };
          if (f.consumedRetryKeys.has(params?.p_nonce_hash)) {
            return { data: false, error: null };
          }
          f.consumedRetryKeys.add(params?.p_nonce_hash);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      }
    };
  }`,
  '@/lib/contact/lead-schema': `
    import {createHash} from 'node:crypto';
    export async function sha256Hex(s){return createHash('sha256').update(String(s)).digest('hex');}
  `,
};

const hooks = registerHooks({
  resolve(s, c, n) {
    return Object.hasOwn(modules, s)
      ? {url: `data:text/javascript,${encodeURIComponent(modules[s])}`, shortCircuit: true}
      : n(s, c);
  },
});

const {
  requestPasswordResetAction,
  requestMagicLinkAction,
  setNewPasswordFromRecoveryAction,
  acceptInviteAction,
  consumeMagicLinkTokenAction,
} = await import('../../lib/auth/actions.ts');
hooks.deregister();

function makeForm(fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.set(k, v);
  }
  return form;
}

async function callAction(action, prev, form) {
  try {
    return await action(prev, form);
  } catch (err) {
    if (typeof err?.destination === 'string') return {redirect: err.destination};
    throw err;
  }
}

test('reset email fails closed on rate errors and never trusts forwarded origin', async () => {
  process.env.LEAD_IP_HASH_SALT = 'synthetic';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
  f.resetResult = {error: null};

  // Empty email
  f.calls = [];
  f.rateCalls = 0;
  assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: ''})), {error: 'Email is required.'});
  assert.equal(f.rateCalls, 0);
  assert.equal(f.calls.length, 0);

  // Rate errors
  for (const rate of [{data: false, error: null}, {data: null, error: null}, {data: true, error: {message: 'synthetic-private-error'}}]) {
    f.rate = rate;
    f.calls = [];
    assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Too many requests. Please try again later.'});
    assert.equal(f.calls.length, 0);
  }

  // Missing salt fails closed
  delete process.env.LEAD_IP_HASH_SALT;
  f.rate = {data: true, error: null};
  f.calls = [];
  assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Too many requests. Please try again later.'});
  assert.equal(f.calls.length, 0);
  process.env.LEAD_IP_HASH_SALT = 'synthetic';

  // Upstream 429
  f.resetResult = {error: {status: 429, message: 'Too many requests'}};
  assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Too many requests. Please wait a minute and try again.'});

  // Upstream error or success returns uniform notice
  f.resetResult = {error: {message: 'User not found'}};
  assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'notfound@example.test'})), {notice: 'If that address has an account, a reset link is on its way.'});

  f.resetResult = {error: null};
  f.calls = [];
  assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'synthetic@example.test'})), {notice: 'If that address has an account, a reset link is on its way.'});
  assert.deepEqual(f.calls, [{email: 'synthetic@example.test', options: {redirectTo: 'https://example.test/reset-password'}}]);
});

test('missing or credential-bearing configured origins never send', async () => {
  f.rate = {data: true, error: null};
  f.resetResult = {error: null};
  for (const origin of ['', 'https://user:secret@example.test', 'https://example.test/path', 'http://example.test', 'https://example.test?foo=1', 'https://example.test#hash']) {
    f.calls = [];
    process.env.NEXT_PUBLIC_SITE_URL = origin;
    assert.deepEqual(await requestPasswordResetAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Password recovery is temporarily unavailable. Please try again later.'});
    assert.equal(f.calls.length, 0);
  }
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
});

test('magic link action validates inputs, rate-limits, and enforces shouldCreateUser false', async () => {
  process.env.LEAD_IP_HASH_SALT = 'synthetic';
  f.rate = {data: true, error: null};
  f.magicOtpResult = {error: null};

  // Missing email
  f.magicOtpCalls = [];
  f.rateCalls = 0;
  assert.deepEqual(await requestMagicLinkAction({}, makeForm({email: ''})), {error: 'Email is required.'});
  assert.equal(f.rateCalls, 0);
  assert.equal(f.magicOtpCalls.length, 0);

  // Rate limit exhaustion
  f.rate = {data: false, error: null};
  assert.deepEqual(await requestMagicLinkAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Too many requests. Please try again later.'});
  assert.equal(f.magicOtpCalls.length, 0);
  f.rate = {data: true, error: null};

  // Upstream 429
  f.magicOtpResult = {error: {status: 429, message: 'Rate limit'}};
  assert.deepEqual(await requestMagicLinkAction({}, makeForm({email: 'synthetic@example.test'})), {error: 'Too many requests. Please wait a minute and try again.'});

  // Success: uniform notice and shouldCreateUser === false
  f.magicOtpResult = {error: null};
  f.magicOtpCalls = [];
  assert.deepEqual(await requestMagicLinkAction({}, makeForm({email: 'synthetic@example.test'})), {notice: 'If that address has an account, a sign-in link is on its way.'});
  assert.deepEqual(f.magicOtpCalls, [{email: 'synthetic@example.test', options: {shouldCreateUser: false}}]);
});

test('recovery password update validates password before token consumption and handles failures cleanly', async () => {
  f.verifyResult = {error: null};
  f.updateResult = {error: null};
  f.verifyCalls = [];
  f.updateCalls = [];
  f.sessionUser = null;
  f.consumedTokens.clear();
  f.cookieStore.clear();
  f.claims = {data: {claims: null}, error: null};

  // Missing token
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});

  // Password < 12 characters: verifyOtp must NOT be called (preserves single-use token)
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'tok-123', password: 'short', confirm: 'short'})), {error: 'Password must be at least 12 characters.'});
  assert.equal(f.verifyCalls.length, 0);
  assert.equal(f.consumedTokens.has('tok-123'), false);

  // Password confirmation mismatch: verifyOtp must NOT be called
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'tok-123', password: 'valid-password-123', confirm: 'mismatch-123'})), {error: 'Passwords do not match.'});
  assert.equal(f.verifyCalls.length, 0);
  assert.equal(f.consumedTokens.has('tok-123'), false);

  // verifyOtp failure (expired or unknown token) without established session fails closed
  f.verifyResult = {error: {message: 'Token expired'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'expired-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.deepEqual(f.verifyCalls, [{type: 'recovery', token_hash: 'expired-tok'}]);
  assert.equal(f.updateCalls.length, 0);

  // Unrelated active session submitting a bad token fails closed with INVALID_LINK without touching updateUser
  f.sessionUser = {sub: 'unrelated-user-999', role: 'client'};
  f.verifyResult = {error: {message: 'Token expired'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'unrelated-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 0);
  f.sessionUser = null;

  // updateUser failure consumes single-use token and establishes recovery session with recovery_retry_authority cookie
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not update your password. Try again.'});
  assert.deepEqual(f.updateCalls, [{password: 'valid-password-123'}]);
  assert.equal(f.consumedTokens.has('valid-tok'), true);
  assert.ok(f.sessionUser);
  assert.ok(f.cookieStore.has('recovery_retry_authority'), 'recovery_retry_authority cookie must be set on initial verifyOtp success');

  const validAuthority = f.cookieStore.get('recovery_retry_authority');

  // Forged-cookie attempt: invalid HMAC signature fails closed with INVALID_LINK
  f.cookieStore.set('recovery_retry_authority', validAuthority + 'tampered-sig');
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Forged-cookie attempt: forged with wrong secret fails closed
  const fakePayload = Buffer.from(JSON.stringify({p: 'recovery', sub: 'usr-synthetic', tok: 'valid-tok', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'forged-nonce'})).toString('base64url');
  const fakeSig = createHmac('sha256', 'wrong-secret').update(fakePayload).digest('base64url');
  f.cookieStore.set('recovery_retry_authority', `${fakePayload}.${fakeSig}`);
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Tampered-payload attempt: modified user/token with original signature fails closed
  const tamperedPayload = Buffer.from(JSON.stringify({p: 'recovery', sub: 'different-user', tok: 'valid-tok', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'tampered-nonce'})).toString('base64url');
  f.cookieStore.set('recovery_retry_authority', `${tamperedPayload}.${validAuthority.split('.')[1]}`);
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Expired authority attempt: exp in the past fails closed
  const expiredPayload = Buffer.from(JSON.stringify({p: 'recovery', sub: 'usr-synthetic', tok: 'valid-tok', exp: Math.floor(Date.now() / 1000) - 10, nonce: 'expired-nonce'})).toString('base64url');
  const expiredSig = createHmac('sha256', process.env.LEAD_IP_HASH_SALT).update(expiredPayload).digest('base64url');
  f.cookieStore.set('recovery_retry_authority', `${expiredPayload}.${expiredSig}`);
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Session-ID binding: same user ID, but different session ID fails closed
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-different-device', role: 'client'};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Wrong-user session retry fails closed: authority was for user A, but active session belongs to user B
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  f.sessionUser = {sub: 'different-user-B', sessionId: 'sess-synthetic', role: 'client'};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Wrong-token retry fails closed: authority was for valid-tok, form submits wrong-token
  f.consumedTokens.add('wrong-tok');
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-synthetic', role: 'client'};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'wrong-tok', password: 'valid-password-wrong', confirm: 'valid-password-wrong'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Expired/missing authority retry fails closed
  f.cookieStore.delete('recovery_retry_authority');
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-789', confirm: 'valid-password-789'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Concurrent replay: two requests submit the same retry authority simultaneously
  // Exactly one can consume the atomic nonce; the other must fail closed without executing updateUser.
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-synthetic', role: 'client'};
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  f.updateResult = {error: null};
  const [res1, res2] = await Promise.all([
    callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'valid-tok', password: 'valid-password-conc1', confirm: 'valid-password-conc1'})),
    callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'valid-tok', password: 'valid-password-conc2', confirm: 'valid-password-conc2'}))
  ]);
  const successes = [res1, res2].filter(r => r?.redirect === '/portal');
  const failures = [res1, res2].filter(r => r?.error === 'This link is invalid or has expired. Ask for a new one.');
  assert.equal(successes.length, 1, 'Exactly one concurrent request must succeed');
  assert.equal(failures.length, 1, 'Concurrent replay attempt must fail closed with INVALID_LINK');
  assert.equal(f.updateCalls.length, 2, 'updateUser must be called exactly once across the concurrent attempts');
  assert.equal(f.cookieStore.has('recovery_retry_authority'), false, 'recovery_retry_authority cookie must be deleted on success');

  // Cross-instance replay: Instance 1 already processed the update and consumed the nonce in shared rate_limits.
  // When the replayed token arrives at Instance 2 (sharing the atomic store), it fails closed.
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-xinst', confirm: 'valid-password-xinst'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 2, 'Replay on another instance must not call updateUser');

  // Fail-closed when durable claim fails (no fail-open memory fallback)
  f.claimRpcError = {message: 'database connection down'};
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-failclosed', confirm: 'valid-password-failclosed'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 2, 'Must never call updateUser when durable claim fails');
  f.claimRpcError = null;

  // Ambiguous provider failure: if updateUser fails during retry, authority is consumed and NEVER reopened
  f.consumedTokens.delete('failover-tok');
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'ambiguous provider failure 1'}};
  // Initial attempt consumes the OTP token and sets authority cookie
  await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'failover-tok', password: 'valid-password-f1', confirm: 'valid-password-f1'}));
  assert.ok(f.cookieStore.has('recovery_retry_authority'), 'Authority cookie set for initial retry');
  
  // User attempts retry with authority token: atomic claim succeeds, cookie is deleted, updateUser fails with ambiguous error
  f.verifyResult = {error: {message: 'Token already used or expired'}};
  const failRes = await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'failover-tok', password: 'valid-password-f2', confirm: 'valid-password-f2'}));
  assert.deepEqual(failRes, {error: 'Could not update your password. Try again.'});
  assert.equal(f.cookieStore.has('recovery_retry_authority'), false, 'Authority cookie must be deleted immediately upon consumption');

  // Any subsequent retry attempt (replaying the token or cookie) must fail closed — authority is NEVER reopened
  f.cookieStore.set('recovery_retry_authority', validAuthority);
  const replayAfterFail = await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-f3', confirm: 'valid-password-f3'}));
  assert.deepEqual(replayAfterFail, {error: 'This link is invalid or has expired. Ask for a new one.'}, 'Authority must never be reopened after ambiguous provider failure');

  // Admin role recovery redirect
  f.consumedTokens.delete('admin-tok');
  f.verifyResult = {error: null};
  f.updateResult = {error: null};
  f.sessionUser = {sub: 'usr-admin', sessionId: 'sess-admin', role: 'admin'};
  f.claims = {data: {claims: {app_metadata: {role: 'admin'}}}, error: null};
  assert.deepEqual(await callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'admin-tok', password: 'valid-password-adm', confirm: 'valid-password-adm'})), {redirect: '/admin'});
});

test('invite acceptance validates password before token consumption and handles failures cleanly', async () => {
  f.verifyResult = {error: null};
  f.updateResult = {error: null};
  f.verifyCalls = [];
  f.updateCalls = [];
  f.sessionUser = null;
  f.consumedTokens.clear();
  f.cookieStore.clear();
  f.claims = {data: {claims: null}, error: null};

  // Missing token
  assert.deepEqual(await acceptInviteAction({}, makeForm({password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});

  // Password validation preserves single-use token
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'invite-tok', password: 'short', confirm: 'short'})), {error: 'Password must be at least 12 characters.'});
  assert.equal(f.verifyCalls.length, 0);
  assert.equal(f.consumedTokens.has('invite-tok'), false);

  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'invite-tok', password: 'valid-password-123', confirm: 'mismatch-123'})), {error: 'Passwords do not match.'});
  assert.equal(f.verifyCalls.length, 0);
  assert.equal(f.consumedTokens.has('invite-tok'), false);

  // verifyOtp failure
  f.verifyResult = {error: {message: 'Token expired'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'expired-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.deepEqual(f.verifyCalls, [{type: 'invite', token_hash: 'expired-invite-tok'}]);
  assert.equal(f.updateCalls.length, 0);

  // Unrelated active session submitting invalid invite token fails closed without touching updateUser
  f.sessionUser = {sub: 'unrelated-user-888', role: 'client'};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'expired-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 0);
  f.sessionUser = null;

  // updateUser failure maps to safe message while consuming token and establishing session with invite_retry_authority cookie
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not save your password. Try again.'});
  assert.equal(f.consumedTokens.has('valid-invite-tok'), true);
  assert.ok(f.sessionUser);
  assert.ok(f.cookieStore.has('invite_retry_authority'));

  const validInviteAuthority = f.cookieStore.get('invite_retry_authority');

  // Forged invite authority fails closed
  f.cookieStore.set('invite_retry_authority', validInviteAuthority + 'fake');
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Session-ID binding for invite: same user, different session fails closed
  f.cookieStore.set('invite_retry_authority', validInviteAuthority);
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-different-invite', role: 'client'};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Wrong-user session retry fails closed
  f.cookieStore.set('invite_retry_authority', validInviteAuthority);
  f.sessionUser = {sub: 'wrong-user-c', sessionId: 'sess-synthetic', role: 'client'};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Legitimate retry with matching session succeeds and clears cookie
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-synthetic', role: 'client'};
  f.updateResult = {error: null};
  assert.deepEqual(await callAction(acceptInviteAction, {}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-456', confirm: 'valid-password-456'})), {redirect: '/portal'});
  assert.equal(f.updateCalls.length, 2);
  assert.equal(f.updateCalls[1].password, 'valid-password-456');
  assert.equal(f.cookieStore.has('invite_retry_authority'), false);

  // Replay attempt on consumed invite authority fails closed
  f.cookieStore.set('invite_retry_authority', validInviteAuthority);
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-replay', confirm: 'valid-password-replay'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 2);

  // Ambiguous provider failure on invite retry: authority is consumed and NEVER reopened
  f.consumedTokens.delete('failover-invite-tok');
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'ambiguous provider failure'}};
  f.sessionUser = {sub: 'usr-synthetic', sessionId: 'sess-synthetic', role: 'client'};
  // Initial attempt consumes the OTP token and sets authority cookie
  await acceptInviteAction({}, makeForm({token_hash: 'failover-invite-tok', password: 'valid-password-f1', confirm: 'valid-password-f1'}));
  assert.ok(f.cookieStore.has('invite_retry_authority'), 'Authority cookie set on initial failure');
  // Retry consumes authority and encounters ambiguous failure
  f.verifyResult = {error: {message: 'Token already used or expired'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'failover-invite-tok', password: 'valid-password-f2', confirm: 'valid-password-f2'})), {error: 'Could not save your password. Try again.'});
  assert.equal(f.cookieStore.has('invite_retry_authority'), false, 'Authority cookie must be deleted upon consumption');
  // Subsequent attempt fails closed — authority is never reopened
  f.cookieStore.set('invite_retry_authority', validInviteAuthority);
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-f3', confirm: 'valid-password-f3'})), {error: 'This link is invalid or has expired. Ask for a new one.'});

  // Unauthenticated caller submitting already-consumed invite token fails closed
  f.sessionUser = null;
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-789', confirm: 'valid-password-789'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 4);
});

test('magic link token consumption rejects empty tokens without consuming rate limit and verifies securely', async () => {
  f.rate = {data: true, error: null};
  f.verifyResult = {error: null};
  f.rateCalls = 0;
  f.verifyCalls = [];
  f.sessionUser = null;
  f.consumedTokens.clear();

  // Empty or missing token rejects without consuming rate limit
  assert.deepEqual(await consumeMagicLinkTokenAction(''), {ok: false, error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.rateCalls, 0);
  assert.equal(f.verifyCalls.length, 0);

  // Rate limit failure
  f.rate = {data: false, error: null};
  assert.deepEqual(await consumeMagicLinkTokenAction('tok-123'), {ok: false, error: 'Too many requests. Please try again later.'});
  assert.equal(f.verifyCalls.length, 0);
  f.rate = {data: true, error: null};

  // verifyOtp failure
  f.verifyResult = {error: {message: 'Invalid OTP'}};
  assert.deepEqual(await consumeMagicLinkTokenAction('bad-tok'), {ok: false, error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.deepEqual(f.verifyCalls, [{type: 'magiclink', token_hash: 'bad-tok'}]);

  // Success returns role home
  f.verifyResult = {error: null};
  f.claims = {data: {claims: {app_metadata: {role: 'client'}}}, error: null};
  assert.deepEqual(await consumeMagicLinkTokenAction('valid-tok'), {ok: true, home: '/portal'});

  f.sessionUser = null;
  f.consumedTokens.delete('valid-tok-admin');
  f.claims = {data: {claims: {app_metadata: {role: 'admin'}}}, error: null};
  assert.deepEqual(await consumeMagicLinkTokenAction('valid-tok-admin'), {ok: true, home: '/admin'});
});
