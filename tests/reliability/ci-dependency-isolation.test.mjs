import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const wave = readFileSync(process.env.WAVE_SOURCE || new URL('../wave-one-browser.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(process.env.RECONCILIATION_WORKFLOW || new URL('../../.github/workflows/contact-cleanup.yml', import.meta.url), 'utf8');
const parentStart = wave.indexOf("if(process.argv[2]!=='child'){");
const parentEnd = wave.indexOf("\nassert.equal(process.env.DISPOSABLE_AUTH_CI,'true');");
assert.ok(parentStart >= 0 && parentEnd > parentStart, 'review the real harness parent boundary');
const parentSource = wave.slice(parentStart, parentEnd);
const pythonMatch = workflow.match(/          python3 - <<'PY'\n([\s\S]*?)          PY/);
assert.ok(pythonMatch, 'review the real reconciliation boundary');
const pythonSource = pythonMatch[1].replace(/^          /gm, '');
const clone = value => JSON.parse(JSON.stringify(value));
const put = (path, value) => {mkdirSync(dirname(path), {recursive: true});writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));};

function dependencyPair(version = '16.3.6') {
  const manifest = {name: 'synthetic-ci-regression', private: true, dependencies: {next: version}};
  const packages = {'': {dependencies: {next: version}}, 'node_modules/next': {version}, 'node_modules/ajv': {version: '6.15.0'}};
  for (const [index, item] of ['10.2.6', '3.1.5', '9.0.9'].entries()) packages[`node_modules/parent-${index}/node_modules/minimatch`] = {version: item};
  return {manifest, lock: {lockfileVersion: 3, packages}};
}

