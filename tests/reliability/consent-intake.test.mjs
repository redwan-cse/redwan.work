import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const fixture = { calls: [], error: null, data: null, parserCalls: 0, parsed: null };
globalThis.__consentIntakeTest = fixture;
const hooks = registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (s === '@/lib/supabase/admin') return {
      url: 'data:text/javascript,' + encodeURIComponent(`export function getSupabaseAdmin() {
        return { rpc: async (...args) => { const f = globalThis.__consentIntakeTest;
          f.calls.push(args); return {data: f.data, error: f.error}; } };
      }`), shortCircuit: true,
    };
    if (s === '@/lib/contact/lead-schema') return {
      url: 'data:text/javascript,' + encodeURIComponent(`export function parseLeadPayload() {
        const f = globalThis.__consentIntakeTest; f.parserCalls++; return f.parsed;
      }`), shortCircuit: true,
    };
    if (['@/lib/contact/consent-control', '@/lib/contact/consent-policy'].includes(s)) return {
      url: pathToFileURL(process.cwd() + '/' + s.slice(2) + '.ts').href, shortCircuit: true,
    };
    return next(s, c);
  },
});
const { archivePolicy, consentEvidenceView } = await import('../../lib/contact/consent-policy.ts');
const { parseConsentedLeadPayload } = await import('../../lib/contact/consent-intake.ts');
hooks.deregister();
const bundle = {
  version: 'synthetic-current', checkbox: 'SYNTHETIC: agree',
  privacyNotice: 'SYNTHETIC: privacy', attachmentNotice: 'SYNTHETIC: files',
  policyText: 'SYNTHETIC ONLY, not a published policy.',
};
const current = archivePolicy(bundle);
const previous = archivePolicy({ ...bundle, version: 'synthetic-previous' });
const at = '2026-09-28T00:00:00.000Z';
const meta = { ipHash: null, userAgent: null };
function setup() {
  fixture.calls = []; fixture.error = null; fixture.parserCalls = 0;
  fixture.data = { schema: 1, activeVersion: current.version, policies: [current] };
  fixture.parsed = { ok: true, lead: {
    name: 'Synthetic', attachments: [{ key: 'synthetic-private-file', size_bytes: 10 }],
    consent_at: '2000-01-01T00:00:00Z',
  } };
}
function form() {
  const f = new FormData();
  f.set('gdprConsent', 'true'); f.set('consentPolicyVersion', current.version);
  f.set('projectSummary', 'Synthetic draft'); f.set('attachments', '[{"synthetic":true}]');
  return f;
}
const parse = f => parseConsentedLeadPayload(f, meta, () => new Date(at));
test('actual consent validator and database reader attach the complete server-authored tuple', async () => {
  setup(); const result = await parse(form()); assert.equal(result.ok, true);
  assert.equal(result.lead.consent_at, at);
  assert.equal(result.lead.consent_policy_version, current.version);
  assert.equal(result.lead.consent_policy_hash, current.hash);
  assert.equal(result.lead.consent_capture_method, 'explicit-checkbox-v1');
  assert.equal(result.lead.attachments, fixture.parsed.lead.attachments);
  assert.equal(consentEvidenceView(result.lead, [current]), 'recorded');
  assert.equal(fixture.calls.length, 1);
});
test('wire evidence cannot replace version hash method or server timestamp', async () => {
  setup(); const f = form();
  for (const key of ['consent_at', 'consent_policy_version', 'consent_policy_hash', 'consent_capture_method']) f.set(key, 'forged');
  const result = await parse(f); assert.equal(result.ok, true);
  assert.equal(result.lead.consent_at, at); assert.equal(result.lead.consent_policy_hash, current.hash);
  assert.equal(result.lead.consent_policy_version, current.version);
  assert.equal(result.lead.consent_capture_method, 'explicit-checkbox-v1');
});
test('missing declined alternate duplicate and file-valued consent refuse before parser or database', async () => {
  for (const value of [null, 'false', 'TRUE', '1', ' true ', new Blob(['true'])]) {
    setup(); const f = form(); f.delete('gdprConsent');
    if (value !== null) f.set('gdprConsent', value);
    const result = await parse(f); assert.equal(result.status, 400);
    assert.equal(fixture.parserCalls, 0); assert.equal(fixture.calls.length, 0);
  }
  setup(); const f = form(); f.append('gdprConsent', 'true');
  assert.equal((await parse(f)).status, 400); assert.equal(fixture.calls.length, 0);
});
test('missing duplicate malformed and file-valued versions never acquire the current policy silently', async () => {
  for (const value of [null, '', '../current', 'current\n', 'current\r', 'current\u2028', new Blob(['synthetic-current'])]) {
    setup(); const f = form(); f.delete('consentPolicyVersion');
    if (value !== null) f.set('consentPolicyVersion', value);
    assert.equal((await parse(f)).status, 400); assert.equal(fixture.calls.length, 0);
  }
  setup(); const f = form(); f.append('consentPolicyVersion', current.version);
  assert.equal((await parse(f)).status, 400); assert.equal(fixture.calls.length, 0);
});
test('unknown version refuses without assigning current consent', async () => {
  setup(); const f = form(); f.set('consentPolicyVersion', 'synthetic-unknown');
  const result = await parse(f); assert.equal(result.status, 400);
  assert.equal('lead' in result, false);
});
test('stale version returns the verified current bundle without mutation or retry', async () => {
  setup(); fixture.data.policies.push(previous);
  const f = form(); f.set('consentPolicyVersion', previous.version);
  const entries = [...f.entries()];
  const result = await parse(f);
  assert.equal(result.status, 409); assert.equal(result.code, 'stale');
  assert.deepEqual(result.policy, bundle); assert.equal('lead' in result, false);
  assert.deepEqual([...f.entries()], entries); assert.equal(fixture.calls.length, 1);
});
test('legacy parser validation errors remain authoritative and avoid database lookup', async () => {
  setup(); fixture.parsed = { ok: false, error: 'Attachment data is invalid. Please re-attach your files.' };
  const result = await parse(form()); assert.equal(result.status, 400);
  assert.equal(result.error, fixture.parsed.error); assert.equal(fixture.calls.length, 0);
});
test('unavailable and disabled control cannot fall back to timestamp-only acceptance', async () => {
  for (const disabled of [false, true]) {
    setup();
    if (disabled) fixture.data = { schema: 1, activeVersion: null, policies: [] };
    else fixture.error = { message: 'synthetic-private-provider-body' };
    const result = await parse(form()); assert.equal(result.status, 503);
    assert.equal('lead' in result, false);
    assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
  }
});
test('invalid server clock fails closed', async () => {
  setup();
  const result = await parseConsentedLeadPayload(form(), meta, () => new Date('invalid'));
  assert.equal(result.status, 503); assert.equal('lead' in result, false);
});
