import assert from 'node:assert/strict';
import {randomBytes, createPublicKey, verify as verifySignature} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';

// Disposable provider experiment, NOT the application password action.
assert.equal(process.env.DISPOSABLE_PASSWORD_PROOF, 'true');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const mailbox = new URL(process.env.DISPOSABLE_MAILBOX_URL);
for (const [url, port] of [[api, '54321'], [mailbox, '54324']]) {
  assert.ok(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  assert.equal(url.port, port);
  assert.equal(url.href, url.origin + '/');
}
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));
assert.ok(process.env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'));
const options = {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false};
async function localFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok([api.origin, mailbox.origin].includes(url.origin));
  return fetch(input, {...init, redirect: 'error', signal: AbortSignal.timeout(10000)});
}
function client(control = {}, privileged = false) {
  return createClient(api.origin, privileged ? process.env.SUPABASE_SECRET_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: {...options},
    global: {fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const update = init?.method === 'PUT' && url.pathname === '/auth/v1/user';
      if (update) control.updates = (control.updates ?? 0) + 1;
      const logout = url.pathname === '/auth/v1/logout';
      if (logout && url.searchParams.get('scope') === control.failScope) {
        control.faults = (control.faults ?? 0) + 1;
        return new Response('{"msg":"Synthetic transport failure"}', {status: 503, headers: {'Content-Type': 'application/json'}});
      }
      const response = await localFetch(input, init);
      if (update && control.loseUpdateResponse) {
        await response.arrayBuffer();
        return new Response('{"msg":"Synthetic lost response"}', {status: 503, headers: {'Content-Type': 'application/json'}});
      }
      return response;
    }},
  });
}
function data(result) {
  if (result.error) throw new Error('provider_operation_failed');
  return result.data;
}
const admin = client({}, true);
const fixtures = [];
const report = {passed: 0, expected: 10, phase: 'startup', cleanup: false, complete: false};
let jwks;
function claims(token, now = Date.now()) {
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const value = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.ok(['ES256', 'RS256'].includes(header.alg));
  const key = jwks.keys.find(k => k.kid === header.kid);
  assert.ok(key && key.kty !== 'oct');
  assert.ok(!key.alg || key.alg === header.alg);
  assert.ok(verifySignature('sha256', Buffer.from(parts[0] + '.' + parts[1]), {
    key: createPublicKey({key, format: 'jwk'}), dsaEncoding: 'ieee-p1363',
  }, Buffer.from(parts[2], 'base64url')));
  const issuer = new URL(value.iss);
  assert.ok(['localhost', '127.0.0.1'].includes(issuer.hostname));
  assert.equal(issuer.protocol, 'http:');
  assert.equal(issuer.port, '54321');
  assert.equal(issuer.pathname, '/auth/v1');
  assert.equal(value.aud, 'authenticated');
  assert.ok(Number.isInteger(value.exp) && value.exp * 1000 > now);
  assert.ok(!value.nbf || value.nbf * 1000 <= now);
  assert.match(value.session_id, /^[0-9a-f-]{36}$/);
  return value;
}
async function session(c) {
  const value = data(await c.auth.getSession()).session;
  assert.ok(value);
  claims(value.access_token);
  return value;
}
async function refresh(c, id) {
  const value = data(await c.auth.refreshSession()).session;
  assert.ok(value);
  assert.equal(claims(value.access_token).session_id, id);
  return value;
}
async function signIn(c, fixture, password = fixture.password) {
  const value = data(await c.auth.signInWithPassword({email: fixture.email, password}));
  assert.equal(value.user.id, fixture.id);
  return value.session;
}
async function rejectedRefresh(token) {
  const result = await client().auth.refreshSession({refresh_token: token});
  assert.ok(result.error && [400, 401].includes(result.error.status));
  assert.ok(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found'].includes(result.error.code));
  assert.equal(result.data.session, null);
}
async function fixture(withPassword = true) {
  const f = {email: `p1c-${randomBytes(12).toString('hex')}@example.test`, password: randomBytes(24).toString('base64url')};
  fixtures.push(f); // Track email before the request, including an ambiguous creation.
  const result = data(await admin.auth.admin.createUser({
    email: f.email, ...(withPassword ? {password: f.password} : {}), email_confirm: true, app_metadata: {role: 'client'},
  }));
  f.id = result.user.id;
  return f;
}
async function linkedSession(f, type) {
  const link = data(await admin.auth.admin.generateLink({type, email: f.email}));
  assert.ok(link.properties.hashed_token);
  const c = client();
  const result = data(await c.auth.verifyOtp({type, token_hash: link.properties.hashed_token}));
  assert.equal(result.user.id, f.id);
  return c;
}
async function sameCredentials(f, password = f.password) {
  const c = client();
  await signIn(c, f, password);
  data(await c.auth.signOut({scope: 'local'}));
}
// Explicit experiment seam for wrong-user and network-failure cases only.
async function candidate(original, actor, current, next, control = {}) {
  if (!current || next.length < 12) return 'denied';
  const verifier = client(control.verifier ?? {});
  const check = await verifier.auth.signInWithPassword({email: control.verifierEmail ?? actor.email, password: current});
  if (check.error || !check.data.session || !check.data.user) return 'denied';
  control.verifierSession = check.data.session;
  const originalSession = await session(original);
  const bound = check.data.user.id === actor.id &&
    claims(check.data.session.access_token).session_id !== claims(originalSession.access_token).session_id;
  const cleanup = await verifier.auth.signOut({scope: 'local'});
  if (cleanup.error) return 'verification_cleanup_failed';
  if (!bound) return 'identity_denied';
  const update = await original.auth.updateUser({password: next, current_password: current});
  if (update.error) return 'update_unconfirmed';
  if ((await original.auth.signOut({scope: 'others'})).error) return 'changed_revocation_unconfirmed';
  return 'complete';
}
async function group(name, run) {
  report.phase = name;
  await run();
  report.passed++;
}
async function mails(email) {
  const response = await localFetch(mailbox.origin + '/api/v1/search?query=' + encodeURIComponent('to:' + email) + '&limit=100');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.messages) && Number.isInteger(result.total) && result.total <= 100);
  return result.messages.filter(m => m.To?.some(to => to.Address === email));
}
let failure = false;
let residual;
try {
  const response = await localFetch(api.origin + '/auth/v1/.well-known/jwks.json');
  assert.equal(response.status, 200);
  jwks = await response.json();
  assert.ok(jwks.keys.length && jwks.keys.every(k => k.kty !== 'oct'));
  await group('native_field', async () => {
    const f = await fixture(), c = client();
    await signIn(c, f);
    const next = randomBytes(24).toString('base64url');
    data(await c.auth.updateUser({password: next, current_password: 'deliberately-wrong-password'}));
    assert.ok((await client().auth.signInWithPassword({email: f.email, password: f.password})).error);
    await sameCredentials(f, next);
  });
  await group('credential_denial', async () => {
    const f = await fixture(), control = {}, c = client(control), other = client();
    const initial = await signIn(c, f), second = await signIn(other, f);
    for (const password of ['', 'deliberately-wrong-password']) {
      assert.equal(await candidate(c, f, password, randomBytes(24).toString('base64url')), 'denied');
    }
    assert.equal(control.updates ?? 0, 0);
    await refresh(c, claims(initial.access_token).session_id);
    await refresh(other, claims(second.access_token).session_id);
    const unset = await fixture(false), recovery = await linkedSession(unset, 'recovery');
    assert.equal(await candidate(recovery, unset, 'not-an-existing-password', randomBytes(24).toString('base64url')), 'denied');
    data(await recovery.auth.updateUser({password: unset.password}));
    await sameCredentials(unset);
  });
  await group('identity_binding', async () => {
    const a = await fixture(), b = await fixture(), control = {}, c = client(control), seam = {verifierEmail: b.email};
    await signIn(c, a);
    assert.equal(await candidate(c, a, b.password, randomBytes(24).toString('base64url'), seam), 'identity_denied');
    await rejectedRefresh(seam.verifierSession.refresh_token);
    assert.equal(control.updates ?? 0, 0);
    await sameCredentials(a);
    await sameCredentials(b);
  });
  await group('verifier_isolation', async () => {
    const f = await fixture(), c = client(), other = client(), verifier = client();
    const original = await signIn(c, f), second = await signIn(other, f), temporary = await signIn(verifier, f);
    assert.notEqual(claims(original.access_token).session_id, claims(temporary.access_token).session_id);
    data(await verifier.auth.signOut({scope: 'local'}));
    await rejectedRefresh(temporary.refresh_token);
    await refresh(c, claims(original.access_token).session_id);
    await refresh(other, claims(second.access_token).session_id);
  });
  await group('original_continuity', async () => {
    for (const kind of ['password', 'magiclink']) {
      const f = await fixture(), c = kind === 'magiclink' ? await linkedSession(f, 'magiclink') : client();
      if (kind === 'password') await signIn(c, f);
      const original = await session(c), next = randomBytes(24).toString('base64url'), control = {};
      assert.equal(await candidate(c, f, f.password, next, control), 'complete');
      await rejectedRefresh(control.verifierSession.refresh_token);
      assert.equal(data(await c.auth.getUser()).user.id, f.id);
      const retained = data(await c.auth.getClaims()).claims;
      assert.equal(retained.sub, f.id);
      assert.equal(retained.session_id, claims(original.access_token).session_id);
      assert.equal(claims((await session(c)).access_token).session_id, claims(original.access_token).session_id);
      await refresh(c, claims(original.access_token).session_id);
      assert.ok((await client().auth.signInWithPassword({email: f.email, password: f.password})).error);
      await sameCredentials(f, next);
    }
  });
  await group('other_revocation', async () => {
    const f = await fixture(), c = client(), other = client(), verifier = client();
    const original = await signIn(c, f), second = await signIn(other, f), temporary = await signIn(verifier, f);
    data(await verifier.auth.signOut({scope: 'local'}));
    await rejectedRefresh(temporary.refresh_token);
    const next = randomBytes(24).toString('base64url');
    data(await c.auth.updateUser({password: next, current_password: f.password}));
    await rejectedRefresh(second.refresh_token); // BEFORE explicit others: native transaction.
    residual = second.access_token;
    claims(residual);
    const later = client(), laterSession = await signIn(later, f, next);
    data(await c.auth.signOut({scope: 'others'}));
    await rejectedRefresh(laterSession.refresh_token); // AFTER explicit others, fresh session.
    await refresh(c, claims(original.access_token).session_id);
  });
  await group('recovery_exception', async () => {
    const f = await fixture(), c = await linkedSession(f, 'recovery'), original = await session(c);
    // Pinned verifyPost issues OTP; factor.go classifies OTP as recovery-capable.
    // The request type proves recovery origin, not a literal "recovery" AMR value.
    assert.ok(claims(original.access_token).amr?.some(a => a.method === 'otp'));
    assert.equal(await candidate(c, f, 'deliberately-wrong-password', randomBytes(24).toString('base64url')), 'denied');
    const next = randomBytes(24).toString('base64url');
    data(await c.auth.updateUser({password: next}));
    await refresh(c, claims(original.access_token).session_id);
    await sameCredentials(f, next);
  });
  await group('failure_outcomes', async () => {
    const f = await fixture(), calls = {}, c = client(calls);
    const initial = await signIn(c, f), control = {verifier: {failScope: 'local'}};
    assert.equal(await candidate(c, f, f.password, randomBytes(24).toString('base64url'), control), 'verification_cleanup_failed');
    assert.equal(calls.updates ?? 0, 0);
    assert.equal(control.verifier.faults, 1);
    await refresh(c, claims(initial.access_token).session_id);
    await sameCredentials(f);
    // Test-owned cleanup after an injected failure; never retry the mutation.
    const cleanup = client();
    data(await cleanup.auth.setSession(control.verifierSession));
    data(await cleanup.auth.signOut({scope: 'local'}));
    await rejectedRefresh(control.verifierSession.refresh_token);
    const g = await fixture(), failed = {failScope: 'others'}, d = client(failed);
    const before = await signIn(d, g), next = randomBytes(24).toString('base64url');
    assert.equal(await candidate(d, g, g.password, next), 'changed_revocation_unconfirmed');
    assert.equal(failed.updates, 1);
    assert.equal(failed.faults, 1);
    await sameCredentials(g, next);
    await refresh(d, claims(before.access_token).session_id);
    const h = await fixture(), lost = {loseUpdateResponse: true}, e = client(lost);
    await signIn(e, h);
    const unknown = randomBytes(24).toString('base64url');
    assert.equal(await candidate(e, h, h.password, unknown), 'update_unconfirmed');
    assert.equal(lost.updates, 1);
    await sameCredentials(h, unknown); // Observational oracle, not an action retry.
    // SEC-02 equivalent postcondition, explicitly ordered with no timing sleeps.
    // Not a reproduction of two already-authenticated password-update transactions.
    const removedFixture = await fixture(), removedCalls = {}, original = client(removedCalls), revoker = client();
    const originalSession = await signIn(original, removedFixture);
    const originalSid = claims(originalSession.access_token).session_id;
    const replacement = randomBytes(24).toString('base64url');
    data(await original.auth.updateUser({password: replacement, current_password: removedFixture.password}));
    await signIn(revoker, removedFixture, replacement);
    data(await revoker.auth.signOut({scope: 'others'})); // Deletes the original session first.
    data(await original.auth.signOut({scope: 'others'})); // SDK ignores the missing-session error.
    const retained = data(await original.auth.getClaims()).claims;
    assert.equal(retained.sub, removedFixture.id);
    assert.equal(retained.session_id, originalSid);
    claims(originalSession.access_token); // Still cryptographically valid and unexpired.
    const missing = await original.auth.getUser(); // Provider acceptance is different evidence.
    assert.equal(missing.error?.name, 'AuthSessionMissingError');
    assert.equal(missing.data.user, null);
    await rejectedRefresh(originalSession.refresh_token);
    assert.equal(removedCalls.updates, 1);
    assert.equal(data(await revoker.auth.getUser()).user.id, removedFixture.id);
  });
  await group('residual_jwt', async () => {
    const value = claims(residual);
    const remaining = value.exp * 1000 - Date.now();
    assert.ok(remaining > 0 && remaining <= 121000);
    await delay(remaining + 100);
    assert.throws(() => claims(residual));
  });
} catch {
  failure = true;
} finally {
  const failedPhase = report.phase;
  report.phase = failure ? failedPhase : 'cleanup';
  let cleanupFailed = false;
  for (const f of fixtures) {
    try {
      if (!f.id) {
        const listed = data(await admin.auth.admin.listUsers({perPage: 1000}));
        assert.ok(listed.users.length < 1000);
        f.id = listed.users.find(u => u.email === f.email)?.id;
      }
      const messages = await mails(f.email);
      if (messages.length) {
        const deleted = await localFetch(mailbox.origin + '/api/v1/messages', {
          method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({IDs: messages.map(m => m.ID)}),
        });
        assert.ok(deleted.ok);
      }
      if (f.id) {
        data(await admin.auth.admin.deleteUser(f.id));
        const missing = await admin.auth.admin.getUserById(f.id);
        assert.ok(missing.error && missing.error.status === 404 && !missing.data.user);
        const profile = await admin.from('profiles').select('id', {count: 'exact', head: true}).eq('id', f.id);
        data(profile);
        assert.equal(profile.count, 0);
      }
      assert.equal((await mails(f.email)).length, 0);
    } catch {
      cleanupFailed = true;
    }
  }
  report.cleanup = !cleanupFailed;
  if (cleanupFailed) {
    failure = true;
    report.phase = 'cleanup';
  } else if (!failure) {
    report.passed++;
  }
  report.complete = !failure && report.passed === report.expected && report.cleanup;
  writeFileSync(process.env.PASSWORD_PROOF_RESULT, JSON.stringify(report), {mode: 0o600});
}
process.exitCode = report.complete ? 0 : 1;
