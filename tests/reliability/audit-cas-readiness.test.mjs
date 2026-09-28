// Execute the actual CI startup shell with a finite Docker double, not a real
// daemon. The official image's temporary init server accepts Unix sockets,
// then stops before the final TCP listener starts. CAS must not run in that gap.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/audit-cas-races.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('      - name: Start network-isolated disposable PostgreSQL\n');
assert.notEqual(start, -1);
const end = workflow.indexOf('      - name:', start + 1);
assert.ok(end > start);
const step = workflow.slice(start, end);
const marker = '        run: |\n';
assert.equal(step.split(marker).length, 2);
const script = step.split(marker)[1].trimEnd().split('\n').map(line => {
  assert.ok(line.startsWith('          '));
  return line.slice(10);
}).join('\n');

const dockerDouble = `
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = process.env.CAS_FIXTURE_STATE;
const mode = process.env.CAS_FIXTURE_MODE;
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
state.calls.push(args);
function save() { fs.writeFileSync(path, JSON.stringify(state)); }
function finish(code, output = '') {
  save();
  if (output) process.stdout.write(output);
  if (code) process.stderr.write('SYNTHETIC_PRIVATE_DIAGNOSTIC_DO_NOT_PRINT');
  process.exitCode = code;
}
if (args[0] === 'pull') {
  assert.deepEqual(args, ['pull', 'postgres:17']);
  finish(0);
} else if (args[0] === 'run') {
  assert.equal(args[args.indexOf('--name') + 1], 'audit-cas-123456');
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.ok(!args.some(arg => ['-p', '-P', '--publish', '--publish-all', '-v', '--volume', '--mount'].includes(arg)));
  assert.ok(args.includes('POSTGRES_DB=audit_cas'));
  assert.equal(args.at(-1), 'postgres:17');
  finish(0, 'synthetic-container-id\\n');
} else if (args[0] === 'exec') {
  assert.ok(args.includes('audit-cas-123456'));
  const command = args.includes('psql') ? 'psql' : 'pg_isready';
  assert.ok(args.includes(command));
  const flags = args.slice(args.indexOf(command) + 1);
  const value = flag => flags.includes(flag) ? flags[flags.indexOf(flag) + 1] : null;
  assert.equal(value('-U'), 'postgres');
  assert.equal(value('-d'), 'audit_cas');
  const tcp = value('-h') === '127.0.0.1';
  const n = state.probes.length;
  const phase = mode === 'temporary-then-final' ? ['temporary', 'stopping', 'final'][Math.min(n, 2)] : 'final';
  state.probes.push({command, tcp, phase, flags});
  if (command === 'psql') {
    assert.equal(value('-c'), 'SELECT 1');
    assert.equal(value('-v'), 'ON_ERROR_STOP=1');
    assert.ok(['-X', '-q', '-A', '-t', '-w'].every(flag => flags.includes(flag)));
    assert.ok(args.includes('PGCONNECT_TIMEOUT=2'));
  }
  if (mode === 'hung-once' && n === 0) {
    save();
    setInterval(() => {}, 60000);
  } else if (mode === 'unavailable' || phase === 'stopping' || (phase === 'temporary' && tcp)) {
    finish(2);
  } else if (command === 'psql' && mode === 'missing-database') {
    finish(2);
  } else if (command === 'psql' && mode === 'failed-sql-with-one') {
    finish(1, '1\\n');
  } else if (command === 'psql' && mode === 'wrong-value') {
    finish(0, '0\\n');
  } else {
    state.acceptedPhase = phase;
    finish(0, command === 'psql' ? '1\\n' : '');
  }
} else {
  throw Error('Unexpected Docker command in startup fixture');
}
`;

function run(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'cas-readiness-'));
  try {
    const statePath = join(dir, 'state.json');
    const sleepsPath = join(dir, 'sleeps');
    writeFileSync(statePath, JSON.stringify({calls: [], probes: []}), {mode: 0o600});
    writeFileSync(sleepsPath, '', {mode: 0o600});
    writeFileSync(join(dir, 'docker'), `#!${process.execPath}\n${dockerDouble}`, {mode: 0o700});
    // Advance a modeled condition, not wall time; no real Docker or database.
    writeFileSync(join(dir, 'sleep'), '#!/bin/sh\n[ "$#" = 1 ] && [ "$1" = 1 ] || exit 98\nprintf . >> "$CAS_FIXTURE_SLEEPS"\n', {mode: 0o700});
    // An outer process-group timeout also cleans up the deliberately hung
    // double when proving an older, unbounded workflow fails.
    const result = spawnSync('/usr/bin/timeout', ['--kill-after=1s', '30s', '/bin/bash', '--noprofile', '--norc', '-c', script], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_RUN_ID: '123456',
        CAS_FIXTURE_MODE: mode,
        CAS_FIXTURE_STATE: statePath,
        CAS_FIXTURE_SLEEPS: sleepsPath,
      },
      encoding: 'utf8',
      timeout: 35000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE_DIAGNOSTIC_DO_NOT_PRINT/);
    return {...result, state: JSON.parse(readFileSync(statePath, 'utf8')), sleeps: readFileSync(sleepsPath, 'utf8').length};
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

test('temporary socket health cannot release CAS before the final server', () => {
  const result = run('temporary-then-final');
  assert.equal(result.status, 0);
  assert.equal(result.state.acceptedPhase, 'final', 'Startup released CAS against the temporary init server');
  assert.deepEqual(result.state.probes.map(probe => probe.phase), ['temporary', 'stopping', 'final']);
  assert.ok(result.state.probes.every(probe => probe.command === 'psql' && probe.tcp));
  assert.equal(result.sleeps, 2);
});

test('an initialized database is accepted by one read-only TCP SQL probe', () => {
  const result = run('ready');
  assert.equal(result.status, 0);
  assert.equal(result.state.probes.length, 1);
  assert.equal(result.state.probes[0].command, 'psql');
  assert.equal(result.state.probes[0].tcp, true);
  assert.equal(result.sleeps, 0);
});

for (const mode of ['missing-database', 'wrong-value', 'failed-sql-with-one', 'unavailable']) {
  test(`readiness fails closed with bounded probes: ${mode}`, () => {
    const result = run(mode);
    assert.equal(result.status, 1);
    assert.equal(result.state.probes.length, 60);
    assert.equal(result.sleeps, 60);
    assert.match(result.stdout, /::error::Disposable PostgreSQL did not become ready\./);
  });
}

test('a hung readiness command is terminated before the next condition probe', () => {
  const result = run('hung-once');
  assert.equal(result.status, 0);
  assert.equal(result.state.probes.length, 2);
  assert.equal(result.state.probes.at(-1).command, 'psql');
  assert.equal(result.state.probes.at(-1).tcp, true);
  assert.equal(result.sleeps, 1);
});
