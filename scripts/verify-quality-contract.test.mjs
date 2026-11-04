import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateContract as checkContract, validateReceipt, loadGitBaseline, validatePriorMigrations, renderReceiptSummary } from './verify-quality-contract.mjs';
import { execFileSync } from 'node:child_process';

const ids = ['unit', 'db', 'e2e', 'a11y', 'seo'];
const head = 'a'.repeat(40);
const trusted = new Map();
function validateContract(root, policy) { return checkContract(root, policy, trusted.get(root)); }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'redwan-quality-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const migration = 'supabase/migrations/0001_example.sql';
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(root, migration), 'select 1;\n');
  const policy = {
    schema: 1,
    baselineCommit: head,
    baselineMigrations: { [migration]: createHash('sha256').update('select 1;\n').digest('hex') },
    suites: ids.map(id => ({ id, script: `test:${id}`, directory: `tests/${id}`, requirements: [`${id.toUpperCase()}-REAL-ASSERTION`] })),
  };
  trusted.set(root, { commit: head, migrations: { ...policy.baselineMigrations } });
  t.after(() => trusted.delete(root));
  const pkg = { scripts: Object.fromEntries(ids.map(id => [`test:${id}`, `node scripts/run-${id}.mjs`])) };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  for (const id of ids) {
    mkdirSync(join(root, `tests/${id}`), { recursive: true });
    writeFileSync(join(root, `tests/${id}/example.test.${id === 'db' ? 'sql' : 'ts'}`), '// fixture only; never application evidence\n');
  }
  return { root, policy, pkg, migration };
}
function receipt(id = 'unit') {
  return { schema: 1, suite: id, commit: head, environment: 'isolated-ci', passed: 3, failed: 0, skipped: 0, coveredRequirements: [`${id.toUpperCase()}-REAL-ASSERTION`] };
}
function includes(errors, text) { assert.ok(errors.some(e => e.includes(text)), JSON.stringify(errors)); }

