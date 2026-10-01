import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const fixture = { calls: [], result: null, thrown: null };
globalThis.__consentControlTest = fixture;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === '@/lib/supabase/admin') return {
      url: 'data:text/javascript,' + encodeURIComponent(`export function getSupabaseAdmin() {
        return { rpc: async (...args) => { const f = globalThis.__consentControlTest;
          f.calls.push(args); if (f.thrown) throw f.thrown; return f.result; } };
      }`),
      shortCircuit: true,
    };
    if (specifier === '@/lib/contact/consent-policy') return {
      url: pathToFileURL(process.cwd() + '/lib/contact/consent-policy.ts').href, shortCircuit: true,
    };
    return next(specifier, context);
  },
});
const { archivePolicy } = await import('../../lib/contact/consent-policy.ts');
const { readConsentControl } = await import('../../lib/contact/consent-control.ts');
hooks.deregister();
const bundle = Object.freeze({
  version: 'synthetic-current', checkbox: 'SYNTHETIC: agree',
  privacyNotice: 'SYNTHETIC: privacy', attachmentNotice: 'SYNTHETIC: files',
  policyText: 'SYNTHETIC ONLY\nNot a published policy.',
});
const current = archivePolicy(bundle);
const previous = archivePolicy({ ...bundle, version: 'synthetic-previous' });
function setup(data = { schema: 1, activeVersion: current.version, policies: [current] }) {
  fixture.calls = []; fixture.thrown = null; fixture.result = { data, error: null };
}
const unavailable = { ok: false, status: 503, code: 'unavailable' };

test('reads one bounded snapshot and exposes only verified public bundle fields', async () => {
  setup();
  const result = await readConsentControl();
  assert.equal(result.ok, true);
  assert.deepEqual(result.bundle, bundle);
  assert.deepEqual(result.control, { activeVersion: current.version, policies: [current] });
  assert.deepEqual(fixture.calls, [['contact_consent_control', { p_displayed_version: null }]]);
  assert.equal(Object.isFrozen(result.bundle), true);
  assert.equal(Object.isFrozen(result.control), true);
  assert.equal(Object.isFrozen(result.control.policies), true);
  assert.equal(Object.isFrozen(result.control.policies[0]), true);
});
test('recognized previous policy is retained for stale submission validation', async () => {
  setup({ schema: 1, activeVersion: current.version, policies: [previous, current] });
  const result = await readConsentControl(previous.version);
  assert.equal(result.ok, true);
  assert.deepEqual(result.bundle, bundle);
  assert.equal(result.control.policies.length, 2);
  assert.deepEqual(fixture.calls[0][1], { p_displayed_version: previous.version });
});
test('unknown displayed version does not invent a historical archive', async () => {
  setup();
  const result = await readConsentControl('synthetic-unknown');
  assert.equal(result.ok, true);
  assert.deepEqual(result.control.policies, [current]);
});
test('disabled control has no fallback policy or environment override', async () => {
  setup({ schema: 1, activeVersion: null, policies: [] });
  assert.deepEqual(await readConsentControl(), { ok: false, status: 503, code: 'disabled' });
});
test('invalid requested version refuses before RPC', async () => {
  for (const version of ['', '../policy', ' current', 'x'.repeat(65), 'UPPER', 'current\n', 'current\r', 'current\u2028']) {
    setup(); assert.deepEqual(await readConsentControl(version), unavailable);
    assert.equal(fixture.calls.length, 0);
  }
});
test('missing malformed oversized inconsistent and duplicate snapshots fail closed', async () => {
  for (const data of [
    null, [], true, {}, { schema: 2, activeVersion: current.version, policies: [current] },
    { schema: 1, activeVersion: 'current\n', policies: [current] },
    { schema: 1, activeVersion: null, policies: [current] },
    { schema: 1, activeVersion: current.version, policies: [] },
    { schema: 1, activeVersion: current.version, policies: [current, current] },
    { schema: 1, activeVersion: current.version, policies: [current, previous, current] },
    { schema: 1, activeVersion: current.version, policies: [previous] },
    { schema: 1, activeVersion: current.version, policies: [current, previous] },
    ...[null, [], {}, { ...current, hash: '0'.repeat(64) },
      { ...current, version: previous.version },
      { ...current, canonical: current.canonical + ' ' },
      { ...current, canonical: 'x'.repeat(262145) },
      { ...current, canonical: '{' }].map(row => ({
        schema: 1, activeVersion: current.version, policies: [row],
      })),
  ]) {
    setup(data); assert.deepEqual(await readConsentControl(), unavailable);
  }
});
test('RPC errors and throws return no diagnostic payload and do not retry', async () => {
  for (const thrown of [false, true]) {
    setup();
    if (thrown) fixture.thrown = new Error('synthetic-private-provider-body');
    else fixture.result.error = { message: 'synthetic-private-provider-body' };
    assert.deepEqual(await readConsentControl(), unavailable);
    assert.equal(fixture.calls.length, 1);
  }
});
