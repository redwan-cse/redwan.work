import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

const f = {
  rate: {data: true, error: null},
  rateCalls: 0,
  calls: [],
  magicOtpCalls: [],
  verifyCalls: [],
  updateCalls: [],
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
  'next/headers': 'export async function headers(){return new Headers({host:"attacker.invalid","x-forwarded-host":"attacker.invalid","x-forwarded-for":"synthetic"});}',
  '@/lib/supabase/server': 'export async function createSupabaseServerClient(){const f=globalThis.__recoveryControls;return {auth:{async resetPasswordForEmail(email,options){f.calls.push({email,options});return f.resetResult;},async signInWithOtp(params){f.magicOtpCalls.push(params);return f.magicOtpResult;},async verifyOtp(params){f.verifyCalls.push(params);return f.verifyResult;},async updateUser(params){f.updateCalls.push(params);return f.updateResult;},async getClaims(){return f.claims;}}};}',
  '@/lib/supabase/admin': 'export function getSupabaseAdmin(){return {rpc:async()=>{globalThis.__recoveryControls.rateCalls++;return globalThis.__recoveryControls.rate;}};}',
  '@/lib/contact/lead-schema': 'export async function sha256Hex(){return "synthetic-hash";}',
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

  // Missing token
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});

  // Password < 12 characters: verifyOtp must NOT be called (preserves single-use token)
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'tok-123', password: 'short', confirm: 'short'})), {error: 'Password must be at least 12 characters.'});
  assert.equal(f.verifyCalls.length, 0);

  // Password confirmation mismatch: verifyOtp must NOT be called
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'tok-123', password: 'valid-password-123', confirm: 'mismatch-123'})), {error: 'Passwords do not match.'});
  assert.equal(f.verifyCalls.length, 0);

  // verifyOtp failure (expired or replayed token)
  f.verifyResult = {error: {message: 'Token expired'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'expired-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.deepEqual(f.verifyCalls, [{type: 'recovery', token_hash: 'expired-tok'}]);
  assert.equal(f.updateCalls.length, 0);

  // updateUser failure maps to safe message without diagnostic leakage
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await setNewPasswordFromRecoveryAction({}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not update your password. Try again.'});
  assert.deepEqual(f.updateCalls, [{password: 'valid-password-123'}]);

  // Success redirects to role home
  f.updateResult = {error: null};
  f.claims = {data: {claims: {app_metadata: {role: 'client'}}}, error: null};
  assert.deepEqual(await callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {redirect: '/portal'});

  f.claims = {data: {claims: {app_metadata: {role: 'admin'}}}, error: null};
  assert.deepEqual(await callAction(setNewPasswordFromRecoveryAction, {}, makeForm({token_hash: 'valid-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {redirect: '/admin'});
});

test('invite acceptance validates password before token consumption and handles failures cleanly', async () => {
  f.verifyResult = {error: null};
  f.updateResult = {error: null};
  f.verifyCalls = [];
  f.updateCalls = [];

  // Missing token
  assert.deepEqual(await acceptInviteAction({}, makeForm({password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});

  // Password validation preserves single-use token
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'invite-tok', password: 'short', confirm: 'short'})), {error: 'Password must be at least 12 characters.'});
  assert.equal(f.verifyCalls.length, 0);

  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'invite-tok', password: 'valid-password-123', confirm: 'mismatch-123'})), {error: 'Passwords do not match.'});
  assert.equal(f.verifyCalls.length, 0);

  // verifyOtp failure
  f.verifyResult = {error: {message: 'Token expired'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'expired-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'This link is invalid or has expired. Ask for a new one.'});
  assert.deepEqual(f.verifyCalls, [{type: 'invite', token_hash: 'expired-invite-tok'}]);
  assert.equal(f.updateCalls.length, 0);

  // updateUser failure maps to safe message
  f.verifyResult = {error: null};
  f.updateResult = {error: {message: 'synthetic provider error'}};
  assert.deepEqual(await acceptInviteAction({}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {error: 'Could not save your password. Try again.'});

  // Success redirects to role home
  f.updateResult = {error: null};
  f.claims = {data: {claims: {app_metadata: {role: 'client'}}}, error: null};
  assert.deepEqual(await callAction(acceptInviteAction, {}, makeForm({token_hash: 'valid-invite-tok', password: 'valid-password-123', confirm: 'valid-password-123'})), {redirect: '/portal'});
});

test('magic link token consumption rejects empty tokens without consuming rate limit and verifies securely', async () => {
  f.rate = {data: true, error: null};
  f.verifyResult = {error: null};
  f.rateCalls = 0;
  f.verifyCalls = [];

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

  f.claims = {data: {claims: {app_metadata: {role: 'admin'}}}, error: null};
  assert.deepEqual(await consumeMagicLinkTokenAction('valid-tok'), {ok: true, home: '/admin'});
});