// Execute the actual parent with real temporary files and synthetic git/npm/browser
// process boundaries. These are orchestration regressions, not browser acceptance.
function runWave(options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'wave-isolation-test-'));
  const workspace = join(home, 'candidate'), runner = join(home, 'runner');
  const baselinePair = options.baseline || dependencyPair('16.3.4');
  const candidatePair = options.candidate || dependencyPair();
  const messages = [], calls = [], children = [], stopped = {};
  let exit, scratch, report;
  const at = path => isAbsolute(String(path)) ? String(path) : join(workspace, String(path));
  mkdirSync(runner, {recursive: true});
  put(join(workspace, 'package.json'), candidatePair.manifest);
  put(join(workspace, 'package-lock.json'), candidatePair.lock);
  put(join(workspace, 'node_modules/next/package.json'), {version: candidatePair.lock.packages['node_modules/next'].version});
  put(join(runner, 'auth-status.json'), {API_URL: options.api || 'http://127.0.0.1:54321', PUBLISHABLE_KEY: 'sb_publishable_synthetic', SECRET_KEY: 'sb_secret_synthetic'});
  const originalCandidate = ['package.json', 'package-lock.json'].map(name => readFileSync(join(workspace, name), 'utf8'));
  const env = {
    PATH: process.env.PATH, HOME: '/synthetic-private-home', TMPDIR: home, CI: 'true',
    RUNNER_TEMP: runner, AUTH_STATUS_FILE: join(runner, 'auth-status.json'), BROWSER_TOOLS_DIR: '/synthetic-browser-tools',
    GITHUB_TOKEN: 'PRIVATE_GITHUB_CANARY', STATUS_TOKEN: 'PRIVATE_STATUS_CANARY',
    NPM_TOKEN: 'PRIVATE_NPM_CANARY', NODE_AUTH_TOKEN: 'PRIVATE_AUTH_CANARY',
    NODE_OPTIONS: 'PRIVATE_NODE_CANARY', NPM_CONFIG_USERCONFIG: '/private/npmrc-canary',
    SUPABASE_SECRET_KEY: 'PRIVATE_SUPABASE_CANARY', AWS_SECRET_ACCESS_KEY: 'PRIVATE_AWS_CANARY',
  };
  function command(file, args, settings = {}) {
    calls.push({file, args: clone(args), settings: clone(settings)});
    if (file === 'git') {
      assert.ok(['cat-file', 'fetch', 'archive'].includes(args[0]));
      if (options.archiveFailure && args[0] === 'archive') throw Error('PRIVATE_ARCHIVE_CANARY');
      return Buffer.alloc(0);
    }
    if (file === 'tar') {
      const root = args.at(-1);
      put(join(root, 'package.json'), baselinePair.manifest);
      put(join(root, 'package-lock.json'), baselinePair.lock);
      if (options.baselineNpmrc) put(join(root, '.npmrc'), 'registry=https://unexpected.invalid/');
      return Buffer.alloc(0);
    }
    if (file === 'cp') {
      cpSync(args[1], args[2], {recursive: true});
      return Buffer.alloc(0);
    }
    assert.equal(file, 'npm', 'no other process is permitted in dependency preparation');
    if (options.installFailure) throw Error('PRIVATE_INSTALL_CANARY');
    put(join(settings.cwd, 'node_modules/next/package.json'), {version: options.wrongInstalledNext ? '16.3.6' : baselinePair.lock.packages['node_modules/next'].version});
    if (options.mutateBaseline) put(join(settings.cwd, options.mutateBaseline), '{}');
    if (options.mutateCandidate) put(join(workspace, options.mutateCandidate), '{}');
    return Buffer.alloc(0);
  }
  try {
    try {
      runInNewContext(parentSource, {
        assert, URL, Buffer, createHash, randomBytes, join,
        resolve: (...paths) => resolve(workspace, ...paths), tmpdir: () => home,
        existsSync: path => existsSync(at(path)), readFileSync: (path, ...rest) => readFileSync(at(path), ...rest),
        writeFileSync: (path, ...rest) => writeFileSync(at(path), ...rest),
        mkdirSync: (path, ...rest) => mkdirSync(at(path), ...rest),
        mkdtempSync(prefix) {scratch = mkdtempSync(prefix);return scratch;}, rmSync,
        execFileSync: command,
        spawnSync(file, args, settings) {
          assert.equal(file, process.execPath);assert.equal(args[1], 'child');
          const mode = settings.env.WAVE_CANDIDATE === 'true' ? 'candidate' : 'baseline';
          const installed = JSON.parse(readFileSync(join(settings.env.WAVE_ROOT, 'node_modules/next/package.json'), 'utf8')).version;
          children.push({mode, installed, env: clone(settings.env)});
          const row = {infrastructure: true, cleanup: true, phase: 'I02'};
          for (const group of ['A01', 'I01', 'I02']) row[group] = {pass: 1, fail: mode === 'baseline' ? 1 : 0};
          if (options.baselineGreen && mode === 'baseline') row.A01.fail = 0;
          if (options.candidateFailure && mode === 'candidate') row.I01.fail = 1;
          if (options.missingCounts && mode === 'candidate') row.I02.pass = 0;
          if (options.cleanupFailure && mode === 'candidate') row.cleanup = false;
          if (options.infrastructureFailure && mode === 'baseline') row.infrastructure = false;
          if (!options.missingResult) put(settings.env.WAVE_RESULT, row);
          if (options.childOutcome?.mode === mode) return options.childOutcome.result;
          return {status: row.infrastructure && row.cleanup ? 0 : 1};
        },
        console: {log: text => messages.push(text), error: text => messages.push(text)},
        process: {argv: ['node', 'wave'], execPath: process.execPath, cwd: () => workspace, env,
          exit(code) {exit = code;throw stopped;}},
      }, {timeout: 2000});
    } catch (error) {if (error !== stopped) throw error;}
    if (existsSync(join(runner, 'wave-browser-result.json'))) report = JSON.parse(readFileSync(join(runner, 'wave-browser-result.json'), 'utf8'));
    const candidateAfter = ['package.json', 'package-lock.json'].map(name => readFileSync(join(workspace, name), 'utf8'));
    return {exit, report, messages, calls, children, originalCandidate, candidateAfter, scratchRemoved: !existsSync(scratch), workspace};
  } finally {rmSync(home, {recursive: true, force: true});}
}

