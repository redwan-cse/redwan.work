import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const workflow = readFileSync(process.env.AUDIT_WORKFLOW || new URL('../../.github/workflows/integrated-foundation-smoke.yml', import.meta.url), 'utf8');
const match = workflow.match(/          # dependency-audit-report:start\n          node <<'NODE'\n([\s\S]*?)          NODE\n          # dependency-audit-report:end/);
const source = match?.[1].replace(/^          /gm, '');
const clean = () => ({auditReportVersion: 2, vulnerabilities: {}, metadata: {vulnerabilities: {info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0}}});
function vulnerable() {
  const report = clean();
  report.metadata.vulnerabilities.low = report.metadata.vulnerabilities.total = 1;
  report.vulnerabilities['example-package'] = {
    name: 'example-package', severity: 'low', isDirect: false, range: '<1.0.1',
    nodes: ['node_modules/example-package'], effects: ['parent-package'],
    via: [{source: 12345, url: 'https://github.com/advisories/GHSA-2345-6789-cfgh', title: 'Do not print raw titles'}],
    fixAvailable: {name: 'example-package', version: '1.0.1', isSemVerMajor: false},
  };
  return report;
}
function execute(report, changes = {}, lock = {packages: {'node_modules/example-package': {version: '1.0.0'}}}) {
  assert.ok(source, 'audit gate must expose bounded diagnostics instead of an opaque exit code');
  const calls = [], messages = [], stopped = {};
  const result = {status: 0, stdout: JSON.stringify(report), stderr: '', ...changes};
  let exit;
  try {
    runInNewContext(source, {
      require(name) {
        if (name === 'node:child_process') return {spawnSync(...args) {calls.push(args);return result;}};
        if (name === 'node:fs') return {readFileSync(path, encoding) {assert.equal(path, 'package-lock.json');assert.equal(encoding, 'utf8');return JSON.stringify(lock);}};
        throw new Error('Unexpected dependency');
      },
      console: {log(message) {messages.push(message);}},
      process: {exit(code) {exit = code;throw stopped;}},
    }, {timeout: 1000});
  } catch (error) {if (error !== stopped) throw error;}
  return {calls: JSON.parse(JSON.stringify(calls)), messages, output: messages.join('\n'), exit};
}

test('audit workflow retains read-only permissions, exact runtime and no suppression', () => {
  assert.ok(source, 'audit diagnostics are missing');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /node-version: '22\.23\.1'/);
  assert.doesNotMatch(workflow, /continue-on-error|audit fix|--omit|--production/);
});
test('zero findings pass only after the same full low-threshold npm audit', () => {
  const run = execute(clean());
  assert.equal(run.exit, 0);
  assert.deepEqual(run.calls[0].slice(0, 2), ['npm', ['audit', '--json', '--audit-level=low']]);
  assert.equal(run.calls[0][2].timeout, 120000);
  assert.equal(run.calls[0][2].shell, undefined);
  assert.match(run.output, /total=0/);
});
test('low severity remains fatal and exposes only actionable public dependency metadata', () => {
  const run = execute(vulnerable(), {status: 1});
  assert.equal(run.exit, 1);
  for (const text of ['example-package', 'severity=low', 'installed=1.0.0', '<1.0.1', 'GHSA-2345-6789-cfgh', 'example-package@1.0.1', 'parent-package']) assert.ok(run.output.includes(text), text);
  assert.ok(!run.output.includes('Do not print raw titles'));
});
test('vulnerabilities cannot pass even if npm incorrectly returns zero', () => {
  assert.equal(execute(vulnerable()).exit, 1);
});
test('nonzero npm exits with zero findings are preserved', () => {
  assert.equal(execute(clean(), {status: 17}).exit, 17);
});
test('invalid JSON fails without publishing stdout or stderr', () => {
  const run = execute(null, {stdout: 'PRIVATE_TOKEN canary', stderr: 'SECRET_URL canary', status: 1});
  assert.equal(run.exit, 1);
  assert.doesNotMatch(run.output, /PRIVATE_TOKEN|SECRET_URL/);
  assert.match(run.output, /invalid-report/);
});
test('registry errors report an allowlisted code without raw messages or URLs', () => {
  const run = execute({error: {code: 'ENOTFOUND', summary: 'PRIVATE_HOST', detail: 'SECRET_TOKEN'}}, {status: 1});
  assert.equal(run.exit, 1);
  assert.match(run.output, /ENOTFOUND/);
  assert.doesNotMatch(run.output, /PRIVATE_HOST|SECRET_TOKEN/);
});
test('timeouts and spawn failures remain failures without error-message disclosure', () => {
  const run = execute(clean(), {status: null, signal: 'SIGTERM', error: {code: 'ETIMEDOUT', message: 'PRIVATE_PATH'}});
  assert.equal(run.exit, 1);
  assert.match(run.output, /execution-failed/);
  assert.doesNotMatch(run.output, /PRIVATE_PATH/);
});
test('missing or inconsistent metadata cannot become a green audit', () => {
  assert.equal(execute({auditReportVersion: 2, vulnerabilities: {}}).exit, 1);
  const report = vulnerable();report.metadata.vulnerabilities.total = 0;
  assert.equal(execute(report).exit, 1);
});
test('malicious package metadata cannot inject workflow commands or secrets', () => {
  const report = vulnerable(), entry = report.vulnerabilities['example-package'];
  entry.name = 'bad\n::notice::SECRET';entry.range = 'https://private.test/?token=SECRET';
  entry.effects = ['bad\n::notice::SECRET'];entry.via[0].url = 'https://private.test/SECRET';
  entry.fixAvailable = {name: 'bad\nSECRET', version: 'TOKEN_SECRET'};
  const run = execute(report, {status: 1});
  assert.equal(run.exit, 1);
  assert.doesNotMatch(run.output, /SECRET|private\.test|::notice::/);
});
test('large reports stay bounded without changing their failed result', () => {
  const report = clean();report.metadata.vulnerabilities.low = report.metadata.vulnerabilities.total = 60;
  for (let n = 0; n < 60; n++) report.vulnerabilities[`package-${n}`] = {...vulnerable().vulnerabilities['example-package'], name: `package-${n}`};
  const run = execute(report, {status: 1});
  assert.equal(run.exit, 1);
  assert.ok(run.messages.length <= 42);
  assert.match(run.output, /total=60/);
  assert.match(run.output, /omitted=20/);
});
test('info-only findings retain the audit low threshold', () => {
  const report = vulnerable();report.vulnerabilities['example-package'].severity = 'info';
  report.metadata.vulnerabilities.info = 1;report.metadata.vulnerabilities.low = 0;
  assert.equal(execute(report).exit, 0);
});

