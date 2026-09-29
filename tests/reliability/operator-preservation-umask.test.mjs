// Run the actual filesystem suite in child processes, not mocked preservation adapters.
// A child-only umask keeps parallel test workers and the operator's private settings intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const suite = fileURLToPath(new URL('./operator-preservation.test.mjs', import.meta.url));
const child = `
  const {spawnSync} = require('node:child_process');
  process.umask(Number.parseInt(process.argv[1], 8));
  const result = spawnSync(process.execPath, ['--test', process.argv[2]], {
    stdio: 'inherit', timeout: 20000
  });
  process.exit(result.error || result.signal ? 1 : result.status ?? 1);
`;

for (const mask of ['022', '027', '077']) {
  test(`actual preservation suite passes with umask ${mask}`, {timeout: 30000}, () => {
    const parentMask = process.umask();
    const env = {...process.env};
    delete env.NODE_TEST_CONTEXT; // The nested invocation is its own test runner.
    const result = spawnSync(process.execPath, ['-e', child, mask, suite], {
      env, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024
    });
    assert.equal(process.umask(), parentMask, 'The parent umask must not be changed');
    assert.equal(result.error, undefined, 'The isolated child must execute');
    assert.equal(result.signal, null, 'The isolated child must finish');
    assert.equal(result.status, 0, `Preservation suite failed under umask ${mask}`);
    // Do not include raw child diagnostics in public assertion messages.
    const summary = {};
    for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const matches = [...result.stdout.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))];
      assert.equal(matches.length, 1, `One ${name} summary is required`);
      summary[name] = Number(matches[0][1]);
    }
    assert.deepEqual(summary, {tests: 27, pass: 27, fail: 0, cancelled: 0, skipped: 0, todo: 0});
  });
}
