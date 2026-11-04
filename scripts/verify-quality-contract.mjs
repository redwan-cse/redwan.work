import { readFileSync, readdirSync, lstatSync, realpathSync, appendFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REQUIRED = ['unit', 'db', 'e2e', 'a11y', 'seo'];
const AUDITED_BASELINE = 'ab3db841dda38f991b8ca02a8b6cb300081cf64a';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function safePath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').includes('..')) return null;
  const base = realpathSync(root);
  const absolute = resolve(base, path);
  const rel = relative(base, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  try {
    const real = realpathSync(absolute);
    const realRel = relative(base, real);
    if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel) || lstatSync(absolute).isSymbolicLink()) return null;
  } catch (error) {
    if (error.code !== 'ENOENT') return null;
  }
  return absolute;
}
function testFiles(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap(entry => {
    if (entry.isSymbolicLink()) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return /(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|sql)$/.test(entry.name) ? [path] : [];
  });
}
export function validateContract(root, policy, trustedBaseline) {
  const errors = [];
  if (!record(policy) || policy.schema !== 1) return ['Invalid quality contract schema.'];
  if (!record(trustedBaseline) || !record(trustedBaseline.migrations) || !/^[a-f0-9]{40}$/.test(String(trustedBaseline.commit))) return ['Missing trusted Git migration baseline.'];
  if (policy.baselineCommit !== trustedBaseline.commit) errors.push('Policy baseline commit differs from the trusted Git baseline.');
  let pkg;
  try { pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')); }
  catch { return ['Cannot read package.json.']; }
  const scripts = record(pkg.scripts) ? pkg.scripts : {};
  if (!Array.isArray(policy.suites)) return ['Missing required suite definitions.'];
  const ids = policy.suites.map(suite => suite?.id);
  if (ids.length !== REQUIRED.length || new Set(ids).size !== REQUIRED.length || REQUIRED.some(id => !ids.includes(id))) {
    errors.push('The mandatory suite set must be exactly unit, db, e2e, a11y, seo with no duplicates.');
  }
  for (const suite of policy.suites) {
    if (!record(suite) || !REQUIRED.includes(suite.id)) { errors.push('Invalid suite definition.'); continue; }
    const expectedScript = `test:${suite.id}`;
    if (suite.script !== expectedScript) errors.push(`${suite.id}: required script is ${expectedScript}.`);
    const command = own(scripts, expectedScript) ? scripts[expectedScript] : undefined;
    if (typeof command !== 'string' || !command.trim()) {
      errors.push(`${suite.id}: missing package script ${expectedScript}.`);
    } else {
      if (/^\s*(?:echo\b|printf\b|true\s*$|exit\s+0\s*$)/.test(command)) errors.push(`${suite.id}: placeholder test command.`);
      if (/passWithNoTests|\|\|\s*(?:true|exit\s+0)\b/.test(command)) errors.push(`${suite.id}: test bypass is forbidden.`);
    }
    const directory = safePath(root, suite.directory);
    if (!directory) errors.push(`${suite.id}: unsafe path for tests.`);
    else if (testFiles(directory).length === 0) errors.push(`${suite.id}: no test files; add real .test or .spec files.`);
    if (!Array.isArray(suite.requirements) || suite.requirements.length === 0 || suite.requirements.some(id => typeof id !== 'string' || !/^[A-Z0-9-]+$/.test(id)) || new Set(suite.requirements).size !== suite.requirements.length) {
      errors.push(`${suite.id}: non-empty unique requirement IDs are required.`);
    }
  }
  if (!record(policy.baselineMigrations) || Object.keys(policy.baselineMigrations).length === 0) {
    errors.push('The recorded migration baseline must not be empty.');
  } else {
    if (JSON.stringify(Object.keys(policy.baselineMigrations).sort()) !== JSON.stringify(Object.keys(trustedBaseline.migrations).sort())) errors.push('Migration baseline file set differs from the trusted Git baseline.');
    for (const [path, expected] of Object.entries(trustedBaseline.migrations)) {
      if (policy.baselineMigrations[path] !== expected) errors.push(`Migration baseline hash differs from Git: ${path}.`);
      const absolute = safePath(root, path);
      if (!absolute || !/^supabase\/migrations\/[^/]+\.sql$/.test(path) || !/^[a-f0-9]{64}$/.test(String(expected))) {
        errors.push('Invalid or unsafe path/hash in migration baseline.'); continue;
      }
      try {
        const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
        if (actual !== expected) errors.push(`Recorded migration changed: ${path}. Add a reviewed forward migration.`);
      } catch { errors.push(`Recorded migration missing: ${path}.`); }
    }
  }
  return errors;
}
export function loadGitBaseline(root, commit) {
  if (!/^[a-f0-9]{40}$/.test(String(commit)) || /^0+$/.test(commit)) throw new Error('Invalid Git base commit.');
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'supabase/migrations'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
    .split('\n').filter(path => /^supabase\/migrations\/[^/]+\.sql$/.test(path));
  if (names.length === 0) throw new Error('Git migration baseline is empty.');
  const migrations = Object.fromEntries(names.map(path => {
    const bytes = execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    return [path, createHash('sha256').update(bytes).digest('hex')];
  }));
  return { commit, migrations };
}
export function validatePriorMigrations(root, baseline) {
  const errors = [];
  for (const [path, expected] of Object.entries(baseline.migrations)) {
    const absolute = safePath(root, path);
    if (!absolute) { errors.push(`Unsafe prior migration path: ${path}.`); continue; }
    try {
      if (createHash('sha256').update(readFileSync(absolute)).digest('hex') !== expected) errors.push(`Prior main migration changed: ${path}.`);
    } catch { errors.push(`Prior main migration missing: ${path}.`); }
  }
  return errors;
}
export function validateReceipt(receipt, suite, expectedCommit) {
  if (!record(receipt)) return ['Invalid or missing test receipt.'];
  const errors = [];
  if (receipt.schema !== 1) errors.push('Invalid receipt schema.');
  if (receipt.suite !== suite.id) errors.push('Receipt suite does not match the job.');
  if (!/^[a-f0-9]{40}$/.test(String(expectedCommit)) || receipt.commit !== expectedCommit) errors.push('Receipt commit is not the tested checkout.');
  if (receipt.environment !== 'isolated-ci') errors.push('Receipt environment must be isolated-ci.');
  if (!Number.isSafeInteger(receipt.passed) || receipt.passed < 1) errors.push('Receipt passed count must be a positive integer.');
  if (receipt.failed !== 0) errors.push('Receipt failed count must be zero.');
  if (receipt.skipped !== 0) errors.push('Receipt skipped count must be zero; waived scope needs separate review.');
  if (!Array.isArray(receipt.coveredRequirements) || !Array.isArray(suite.requirements) || suite.requirements.some(id => !receipt.coveredRequirements.includes(id))) {
    errors.push('Receipt requirement coverage is incomplete.');
  }
  return errors;
}
export function renderReceiptSummary(receipt, suite, commit) {
  if (validateReceipt(receipt, suite, commit).length || !REQUIRED.includes(suite.id) || suite.requirements.some(id => typeof id !== 'string' || !/^[A-Z0-9-]{1,100}$/.test(id))) throw new Error('Invalid receipt or summary contract.');
  return `### ${suite.id} test evidence\n\nCheckout: \`${commit}\`\n\n${receipt.passed} passed, 0 failed, 0 skipped. Environment: isolated-ci.\n\nContract IDs: ${suite.requirements.map(id => `\`${id}\``).join(', ')}.\n\nCounts and IDs are runner claims; independent assertion and isolation review is still required.\n\n`;
}
function main() {
  const root = process.cwd();
  const policy = JSON.parse(readFileSync(resolve(root, '.github/quality-contract.json'), 'utf8'));
  const args = process.argv.slice(2);
  let errors;
  if (args.length === 0) {
    const baseline = loadGitBaseline(root, AUDITED_BASELINE);
    errors = validateContract(root, policy, baseline);
    const previous = process.env.QUALITY_BASE_SHA;
    if (previous && !/^0{40}$/.test(previous) && previous !== AUDITED_BASELINE) errors.push(...validatePriorMigrations(root, loadGitBaseline(root, previous)));
  } else if (args.length === 2 && args[0] === '--receipt' && REQUIRED.includes(args[1])) {
    const suite = policy.suites?.find(item => item.id === args[1]);
    if (!suite) throw new Error('Required suite is missing from the contract.');
    const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const path = safePath(root, `artifacts/quality/${suite.id}.json`);
    if (!path) throw new Error('Unsafe receipt path.');
    let receipt;
    try { receipt = JSON.parse(readFileSync(path, 'utf8')); } catch { receipt = null; }
    errors = validateReceipt(receipt, suite, commit);
    if (errors.length === 0 && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderReceiptSummary(receipt, suite, commit), 'utf8');
  } else {
    throw new Error('Usage: node scripts/verify-quality-contract.mjs [--receipt unit|db|e2e|a11y|seo]');
  }
  if (errors.length) {
    console.error('Quality gate failed. Missing work is not a passing test.');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Quality structure/evidence checks passed. This is not independent semantic review or release approval.');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { console.error('Quality gate could not validate its inputs. Check policy, package, receipt, and checkout files.'); process.exitCode = 1; }
}