function dependencyFixture() {
  const platforms = ['darwin-x64', 'darwin-arm64', 'linux-x64-gnu', 'linux-x64-musl', 'win32-x64-msvc', 'linux-arm64-gnu', 'linux-arm64-musl', 'win32-arm64-msvc'];
  const manifest = {dependencies: {next: '16.3.6'}};
  const packages = {'': {dependencies: {next: '16.3.6'}}, 'node_modules/next': {version: '16.3.6', dependencies: {'@next/env': '16.3.6'}, optionalDependencies: {}}, 'node_modules/@next/env': {version: '16.3.6'}};
  for (const platform of platforms) {
    packages['node_modules/next'].optionalDependencies[`@next/swc-${platform}`] = '16.3.6';
    packages[`node_modules/@next/swc-${platform}`] = {version: '16.3.6'};
  }
  for (const [index, version] of ['1.1.21', '2.1.7', '5.0.12'].entries()) packages[`node_modules/parent-${index}/node_modules/brace-expansion`] = {version};
  const candidate = [manifest, {lockfileVersion: 3, packages}];
  const original = JSON.parse(JSON.stringify(candidate));
  original[0].dependencies.next = '^16.0.7';
  original[1].packages[''].dependencies.next = '^16.0.7';
  original[1].packages['node_modules/next'].version = '16.3.4';
  return {original, candidate};
}

