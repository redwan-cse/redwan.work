import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUITES = new Set(['unit', 'db', 'e2e', 'a11y', 'seo']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function extractRequirementIds(text, allowedSet, intoSet) {
  if (typeof text !== 'string') return;
  const regex = /\[([A-Z0-9-]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (allowedSet.has(match[1])) {
      intoSet.add(match[1]);
    }
  }
}

export function deriveReceiptFromVitestJson(rawReport, suiteDef, commit) {
  if (!rawReport || typeof rawReport !== 'object' || !Array.isArray(rawReport.testResults)) {
    throw new Error('Malformed Vitest JSON report.');
  }
  const allowed = new Set(suiteDef.requirements ?? []);
  const covered = new Set();
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const fileResult of rawReport.testResults) {
    if (fileResult.status === 'failed' && (!Array.isArray(fileResult.assertionResults) || fileResult.assertionResults.length === 0)) {
      failed += 1;
    }
    for (const assertion of fileResult.assertionResults ?? []) {
      if (assertion.status === 'passed') {
        passed += 1;
        extractRequirementIds(`${assertion.fullName ?? ''} ${assertion.title ?? ''}`, allowed, covered);
      } else if (assertion.status === 'skipped' || assertion.status === 'pending' || assertion.status === 'todo') {
        skipped += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    schema: 1,
    suite: suiteDef.id,
    commit,
    environment: 'isolated-ci',
    passed,
    failed,
    skipped,
    coveredRequirements: Array.from(covered),
  };
}

export function deriveReceiptFromPlaywrightJson(rawReport, suiteDef, commit) {
  if (!rawReport || typeof rawReport !== 'object' || !Array.isArray(rawReport.suites)) {
    throw new Error('Malformed Playwright JSON report.');
  }
  const allowed = new Set(suiteDef.requirements ?? []);
  const covered = new Set();
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function walkSuite(suiteNode, ancestors) {
    const nextAncestors = suiteNode.title ? [...ancestors, suiteNode.title] : ancestors;
    for (const spec of suiteNode.specs ?? []) {
      const fullTitle = [...nextAncestors, spec.title ?? ''].join(' ');
      for (const testCase of spec.tests ?? []) {
        if (testCase.status === 'expected') {
          passed += 1;
          extractRequirementIds(fullTitle, allowed, covered);
        } else if (testCase.status === 'skipped') {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    }
    for (const child of suiteNode.suites ?? []) {
      walkSuite(child, nextAncestors);
    }
  }

  for (const rootSuite of rawReport.suites) {
    walkSuite(rootSuite, []);
  }
  if (Array.isArray(rawReport.errors) && rawReport.errors.length > 0 && passed === 0 && failed === 0) {
    failed += rawReport.errors.length;
  }

  return {
    schema: 1,
    suite: suiteDef.id,
    commit,
    environment: 'isolated-ci',
    passed,
    failed,
    skipped,
    coveredRequirements: Array.from(covered),
  };
}

function assertIsolatedEnvironment(env) {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'E2E_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'R2_ENDPOINT']) {
    const val = env[key];
    if (!val) continue;
    let parsed;
    try {
      parsed = new URL(val);
    } catch {
      throw new Error(`Invalid URL in ${key}`);
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      throw new Error(`Refusing non-loopback host "${parsed.hostname}" in ${key}.`);
    }
  }
}

async function main() {
  const suiteId = process.argv[2];
  if (!SUITES.has(suiteId)) {
    console.error('Usage: node scripts/run-quality-suite.mjs <unit|db|e2e|a11y|seo>');
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const policy = JSON.parse(readFileSync(resolve(root, '.github/quality-contract.json'), 'utf8'));
  const suiteDef = policy.suites.find((s) => s.id === suiteId);
  if (!suiteDef) {
    throw new Error(`Suite ${suiteId} missing from .github/quality-contract.json`);
  }

  const artifactsDir = resolve(root, 'artifacts/quality');
  mkdirSync(artifactsDir, { recursive: true });
  const rawPath = resolve(artifactsDir, `${suiteId}-raw.json`);
  const receiptPath = resolve(artifactsDir, `${suiteId}.json`);
  rmSync(rawPath, { force: true });
  rmSync(receiptPath, { force: true });

  const isolatedEnv = {
    ...process.env,
    NODE_ENV: suiteId === 'unit' || suiteId === 'db' ? 'test' : 'production',
    TEST_ENVIRONMENT: 'isolated-ci',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
    E2E_BASE_URL: 'http://127.0.0.1:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    R2_ENDPOINT: 'http://127.0.0.1:9',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_disposable_local_key',
    SUPABASE_SECRET_KEY: 'sb_secret_disposable_local_key',
    LEAD_IP_HASH_SALT: 'disposable-test-salt-never-used-in-production',
    CRON_SECRET: 'disposable-test-cron-secret-32-chars-minimum',
  };
  assertIsolatedEnvironment(isolatedEnv);

  const commit =
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  let runnerExit = 1;
  if (suiteId === 'unit' || suiteId === 'db') {
    const vitestBin = resolve(root, 'node_modules/vitest/vitest.mjs');
    const res = spawnSync(
      process.execPath,
      [
        vitestBin,
        'run',
        suiteDef.directory,
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${rawPath}`,
      ],
      { cwd: root, env: isolatedEnv, stdio: 'inherit' }
    );
    runnerExit = res.status ?? 1;
    if (!existsSync(rawPath)) {
      process.exitCode = runnerExit || 1;
      return;
    }
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const receipt = deriveReceiptFromVitestJson(raw, suiteDef, commit);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  } else {
    const { runBrowserSuite } = await import('../tests/harness/browser-suite-runner.mjs');
    runnerExit = await runBrowserSuite({ root, suiteId, suiteDef, rawPath, isolatedEnv });
    if (!existsSync(rawPath)) {
      process.exitCode = runnerExit || 1;
      return;
    }
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const receipt = deriveReceiptFromPlaywrightJson(raw, suiteDef, commit);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }

  process.exitCode = runnerExit;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
