// Allowlisted evidence for the real-browser suite. Never serialize a raw error,
// assertion value, provider body, cookie, fixture identity, URL or screenshot.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export const BROWSER_SCENARIOS = Object.freeze([
  'A: partial checkpoint reload, confirmation, new-tab manual resume and keyboard/mobile',
  'B: committed final response is dropped and recovered by read-only reload',
  'C: cross-admin read refusal preserves the owner checkpoint',
  'D: unsealed validation and expired unfinished import refuse automatic restore',
  'E: storage-disabled manual recovery and forget-reference semantics',
]);
export const BROWSER_PHASES = Object.freeze([
  'fixture-setup', 'browser-runtime', 'browser-launch', 'scenario-start',
  'new-context', 'route-boundary', 'add-cookies', 'disable-storage', 'new-page',
  'page-navigation', 'recovery-heading', 'recovery-input-ready', 'read-status',
  'read-checkpoint', 'fill-import-id', 'load-import-response', 'load-import-idle',
  'resume-confirmation', 'resume-submit', 'completed-status', 'open-import',
  'cross-admin-create', 'cross-admin-promote', 'cross-admin-cutoff',
  'cross-admin-cutoff-wait', 'cross-admin-sign-in', 'owner-checkpoint-before',
  'cross-admin-denial-status', 'cross-admin-denial-alert', 'cross-admin-resume-absent',
  'owner-checkpoint-after', 'owner-checkpoint-unchanged', 'expiry-anonymous-denial',
  'expiry-foreign-denial', 'expiry-direct-write-denial', 'expiry-transition',
  'expiry-repeat-denial', 'expired-page', 'disabled-storage-warning',
  'forget-reference', 'complete',
]);
const ERROR_CODES = new Set([
  'ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND',
  'EAI_AGAIN', 'ETIMEDOUT', 'EACCES', 'ENOENT',
]);
const ERROR_TYPES = new Set(['Error', 'AssertionError', 'TimeoutError', 'TypeError', 'AbortError']);
function stringField(error, key) {
  try { return typeof error?.[key] === 'string' ? error[key].slice(0, 65536) : ''; }
  catch { return ''; }
}
export function safeBrowserFailure(error) {
  const type = stringField(error, 'name'), code = stringField(error, 'code');
  const message = stringField(error, 'message');
  const category = code === 'ERR_ASSERTION' ? 'assertion'
    : type === 'TimeoutError' ? 'timeout'
    : message.includes('strict mode violation') ? 'locator-ambiguity'
    : message.includes('net::ERR_') ? 'browser-network'
    : 'operation-error';
  const locations = [...new Set([...stringField(error, 'stack').matchAll(
    /\b(tests\/acceptance\/(?:test-browser-resume|browser-evidence|failing-resume-after-reload|harness-env)\.mjs):([1-9]\d{0,5}):([1-9]\d{0,4})(?=\)|\s|$)/g
  )].map(m => `${m[1]}:${m[2]}:${m[3]}`))].slice(0, 6);
  return { category, errorType: ERROR_TYPES.has(type) ? type : 'unrecognized',
    code: ERROR_CODES.has(code) ? code : null, locations };
}

export function createBrowserEvidence(session, file = '/tmp/recovery-browser-evidence.json') {
  assert.match(session?.candidate ?? '', /^[a-f0-9]{40}$/, 'Exact browser candidate required');
  assert.match(session?.runId ?? '', /^test-run-[a-f0-9-]{36}$/, 'Exact browser run required');
  const record = {
    schema: 'recovery-browser-evidence-v1', candidate: session.candidate, runId: session.runId,
    state: 'running', phase: 'fixture-setup', scenarios: [], results: [],
    scope: 'named disposable Chromium assertions only; successful Node suite exit also required',
    fixturePolicy: 'retained-in-owned-run-pending-explicit-disposal',
  };
  // Do not overwrite evidence from a previous attempt, including a symlink.
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT |
    fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let closed = false, active = null;
  function persist() {
    assert.ok(!closed, 'Browser evidence already closed');
    const value = Buffer.from(JSON.stringify(record, null, 2) + '\n');
    let offset = 0;
    while (offset < value.length) {
      const written = fs.writeSync(fd, value, offset, value.length - offset, offset);
      assert.ok(written > 0, 'Browser evidence write incomplete');
      offset += written;
    }
    fs.ftruncateSync(fd, value.length);
    fs.fsyncSync(fd);
  }
  function safeError() {
    const failure = record.failure;
    const error = Error(`Recovery browser failed at ${failure.scenario ?? 'setup'}/${failure.phase} (${failure.category}); sanitized evidence retained.`);
    if (failure.code) error.code = failure.code;
    return error;
  }
  function fail(error) {
    if (record.state !== 'failed') {
      record.state = 'failed';
      record.failure = { scenario: active?.scenario ?? null, phase: record.phase, ...safeBrowserFailure(error) };
      if (active) active.status = 'failed';
      persist();
    }
    return safeError();
  }
  try { persist(); } catch (error) { fs.closeSync(fd); closed = true; throw error; }
  return {
    phase(value) {
      assert.ok(record.state === 'running' && BROWSER_PHASES.includes(value) && value !== 'complete', 'Invalid browser evidence phase');
      record.phase = value; persist();
    },
    http(kind, status) {
      assert.ok(record.state === 'running' && active && ['page-navigation', 'saved-import'].includes(kind), 'Invalid browser HTTP observation');
      assert.ok(Number.isInteger(status) && status >= 100 && status <= 599, 'Invalid browser HTTP status');
      active.http ??= {};
      active.http[kind] = status; persist();
    },
    fail,
    async scenario(t, name, work) {
      assert.ok(record.state === 'running' && !active, 'Browser scenario cannot continue');
      assert.equal(name, BROWSER_SCENARIOS[record.scenarios.length], 'Browser scenarios must execute once in order');
      active = { scenario: name[0], status: 'running' };
      record.results.push(active); record.phase = 'scenario-start'; persist();
      let succeeded = false;
      try {
        await t.test(name, async () => {
          try {
            await work();
            assert.equal(record.state, 'running', 'Browser scenario failed');
            active.status = 'passed'; record.scenarios.push(name); persist(); succeeded = true;
          } catch (error) { throw fail(error); }
        });
      } catch (error) { throw fail(error); }
      // Node subtests can fail without rejecting t.test(). Never run D/E after C fails.
      if (!succeeded) throw record.state === 'failed' ? safeError() : fail(Error('Browser subtest did not execute'));
      active = null;
    },
    complete() {
      assert.ok(record.state === 'running' && !active, 'Failed browser suite cannot complete');
      assert.deepEqual(record.scenarios, [...BROWSER_SCENARIOS], 'All five browser scenarios required');
      record.state = 'passed'; record.phase = 'complete'; persist();
    },
    close() {
      if (closed) return;
      try { if (record.state === 'running') fail(Error('Browser suite did not complete')); }
      finally { fs.closeSync(fd); closed = true; }
    },
  };
}