function verifySecurityFloors(manifest, lock) {
  function atLeast(value, minimum, label) {
    assert.match(value, /^\d+\.\d+\.\d+$/, `${label}: stable version required`);
    const actual = value.split('.').map(Number);
    assert.equal(actual[0], minimum[0], `${label}: unreviewed major`);
    const differing = actual.findIndex((part, index) => part !== minimum[index]);
    assert.ok(differing === -1 || actual[differing] > minimum[differing], `${label}: vulnerable version`);
  }
  assert.equal(lock.lockfileVersion, 3);
  const next = lock.packages['node_modules/next'];
  atLeast(next.version, [16, 3, 6], 'next');
  assert.equal(manifest.dependencies.next, next.version, 'Next manifest must pin the reviewed installed version');
  assert.equal(lock.packages[''].dependencies.next, manifest.dependencies.next, 'manifest and lockfile disagree');
  assert.equal(next.dependencies['@next/env'], next.version, 'Next env dependency is not aligned');
  for (const [name, version] of Object.entries(next.optionalDependencies)) {
    if (name.startsWith('@next/swc-')) {
      assert.equal(version, next.version, 'Next compiler dependency is not aligned');
      assert.equal(lock.packages[`node_modules/${name}`]?.version, next.version, 'Next compiler lock is not aligned');
    }
  }
  assert.equal(lock.packages['node_modules/@next/env'].version, next.version);
  const minima = {1: [1, 1, 21], 2: [2, 1, 7], 3: [3, 0, 9], 5: [5, 0, 12]};
  let copies = 0;
  for (const [key, item] of Object.entries(lock.packages)) {
    if (!/(?:^|\/)node_modules\/brace-expansion$/.test(key)) continue;
    copies++;
    const minimum = minima[item.version.split('.')[0]];
    assert.ok(minimum, 'brace-expansion: unreviewed major');
    atLeast(item.version, minimum, 'brace-expansion');
  }
  assert.ok(copies > 0, 'expected brace-expansion population is missing');
}
test('committed manifest and complete lockfile retain the reviewed security floors', () => {
  const manifest = JSON.parse(readFileSync(process.env.SECURITY_MANIFEST || new URL('../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(process.env.SECURITY_LOCK || new URL('../../package-lock.json', import.meta.url), 'utf8'));
  verifySecurityFloors(manifest, lock);
});
test('security-floor regression rejects the originally reported Next version', () => {
  const fixture = dependencyFixture();
  assert.throws(() => verifySecurityFloors(...fixture.original), /next: vulnerable version/);
});
for (const [index, vulnerableVersion] of ['1.1.18', '2.1.4', '5.0.9'].entries()) {
  test(`security-floor regression rejects nested brace-expansion ${vulnerableVersion}`, () => {
    const {candidate} = dependencyFixture();
    candidate[1].packages[`node_modules/parent-${index}/node_modules/brace-expansion`].version = vulnerableVersion;
    assert.throws(() => verifySecurityFloors(...candidate), /brace-expansion: vulnerable version/);
  });
}
test('security-floor regression accepts the reviewed versions', () => {
  verifySecurityFloors(...dependencyFixture().candidate);
});
test('security-floor regression rejects a stale compiler lock', () => {
  const {candidate} = dependencyFixture();
  candidate[1].packages['node_modules/@next/swc-linux-x64-gnu'].version = '16.3.4';
  assert.throws(() => verifySecurityFloors(...candidate), /compiler lock is not aligned/);
});
test('security-floor regression rejects major-four brace-expansion', () => {
  const {candidate} = dependencyFixture();
  candidate[1].packages['node_modules/parent-0/node_modules/brace-expansion'].version = '4.0.1';
  assert.throws(() => verifySecurityFloors(...candidate), /unreviewed major/);
});

test('consumed dependency publisher has no executable job or credential binding', () => {
  const retired = readFileSync(new URL('../../.github/workflows/dependency-security-repair.yml', import.meta.url), 'utf8');
  assert.match(retired, /if: \$\{\{ false \}\}/);
  assert.match(retired, /contents: read/);
  assert.doesNotMatch(retired, /contents: write|github\.token|secrets\.|REPAIR_PROGRAM|REPAIR_TOKEN/);
});
