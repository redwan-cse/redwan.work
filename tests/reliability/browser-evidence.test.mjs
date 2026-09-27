// Executes the committed scenario wrapper with an explicit Node-subtest adapter.
// Isolated harness evidence only: no browser, Auth, SQL, storage or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BROWSER_SCENARIOS, BROWSER_PHASES, createBrowserEvidence, safeBrowserFailure } from '../acceptance/browser-evidence.mjs';

const source = fs.readFileSync(new URL('../acceptance/test-browser-resume.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  async function scenario(name, work) {');
const end = source.indexOf('  await scenario(', start);
assert.ok(start >= 0 && end > start, 'Actual browser wrapper must be available');
function wrapper(t, evidence) {
  return new Function('t', 'assert', 'passed', 'evidence', `${source.slice(start, end)}\nreturn scenario;`)(t, assert, [], evidence);
}
function childRunner() {
  const errors = [];
  return { errors, async test(_name, work) { try { await work(); } catch (error) { errors.push(error); } } };
}
test('browser wrapper delegates the original failure to the evidence recorder', async () => {
  const original = Error('PRIVATE_FIXTURE_CANARY');
  const observed = [];
  const evidence = { async scenario(_t, name, work) {
    try { await work(); } catch (error) { observed.push({ name, error }); throw Error('safe failure'); }
  } };
  const run = wrapper(childRunner(), evidence);
  await assert.rejects(run('C: cross-admin read refusal preserves the owner checkpoint', async () => { throw original; }));
  assert.equal(observed.length, 1, 'Wrapper discarded the underlying exception instead of recording it');
  assert.equal(observed[0].error, original);
});
test('browser wrapper routes successful work through the same evidence lifecycle', async () => {
  let recorded = 0, calls = 0;
  const run = wrapper(childRunner(), { async scenario(_t, _name, work) { await work(); recorded++; } });
  await run('A: partial checkpoint reload, confirmation, new-tab manual resume and keyboard/mobile', async () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(recorded, 1, 'Success must use the same recorder as failure');
});
test('a scenario rejection prevents the caller from running later work', async () => {
  const runner = childRunner();
  const run = wrapper(runner, { async scenario() { throw Error('safe failure'); } });
  let later = false;
  await assert.rejects(async () => {
    await run('C: cross-admin read refusal preserves the owner checkpoint', async () => { throw Error('PRIVATE_FIXTURE_CANARY'); });
    later = true;
  });
  assert.equal(later, false);
});

const CANARY = 'PRIVATE_FIXTURE_CANARY';
const SESSION = { candidate: '2'.repeat(40), runId: 'test-run-22222222-2222-4222-8222-222222222222',
  env: { COOKIE: CANARY } };
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-evidence-'));
  const file = path.join(directory, 'evidence.json');
  const evidence = createBrowserEvidence(SESSION, file);
  return { directory, file, evidence, read: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    cleanup() { evidence.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
async function throughAB(evidence, runner = childRunner()) {
  for (const name of BROWSER_SCENARIOS.slice(0, 2)) await evidence.scenario(runner, name, async () => {});
  return runner;
}
test('new evidence is private, in progress, and excludes extra session fields', () => {
  const f = fixture();
  try {
    const record = f.read();
    assert.equal(record.state, 'running');
    assert.equal(record.phase, 'fixture-setup');
    assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
    assert.equal(record.candidate, SESSION.candidate);
    assert.equal(record.runId, SESSION.runId);
    assert.ok(!JSON.stringify(record).includes(CANARY));
    assert.deepEqual(record.results, []);
  } finally { f.cleanup(); }
});
test('existing evidence and a symlink cannot be overwritten', () => {
  const f = fixture();
  try {
    const before = fs.readFileSync(f.file);
    assert.throws(() => createBrowserEvidence(SESSION, f.file));
    const link = path.join(f.directory, 'link.json');
    fs.symlinkSync(f.file, link);
    assert.throws(() => createBrowserEvidence(SESSION, link));
    assert.deepEqual(fs.readFileSync(f.file), before);
  } finally { f.cleanup(); }
});
test('phase observations are allowlisted and cannot declare success', () => {
  const f = fixture();
  try {
    for (const phase of BROWSER_PHASES.filter(p => p !== 'complete')) f.evidence.phase(phase);
    const before = fs.readFileSync(f.file);
    for (const phase of [CANARY, 'complete', null, {}]) assert.throws(() => f.evidence.phase(phase));
    assert.deepEqual(fs.readFileSync(f.file), before);
    assert.equal(f.read().state, 'running');
  } finally { f.cleanup(); }
});
test('HTTP evidence contains only a known operation and integer status', async () => {
  const f = fixture();
  try {
    assert.throws(() => f.evidence.http('saved-import', 200));
    await f.evidence.scenario(childRunner(), BROWSER_SCENARIOS[0], async () => {
      f.evidence.http('page-navigation', 200);
      f.evidence.http('saved-import', 400);
      for (const [kind, value] of [[CANARY, 200], ['saved-import', CANARY], ['saved-import', 999], ['saved-import', 200.5]]) {
        assert.throws(() => f.evidence.http(kind, value));
      }
    });
    assert.deepEqual(f.read().results[0].http, { 'page-navigation': 200, 'saved-import': 400 });
    assert.ok(!JSON.stringify(f.read()).includes(CANARY));
  } finally { f.cleanup(); }
});
test('incomplete or out of order scenarios cannot produce success', async () => {
  const f = fixture();
  try {
    let called = false;
    await assert.rejects(f.evidence.scenario(childRunner(), BROWSER_SCENARIOS[2], async () => { called = true; }));
    assert.equal(called, false);
    assert.throws(() => f.evidence.complete());
    await f.evidence.scenario(childRunner(), BROWSER_SCENARIOS[0], async () => {});
    await assert.rejects(f.evidence.scenario(childRunner(), BROWSER_SCENARIOS[0], async () => { called = true; }));
    assert.equal(called, false);
    assert.throws(() => f.evidence.complete());
  } finally { f.cleanup(); }
});
test('all five successful scenarios retain the original success contract', async () => {
  const f = fixture();
  try {
    for (const name of BROWSER_SCENARIOS) await f.evidence.scenario(childRunner(), name, async () => {});
    f.evidence.complete();
    const record = f.read();
    assert.equal(record.state, 'passed');
    assert.equal(record.phase, 'complete');
    assert.deepEqual(record.scenarios, [...BROWSER_SCENARIOS]);
    assert.deepEqual(record.results.map(r => r.status), Array(5).fill('passed'));
    assert.equal(record.failure, undefined);
    assert.throws(() => f.evidence.complete());
    assert.throws(() => f.evidence.phase('open-import'));
    f.evidence.close();
    assert.deepEqual(f.read(), record);
  } finally { f.cleanup(); }
});
test('failure retains the original phase and sanitized cause when Node swallows the child rejection', async () => {
  const f = fixture();
  try {
    const runner = await throughAB(f.evidence);
    const error = Object.assign(Error(`strict mode violation: cookie=${CANARY}`), {
      stack: `Error: ${CANARY}\n    at async scenario (file:///work/tests/acceptance/test-browser-resume.mjs:211:17)\n    at /private/${CANARY}.mjs:99:1`,
      cause: { secret: CANARY }, actual: CANARY, expected: CANARY,
    });
    await assert.rejects(f.evidence.scenario(runner, BROWSER_SCENARIOS[2], async () => {
      f.evidence.phase('cross-admin-denial-alert');
      throw error;
    }), /C\/cross-admin-denial-alert \(locator-ambiguity\)/);
    const record = f.read();
    assert.equal(record.state, 'failed');
    assert.deepEqual(record.scenarios, BROWSER_SCENARIOS.slice(0, 2));
    assert.deepEqual(record.results.map(r => r.status), ['passed', 'passed', 'failed']);
    assert.deepEqual(record.failure, { scenario: 'C', phase: 'cross-admin-denial-alert',
      category: 'locator-ambiguity', errorType: 'Error', code: null,
      locations: ['tests/acceptance/test-browser-resume.mjs:211:17'] });
    assert.ok(!JSON.stringify(record).includes(CANARY));
    assert.ok(!runner.errors.map(e => e.stack).join('\n').includes(CANARY));
    const preserved = fs.readFileSync(f.file);
    const parentError = f.evidence.fail(Error(`parent ${CANARY}`));
    assert.match(parentError.message, /C\/cross-admin-denial-alert/);
    assert.deepEqual(fs.readFileSync(f.file), preserved);
    let later = false;
    await assert.rejects(f.evidence.scenario(runner, BROWSER_SCENARIOS[3], async () => { later = true; }));
    assert.equal(later, false);
    assert.throws(() => f.evidence.complete());
  } finally { f.cleanup(); }
});
test('subtest registration failure and a child that never executes are both failed evidence', async () => {
  for (const runner of [
    { async test() { throw Object.assign(Error(CANARY), { name: 'AbortError' }); } },
    { async test() {} },
  ]) {
    const f = fixture();
    try {
      await assert.rejects(f.evidence.scenario(runner, BROWSER_SCENARIOS[0], async () => { assert.fail('must not execute'); }));
      assert.equal(f.read().state, 'failed');
      assert.equal(f.read().results[0].status, 'failed');
      assert.ok(!JSON.stringify(f.read()).includes(CANARY));
    } finally { f.cleanup(); }
  }
});
test('closing an unfinished suite records failure and never upgrades it on a later close', () => {
  const f = fixture();
  try {
    f.evidence.phase('browser-launch');
    f.evidence.close();
    const record = f.read();
    assert.equal(record.state, 'failed');
    assert.equal(record.failure.phase, 'browser-launch');
    assert.equal(record.failure.scenario, null);
    f.evidence.close();
    assert.deepEqual(f.read(), record);
  } finally { f.cleanup(); }
});
for (const [name, code, message, category] of [
  ['AssertionError', 'ERR_ASSERTION', CANARY, 'assertion'],
  ['TimeoutError', undefined, CANARY, 'timeout'],
  ['Error', undefined, `net::ERR_CONNECTION_RESET ${CANARY}`, 'browser-network'],
  ['TypeError', 'ECONNRESET', CANARY, 'operation-error'],
  [CANARY, CANARY, CANARY, 'operation-error'],
]) test(`safe error classification: ${category} ${name === CANARY ? 'unrecognized' : name}`, () => {
  const error = Object.assign(Error(message), { name, code, actual: CANARY, expected: CANARY, cause: { secret: CANARY } });
  const result = safeBrowserFailure(error);
  assert.equal(result.category, category);
  assert.ok(!JSON.stringify(result).includes(CANARY));
});
test('unknown thrown values and hostile diagnostic getters stay bounded and nonsecret', () => {
  const hostile = Object.fromEntries(['name', 'code', 'message', 'stack'].map(key => [key, undefined]));
  for (const key of Object.keys(hostile)) Object.defineProperty(hostile, key, { get() { throw Error(CANARY); } });
  for (const thrown of [undefined, null, CANARY, {}, hostile]) {
    const result = safeBrowserFailure(thrown);
    assert.deepEqual(result, { category: 'operation-error', errorType: 'unrecognized', code: null, locations: [] });
  }
});
test('failure locations admit only known source paths and bounded coordinates', () => {
  const stack = [
    'at /secret/' + CANARY + ':22:1',
    'at /work/tests/acceptance/test-browser-resume.mjs:210:9',
    'at /work/tests/acceptance/test-browser-resume.mjs:210:9',
    'at /work/tests/acceptance/harness-env.mjs:92:18',
    'at /work/tests/acceptance/test-browser-resume.mjs:1234567:1',
    'at /work/tests/acceptance/test-browser-resume.mjs:1:123456',
  ].join('\n');
  assert.deepEqual(safeBrowserFailure({ stack }).locations, [
    'tests/acceptance/test-browser-resume.mjs:210:9', 'tests/acceptance/harness-env.mjs:92:18',
  ]);
});
test('cross admin assertions preserve denial UI and checkpoint equality while rejecting an unauthenticated false positive', () => {
  const begin = source.indexOf("  await scenario('C:");
  const finish = source.indexOf("  await scenario('D:", begin);
  const scenario = source.slice(begin, finish);
  for (const phase of ['cross-admin-create', 'cross-admin-promote', 'cross-admin-cutoff', 'cross-admin-cutoff-wait',
    'cross-admin-sign-in', 'owner-checkpoint-before', 'cross-admin-denial-status', 'cross-admin-denial-alert',
    'cross-admin-resume-absent', 'owner-checkpoint-after', 'owner-checkpoint-unchanged']) {
    assert.ok(scenario.includes(`'${phase}'`), `Missing fixed phase ${phase}`);
  }
  assert.ok(scenario.includes('assert.equal(deniedStatus, 400'));
  assert.ok(scenario.includes("page.getByRole('alert').waitFor()"));
  assert.ok(scenario.includes("name: 'Resume restore', exact: true }).count(), 0"));
  assert.ok(scenario.includes('assert.deepEqual(after, before)'));
  assert.doesNotMatch(scenario, /tokens_valid_after:\s*0|route\.fulfill|setExtraHTTPHeaders/);
});
for (const mode of ['success', 'C-failure']) test(`real Node parent and subtest flow: ${mode}`, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-evidence-process-'));
  try {
    const evidenceFile = path.join(directory, 'evidence.json');
    const operations = path.join(directory, 'operations.json');
    const script = path.join(directory, 'flow.mjs');
    const helper = new URL('../acceptance/browser-evidence.mjs', import.meta.url).href;
    fs.writeFileSync(script, `
import test from 'node:test';
import fs from 'node:fs';
import {createBrowserEvidence, BROWSER_SCENARIOS} from ${JSON.stringify(helper)};
test('synthetic wrapper flow', async t => {
  const evidence = createBrowserEvidence(${JSON.stringify(SESSION)}, ${JSON.stringify(evidenceFile)});
  const executed = [];
  try {
    ${source.slice(start, end)}
    for (const name of BROWSER_SCENARIOS) await scenario(name, async () => {
      executed.push(name[0]);
      if (${JSON.stringify(mode)} === 'C-failure' && name[0] === 'C') {
        evidence.phase('cross-admin-denial-alert');
        throw Object.assign(Error(${JSON.stringify(CANARY)}), {name:'TimeoutError'});
      }
    });
    evidence.complete();
  } catch (error) { throw evidence.fail(error); }
  finally {
    evidence.close();
    fs.writeFileSync(${JSON.stringify(operations)}, JSON.stringify(executed));
  }
});
`, { mode: 0o600 });
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // This child is its own test runner, not a worker of this file.
    const result = spawnSync(process.execPath, ['--test', script], { encoding: 'utf8', timeout: 10000, env });
    assert.equal(result.error, undefined);
    assert.equal(result.status, mode === 'success' ? 0 : 1, result.stdout + result.stderr);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(CANARY));
    const record = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    const actual = JSON.parse(fs.readFileSync(operations, 'utf8'));
    if (mode === 'success') {
      assert.deepEqual(actual, ['A', 'B', 'C', 'D', 'E']);
      assert.equal(record.state, 'passed');
      assert.match(output, /^# tests 6$/m);
      assert.match(output, /^# fail 0$/m);
    } else {
      assert.deepEqual(actual, ['A', 'B', 'C']);
      assert.equal(record.state, 'failed');
      assert.equal(record.failure.phase, 'cross-admin-denial-alert');
      assert.equal(record.failure.category, 'timeout');
      assert.match(output, /^# tests 4$/m);
      assert.match(output, /^# pass 2$/m);
      assert.match(output, /^# fail 2$/m);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
