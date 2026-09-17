import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
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
  '@/lib/supabase/server': 'export async function createSupabaseServerClient(){const f=globalThis.__recoveryControls;return {auth:{async resetPasswordForEmail(email,options){f.calls.push({email,options});return f.resetResult;},async signInWithOtp(params){f.magicOtpCalls.push(params);return f.magicOtpResult;},async verifyOtp(params){f.verifyCalls.push(params);if(f.verifyResult?.error)return f.verifyResult;if(f.consumedTokens.has(params.token_hash))return {data:{user:null,session:null},error:{message:"Token already used or expired"}};f.consumedTokens.add(params.token_hash);f.sessionUser={sub:"usr-synthetic",role:f.claims?.data?.claims?.app_metadata?.role||"client"};return {data:{user:{id:"usr-synthetic"},session:{}},error:null};},async updateUser(params){f.updateCalls.push(params);return f.updateResult;},async getClaims(){if(f.sessionUser)return {data:{claims:{sub:f.sessionUser.sub,app_metadata:{role:f.claims?.data?.claims?.app_metadata?.role||f.sessionUser.role}}},error:null};return f.claims;}}};}',
  '@/lib/supabase/admin': 'export function getSupabaseAdmin(){return {rpc:async()=>{globalThis.__recoveryControls.rateCalls++;return globalThis.__recoveryControls.rate;}};}',
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

  // updateUser failure consumes single-use token and establishes recovery session with recovery_proof cookie
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not update your password. Try again.'});
  assert.deepEqual(f.updateCalls, [{password: 'valid-password-123'}]);
  assert.equal(f.consumedTokens.has('valid-tok'), true);
  assert.ok(f.sessionUser);
  assert.ok(f.cookieStore.has('recovery_proof'), 'recovery_proof cookie must be set on initial verifyOtp success');

  // Wrong-user session retry fails closed: recovery_proof was for user A, but active session belongs to user B
  const initialProof = f.cookieStore.get('recovery_proof');
  f.sessionUser = {sub: 'different-user-B', role: 'client'};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1); // updateUser not invoked for wrong user

  // Wrong-token retry fails closed: recovery_proof was for valid-tok, form submits wrong-token
  f.consumedTokens.add('wrong-tok');
  f.sessionUser = {sub: 'usr-synthetic', role: 'client'};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'wrong-tok', password: 'valid-password-wrong', confirm: 'valid-password-wrong'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Expired session retry fails closed: recovery_proof missing from cookies
  f.cookieStore.delete('recovery_proof');
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-789', confirm: 'valid-password-789'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Restore matching recovery_proof for legitimate retry: same session, same user, same token succeeds
  f.cookieStore.set('recovery_proof', initialProof);
  f.updateResult = {error: null};
  assert.deepEqual(await callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'valid-tok', password: 'valid-password-456', confirm: 'valid-password-456'})), {redirect: '/portal'});
  assert.equal(f.updateCalls.length, 2);
  assert.equal(f.updateCalls[1].password, 'valid-password-456');
  assert.equal(f.cookieStore.has('recovery_proof'), false, 'recovery_proof cookie must be deleted on success');

  // Admin role recovery redirect
  f.consumedTokens.delete('admin-tok');
  f.sessionUser = {sub: 'usr-admin', role: 'admin'};
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

  // updateUser failure maps to safe message while consuming token and establishing session with invite_proof cookie
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not save your password. Try again.'});
  assert.equal(f.consumedTokens.has('valid-invite-tok'), true);
  assert.ok(f.sessionUser);
  assert.ok(f.cookieStore.has('invite_proof'));

  // Wrong-user session retry fails closed
  f.sessionUser = {sub: 'wrong-user-c', role: 'client'};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-hijack', confirm: 'valid-password-hijack'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 1);

  // Legitimate retry with matching session succeeds and clears cookie
  f.sessionUser = {sub: 'usr-synthetic', role: 'client'};
  f.updateResult = {error: null};
  assert.deepEqual(await callAction(acceptInviteAction, {}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-456', confirm: 'valid-password-456'})), {redirect: '/portal'});
  assert.equal(f.updateCalls.length, 2);
  assert.equal(f.updateCalls[1].password, 'valid-password-456');
  assert.equal(f.cookieStore.has('invite_proof'), false);

  // Unauthenticated caller submitting already-consumed invite token fails closed
  f.sessionUser = null;
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-789', confirm: 'valid-password-789'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.equal(f.updateCalls.length, 2);
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