// Run the complete embedded Python program. Git identity/ancestry is an explicit
// adapter; actual Git ancestry remains checked in the real reconciliation CI job.
function runReconciliation(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'reconciliation-test-'));
  const candidate = options.candidate || dependencyPair();
  const frozen = options.frozen || dependencyPair('16.3.4');
  put(join(root, 'package.json'), candidate.manifest);
  put(join(root, 'package-lock.json'), candidate.lock);
  put(join(root, 'components/enhanced-contact-form.tsx'), "formFields.append('gdprConsent', 'true');\n");
  put(join(root, '.github/workflows/contact-cleanup.yml'), workflow);
  put(join(root, '.github/workflows/integrated-foundation-smoke.yml'), '4e9ca493fd6cdd11a82be742670455b752ca4c95');
  put(join(root, 'reconciliation.py'), pythonSource);
  const driver = `import json,sys,types,subprocess as real\nfrom pathlib import Path\npayload=json.load(sys.stdin)\ncalls=[]\ndef run(args,**kw):\n calls.append(args)\n assert args[0]=='git'\n assert args[1:3]==['cat-file','-e'] or args[1:3]==['merge-base','--is-ancestor']\n assert kw['check'] is True\n if payload.get('bad_ancestry') and args[1]=='merge-base':raise real.CalledProcessError(1,args)\n return types.SimpleNamespace(returncode=0)\ndef output(args,**kw):\n calls.append(args)\n assert args[0]=='git'\n if args[1:3]==['cat-file','-p']:\n  tree='b'*40 if payload.get('bad_tree') and args[3]=='432c7d1d25d85a74d90d0b8e4dc09b11ec6513fc' else 'a'*40\n  return ('tree '+tree+'\\n').encode()\n assert args==['git','show','27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a:package-lock.json']\n return json.dumps(payload['frozen']).encode()\nsys.modules['subprocess']=types.SimpleNamespace(run=run,check_output=output,CalledProcessError=real.CalledProcessError,DEVNULL=real.DEVNULL)\ntry:\n exec(compile(Path('reconciliation.py').read_text(),'reconciliation.py','exec'))\nfinally:\n Path('git-calls.json').write_text(json.dumps(calls))\n`;
  try {
    const result = spawnSync('python3', ['-c', driver], {cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
      input: JSON.stringify({frozen: frozen.lock, bad_ancestry: Boolean(options.badAncestry), bad_tree: Boolean(options.badTree)})});
    assert.equal(result.error, undefined);
    return {status: result.status, output: result.stdout + result.stderr, calls: JSON.parse(readFileSync(join(root, 'git-calls.json'), 'utf8'))};
  } finally {rmSync(root, {recursive: true, force: true});}
}

