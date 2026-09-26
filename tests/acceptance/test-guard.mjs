// Immutable-session unit checks. No service clients, runtime trust mutation or deletion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSession, safeDestination, FixtureTracker, setVerifiedEnvironmentDescriptor, resetVerifiedEnvironmentDescriptor, provisionDisposableEnvironment } from './harness-env.mjs';
function fixture() {
  const env = { DISPOSABLE_AUTH_CI: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://gateway:8000', APP_URL: 'http://app:3000', R2_ENDPOINT: 'http://storage:9000', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic', R2_PRIVATE_BUCKET: 'synthetic-private', R2_PUBLIC_BUCKET: 'synthetic-public', R2_PRIVATE_ACCESS_KEY_ID: 'synthetic', R2_PRIVATE_SECRET_ACCESS_KEY: 'synthetic', R2_PUBLIC_ACCESS_KEY_ID: 'synthetic', R2_PUBLIC_SECRET_ACCESS_KEY: 'synthetic', LEAD_IP_HASH_SALT: 'synthetic' };
  const session = { version: 1, runId: 'test-run-11111111-1111-4111-8111-111111111111', runnerId: 'owned-runner', networkId: 'owned-network', candidate: 'a'.repeat(40), env };
  return { session, env: { ...env, DISPOSABLE_RUN_ID: session.runId } };
}
test('immutable session requires matching identity and every launch configuration value', () => {
  const { session, env } = fixture();
  assert.equal(validateSession(session, env), session);
  for (const key of Object.keys(env)) {
    assert.throws(() => validateSession(session, { ...env, [key]: 'changed' }));
    const missing = { ...env }; delete missing[key];
    assert.throws(() => validateSession(session, missing));
  }
  for (const field of ['version', 'runId', 'runnerId', 'networkId', 'candidate']) assert.throws(() => validateSession({ ...session, [field]: null }, env));
});
test('matching environment strings do not authorize external service endpoints', () => {
  for (const key of ['APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'R2_ENDPOINT']) {
    for (const value of ['https://redwan.work', 'http://127.0.0.1:3000', 'http://app:3000@evil.invalid', 'http://app:3000/path', 'http://app:3000?x=1']) {
      const { session, env } = fixture(); session.env[key] = value; env[key] = value;
      assert.throws(() => validateSession(session, env));
    }
  }
});
test('destination allowlist refuses external origins, userinfo, fragments and port changes', () => {
  const { session } = fixture();
  assert.equal(safeDestination('/api/recovery', session).origin, session.env.APP_URL);
  for (const url of ['http://gateway:8000/auth/v1/user', 'http://storage:9000/synthetic-private/key']) assert.doesNotThrow(() => safeDestination(url, session));
  for (const url of ['https://redwan.work', '//evil.invalid/x', 'http://app:3001', 'http://user@app:3000', '/api/recovery#token']) assert.throws(() => safeDestination(url, session));
});
test('removed trust setters cannot establish or reset launcher authority', () => {
  for (const fn of [setVerifiedEnvironmentDescriptor, resetVerifiedEnvironmentDescriptor, provisionDisposableEnvironment]) assert.throws(() => fn(fixture().session));
});
test('fixture cleanup reports retention and makes zero destructive calls', async () => {
  const forbidden = new Proxy({}, { get() { throw Error('Unexpected service call'); } });
  const tracker = new FixtureTracker(forbidden, forbidden);
  tracker.trackUser('synthetic-user'); tracker.trackImport('synthetic-import'); tracker.trackKey('synthetic-key');
  const result = await tracker.cleanup();
  assert.deepEqual(result.deleted, []); assert.deepEqual(result.verifiedAbsent, []);
  assert.deepEqual(result.retained.imports, ['synthetic-import']);
  assert.equal(result.policy, 'retained-in-owned-run-pending-explicit-disposal');
});