test('accepts structurally complete fixture contract', t => {
  const f = fixture(t); assert.deepEqual(validateContract(f.root, f.policy), []);
});
test('rejects missing required scripts', t => {
  const f = fixture(t); delete f.pkg.scripts['test:unit'];
  writeFileSync(join(f.root, 'package.json'), JSON.stringify(f.pkg));
  includes(validateContract(f.root, f.policy), 'test:unit');
});
test('rejects missing tests instead of treating them as skipped', t => {
  const f = fixture(t); rmSync(join(f.root, 'tests/db'), { recursive: true });
  includes(validateContract(f.root, f.policy), 'db: no test files');
});
test('rejects trivial green scripts', t => {
  const f = fixture(t); f.pkg.scripts['test:unit'] = 'echo all good';
  writeFileSync(join(f.root, 'package.json'), JSON.stringify(f.pkg));
  includes(validateContract(f.root, f.policy), 'placeholder');
});
test('rejects pass-with-no-tests opt outs', t => {
  const f = fixture(t); f.pkg.scripts['test:unit'] = 'vitest run --passWithNoTests';
  writeFileSync(join(f.root, 'package.json'), JSON.stringify(f.pkg));
  includes(validateContract(f.root, f.policy), 'bypass');
});
test('rejects changed recorded migration bytes', t => {
  const f = fixture(t); writeFileSync(join(f.root, f.migration), 'select 2;\n');
  includes(validateContract(f.root, f.policy), 'migration changed');
});
test('rejects migration changes even when the mutable manifest hash is recomputed', t => {
  const f = fixture(t); writeFileSync(join(f.root, f.migration), 'select 2;\n');
  f.policy.baselineMigrations[f.migration] = createHash('sha256').update('select 2;\n').digest('hex');
  includes(validateContract(f.root, f.policy), 'hash differs from Git');
  includes(validateContract(f.root, f.policy), 'migration changed');
});
test('rejects an altered baseline commit or file set', t => {
  const f = fixture(t); f.policy.baselineCommit = 'b'.repeat(40);
  f.policy.baselineMigrations['supabase/migrations/forged.sql'] = 'c'.repeat(64);
  includes(validateContract(f.root, f.policy), 'baseline commit');
  includes(validateContract(f.root, f.policy), 'file set');
});
test('loads authoritative migration bytes from an actual disposable Git commit', t => {
  const f = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init'); git('add', 'supabase/migrations');
  git('-c', 'user.name=Quality Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'synthetic fixture');
  const commit = git('rev-parse', 'HEAD').trim();
  const baseline = loadGitBaseline(f.root, commit);
  assert.deepEqual(baseline.migrations, f.policy.baselineMigrations);
  assert.deepEqual(validatePriorMigrations(f.root, baseline), []);
  writeFileSync(join(f.root, f.migration), 'select 3;\n');
  includes(validatePriorMigrations(f.root, baseline), 'Prior main migration changed');
});
test('rejects missing migration baselines', t => {
  const f = fixture(t); f.policy.baselineMigrations = {};
  includes(validateContract(f.root, f.policy), 'baseline');
});
test('rejects omitted or duplicated mandatory suites', t => {
  const f = fixture(t); f.policy.suites.pop(); f.policy.suites.push(f.policy.suites[0]);
  includes(validateContract(f.root, f.policy), 'suite');
});
test('rejects paths outside the repository', t => {
  const f = fixture(t); f.policy.suites[0].directory = '../outside';
  includes(validateContract(f.root, f.policy), 'unsafe path');
});
test('accepts exact-head non-empty successful isolated receipt', t => {
  const f = fixture(t); assert.deepEqual(validateReceipt(receipt(), f.policy.suites[0], head), []);
});
test('rejects zero-test receipts', t => {
  const f = fixture(t); includes(validateReceipt({ ...receipt(), passed: 0 }, f.policy.suites[0], head), 'passed');
});
test('rejects failed or skipped checks', t => {
  const f = fixture(t);
  includes(validateReceipt({ ...receipt(), failed: 1 }, f.policy.suites[0], head), 'failed');
  includes(validateReceipt({ ...receipt(), skipped: 1 }, f.policy.suites[0], head), 'skipped');
});
test('rejects stale commit evidence', t => {
  const f = fixture(t); includes(validateReceipt({ ...receipt(), commit: 'b'.repeat(40) }, f.policy.suites[0], head), 'commit');
});
test('rejects wrong environment or suite', t => {
  const f = fixture(t);
  includes(validateReceipt({ ...receipt(), environment: 'production' }, f.policy.suites[0], head), 'environment');
  includes(validateReceipt(receipt('db'), f.policy.suites[0], head), 'suite');
});
test('rejects missing requirement coverage', t => {
  const f = fixture(t); includes(validateReceipt({ ...receipt(), coveredRequirements: [] }, f.policy.suites[0], head), 'coverage');
});
test('rejects malformed receipts without throwing', t => {
  const f = fixture(t); includes(validateReceipt(null, f.policy.suites[0], head), 'receipt');
});
test('retains only validated safe receipt fields in the job summary', t => {
  const f = fixture(t);
  const input = { ...receipt(), rawResponse: 'DO-NOT-PUBLISH', coveredRequirements: ['UNIT-REAL-ASSERTION', 'DO-NOT-PUBLISH'] };
  const text = renderReceiptSummary(input, f.policy.suites[0], head);
  assert.ok(text.includes(head));
  assert.ok(text.includes('3 passed'));
  assert.ok(text.includes('UNIT-REAL-ASSERTION'));
  assert.ok(!text.includes('DO-NOT-PUBLISH'));
});
test('refuses a safe-summary claim for a failed receipt', t => {
  const f = fixture(t);
  assert.throws(() => renderReceiptSummary({ ...receipt(), failed: 1 }, f.policy.suites[0], head), /Invalid receipt/);
});