test('different frozen and patched lockfiles get separate installations and both acceptance modes run', () => {
  const result = runWave();
  assert.equal(result.exit, 0, 'a security patch must not abort before either browser mode');
  assert.deepEqual(result.children.map(({mode, installed}) => [mode, installed]), [['baseline', '16.3.4'], ['candidate', '16.3.6']]);
  assert.equal(result.calls.filter(call => call.file === 'npm').length, 1);
  assert.equal(result.calls.filter(call => call.file === 'cp').length, 0);
  assert.deepEqual(result.candidateAfter, result.originalCandidate);
  assert.equal(result.report.complete, true);assert.equal(result.scratchRemoved, true);
});
test('identical manifest and lockfile retain the safe dependency reuse path', () => {
  const pair = dependencyPair();
  const result = runWave({baseline: pair, candidate: clone(pair)});
  assert.equal(result.exit, 0);assert.equal(result.calls.filter(call => call.file === 'npm').length, 0);
  assert.equal(result.calls.filter(call => call.file === 'cp').length, 1);
});
test('a manifest-only difference cannot reuse the candidate installation', () => {
  const baseline = dependencyPair(), candidate = dependencyPair();baseline.manifest.scripts = {postinstall: 'must-not-run'};
  const result = runWave({baseline, candidate});
  assert.equal(result.exit, 0);assert.equal(result.calls.filter(call => call.file === 'npm').length, 1);
  assert.equal(result.calls.filter(call => call.file === 'cp').length, 0);
});
test('historical installation is locked, script-free, bounded and credential-free', () => {
  const result = runWave(), install = result.calls.find(call => call.file === 'npm');
  assert.ok(install, 'mismatched dependency trees need an isolated install');
  assert.equal(install.args[0], 'ci');
  for (const flag of ['--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/']) assert.ok(install.args.includes(flag));
  assert.equal(install.settings.timeout, 300000);assert.equal(install.settings.maxBuffer, 10 * 1024 * 1024);
  assert.equal(install.settings.stdio, 'pipe');assert.equal(install.settings.shell, undefined);
  assert.notEqual(install.settings.cwd, result.workspace);
  assert.doesNotMatch(JSON.stringify(install.settings.env), /PRIVATE_|AUTH_STATUS_FILE|BROWSER_TOOLS_DIR|GITHUB_|STATUS_TOKEN|SUPABASE|NODE_OPTIONS|NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.match(install.settings.env.HOME, /wave-browser-/);
  for (const key of ['npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_cache']) assert.match(install.settings.env[key], /wave-browser-/);
  assert.equal(install.settings.env.NPM_CONFIG_USERCONFIG, undefined);
});
test('installation failure aborts both modes with finite diagnostics and no raw error', () => {
  const result = runWave({installFailure: true});
  assert.equal(result.exit, 1);assert.equal(result.children.length, 0);assert.equal(result.report.complete, false);
  assert.match(result.messages.join('\n'), /dependencies/);assert.doesNotMatch(result.messages.join('\n'), /PRIVATE_INSTALL_CANARY/);
  assert.equal(result.scratchRemoved, true);
});
for (const file of ['package.json', 'package-lock.json']) {
  test(`installation cannot mutate frozen ${file}`, () => {
    const result = runWave({mutateBaseline: file});assert.equal(result.exit, 1);assert.equal(result.children.length, 0);
    assert.equal(result.calls.filter(call => call.file === 'npm').length, 1);assert.equal(result.scratchRemoved, true);
  });
  test(`installation cannot mutate candidate ${file}`, () => {
    const result = runWave({mutateCandidate: file});assert.equal(result.exit, 1);assert.equal(result.children.length, 0);
    assert.equal(result.calls.filter(call => call.file === 'npm').length, 1);
  });
}
test('an installed Next from the wrong tree is rejected before any browser run', () => {
  const result = runWave({wrongInstalledNext: true});assert.equal(result.exit, 1);assert.equal(result.children.length, 0);
  assert.equal(result.calls.filter(call => call.file === 'npm').length, 1);
});
test('unexpected historical npm configuration is refused before installation', () => {
  const result = runWave({baselineNpmrc: true});assert.equal(result.exit, 1);assert.equal(result.children.length, 0);
  assert.equal(result.calls.filter(call => call.file === 'npm').length, 0);
});
test('archive failures report only a fixed preparation phase', () => {
  const result = runWave({archiveFailure: true});assert.equal(result.exit, 1);assert.equal(result.children.length, 0);
  assert.match(result.messages.join('\n'), /archive/);assert.doesNotMatch(result.messages.join('\n'), /PRIVATE_ARCHIVE_CANARY/);
});
for (const failure of ['baselineGreen', 'candidateFailure', 'missingCounts', 'cleanupFailure', 'infrastructureFailure', 'missingResult']) {
  test(`acceptance remains red for ${failure}`, () => {
    const result = runWave({[failure]: true});assert.equal(result.exit, 1);
    assert.equal(result.calls.filter(call => call.file === 'npm').length, 1, 'the test must reach the intended post-install failure');
  });
}
test('production service origins are still rejected before dependency work', () => {
  assert.throws(() => runWave({api: 'https://production.invalid'}));
});


for (const mode of ['baseline', 'candidate']) {
  for (const [label, outcome] of [
    ['nonzero exit', {status: 1}],
    ['terminated process', {status: null, signal: 'SIGTERM'}],
    ['missing exit status', {status: null}],
    ['spawn error', {status: null, error: {message: 'PRIVATE_CHILD_CANARY'}}],
  ]) {
    test(`${mode} ${label} cannot pass with otherwise valid result JSON`, () => {
      const result = runWave({childOutcome: {mode, result: outcome}});
      assert.equal(result.exit, 1, 'a failed child must never turn acceptance green');
      assert.equal(result.report.complete, false);
      assert.equal(result.children.length, mode === 'baseline' ? 1 : 2);
      assert.equal(result.report[mode].infrastructure, true, 'retain results without treating them as process success');
      assert.equal(result.report[mode].cleanup, true);
      assert.equal(result.scratchRemoved, true);
      assert.deepEqual(result.candidateAfter, result.originalCandidate);
      assert.doesNotMatch(result.messages.join('\n'), /PRIVATE_/);
    });
  }
}

test('reconciliation accepts the security-patched candidate while preserving frozen evidence', () => {
  const result = runReconciliation();assert.equal(result.status, 0, result.output);
  assert.equal(result.calls.filter(args => args[1] === 'merge-base').length, 7);
  assert.match(result.output, /frozen-main: PR11\/12\/14\/16/);assert.match(result.output, /candidate: PR11\/12\/14\/16/);
});
test('a later pinned same-major security patch does not require rewriting frozen history', () => {
  const result = runReconciliation({candidate: dependencyPair('16.3.7')});assert.equal(result.status, 0, result.output);
});
for (const version of ['16.3.4', '16.3.5', '17.0.0', '16.3.6-canary.1', '^16.3.6']) {
  test(`reconciliation rejects unsafe or unreviewed candidate version ${version}`, () => {
    assert.notEqual(runReconciliation({candidate: dependencyPair(version)}).status, 0);
  });
}
test('candidate manifest and root lockfile pins must match', () => {
  const candidate = dependencyPair();candidate.lock.packages[''].dependencies.next = '^16.0.7';
  assert.notEqual(runReconciliation({candidate}).status, 0);
});
test('a second stale nested Next copy cannot pass reconciliation', () => {
  const candidate = dependencyPair();candidate.lock.packages['node_modules/parent/node_modules/next'] = {version: '16.3.4'};
  assert.notEqual(runReconciliation({candidate}).status, 0);
});
test('historical Next evidence remains exact and cannot be silently upgraded', () => {
  assert.notEqual(runReconciliation({frozen: dependencyPair()}).status, 0);
});
for (const name of ['lodash', 'ajv', 'minimatch']) {
  test(`the existing ${name} dependency objective stays enforced`, () => {
    const candidate = dependencyPair();candidate.lock.packages[`node_modules/${name}`] = {version: '0.0.0'};
    assert.notEqual(runReconciliation({candidate}).status, 0);
  });
}
for (const flag of ['badAncestry', 'badTree']) {
  test(`historical reconciliation still rejects ${flag}`, () => {
    assert.notEqual(runReconciliation({[flag]: true}).status, 0);
  });
}
test('reconciliation remains read-only and the browser’s real scenarios stay mandatory', () => {
  assert.doesNotMatch(workflow, /(?:contents|statuses):\s*write|\$\{\{\s*secrets\.|continue-on-error/);
  for (const text of ['report.baseline[k].fail>0', 'report.candidate[k].fail===0', 'report.candidate?.cleanup', '8d0bd70f5f155ea1791265507274ecb8a2c56f0b']) assert.ok(wave.includes(text));
  assert.ok(wave.includes("join(root,'node_modules/next/dist/bin/next')"));
});
