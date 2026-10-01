// Source-contract regressions only. These do not certify Docker or browser execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = name => fs.readFileSync(new URL(`../acceptance/${name}.mjs`, import.meta.url), 'utf8');
test('live browser suite contains no skipped placeholders and exercises real resume and lost response', () => {
  const s = source('test-browser-resume');
  assert.doesNotMatch(s, /\bskip\s*:|browser-test@example\.test/);
  for (const token of ['chromium.launch', 'page.reload', 'route.fetch', 'route.abort', 'sessionStorage', 'storage-disabled', 'cross-admin', 'expired', 'unsealed']) assert.ok(s.includes(token), `Missing ${token}`);
  assert.doesNotMatch(s, /route\.fulfill|setExtraHTTPHeaders/);
});
test('saved-import protocol checks current state and completes same import', () => {
  const s = source('failing-resume-after-reload');
  assert.doesNotMatch(s, /body\.inFlight|FAILING ACCEPTANCE CRITERION|PROPOSED SLICE/);
  assert.ok(s.includes("body.state, 'ready'"));
  assert.ok(s.includes('verifyCompleted'));
  const protocol = source('section7-browser-usability');
  assert.ok(protocol.includes("body.state, 'uploading'"));
  assert.doesNotMatch(protocol, /lacks in-flight import query|Protocol limitation/);
});
test('lost response preserves Origin while forwarding destination Host and verifies retained hashes', () => {
  const s = source('section4-interrupted-restore');
  assert.ok(s.includes('host: appUrlParsed.host'));
  assert.ok(s.includes('upstreamStatus, 200'));
  assert.ok(s.includes('sha256(await readRecoveryBytes(key)), purgeDigest'));
});
test('conditional finalized-object assertion precedes deletion without recreating the object', () => {
  const s = source('section6-staging-replay');
  const start = s.indexOf("await t.test('6.4");
  assert.ok(start > 0 && start < s.indexOf("await t.test('6.2"));
  const check = s.slice(start, s.indexOf("await t.test('6.2"));
  assert.equal((check.match(/new PutObjectCommand/g) || []).length, 1);
  assert.ok(check.includes("IfNoneMatch: '*'"));
});
test('guard suite uses immutable-session validation without mutating runtime trust', () => {
  const s = source('test-guard');
  assert.ok(s.includes('validateSession'));
  assert.ok(s.includes('safeDestination'));
  assert.doesNotMatch(s, /process\.env\.[A-Z_]+\s*=|createProbeAdminClient|createProbeStorageClient/);
});
