import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  capturePreservedTree, verifyPreservedTree, preservationCounts,
  PreservationError, safePreservationFailure
} from '../acceptance/operator-preservation.mjs';

const secret = 'PRIVATE_CANARY_NOT_FOR_DIAGNOSTICS';
const fixture = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-preservation-'));
  const root = path.join(home, 'history'), privateRoot = path.join(root, 'private');
  fs.mkdirSync(root, {mode: 0o700}); fs.mkdirSync(privateRoot, {mode: 0o700});
  const file = path.join(root, 'first'), alias = path.join(root, 'second'), privateFile = path.join(privateRoot, 'state');
  fs.writeFileSync(file, secret, {mode: 0o600});
  // Only this synthetic file needs 0644; creation modes are filtered by umask.
  // Its parent remains private. Never relax the operator's umask or evidence modes.
  fs.chmodSync(file, 0o644); fs.linkSync(file, alias);
  fs.writeFileSync(privateFile, secret, {mode: 0o600});
  return {
    home, root, file, alias, privateRoot, privateFile,
    capture: () => capturePreservedTree([root], {privateRoots: [privateRoot]}),
    close: () => fs.rmSync(home, {recursive: true, force: true})
  };
};
const failure = fn => assert.throws(fn, error => error instanceof PreservationError && !error.message.includes(secret));

test('regular hardlinks are preserved with exact bytes and inode relationships', () => {
  const f = fixture();
  try {
    const before = f.capture(), rows = before.entries.filter(row => [f.file, f.alias].includes(row.path));
    assert.equal(rows.length, 2); assert.equal(rows[0].ino, rows[1].ino);
    assert.equal(rows[0].nlink, '2'); assert.equal(rows[0].sha256, createHash('sha256').update(secret).digest('hex'));
    assert.deepEqual(verifyPreservedTree(before), {
      files: 3, directories: 2, privateFiles: 1, hardlinkedPaths: 2, distinctHardlinkedInodes: 1
    });
    assert.equal(fs.readFileSync(f.file, 'utf8'), secret);
    assert.equal(fs.lstatSync(f.file).nlink, 2);
    assert.equal(fs.lstatSync(f.file).mode & 0o777, 0o644);
    assert.equal(fs.lstatSync(f.root).mode & 0o777, 0o700);
    assert.equal(fs.lstatSync(f.privateRoot).mode & 0o777, 0o700);
    assert.equal(fs.lstatSync(f.privateFile).mode & 0o777, 0o600);
  } finally { f.close(); }
});
for (const [name, change] of [
  ['write through alias', f => fs.writeFileSync(f.alias, 'changed')],
  ['same bytes on replacement inode', f => { fs.unlinkSync(f.alias); fs.writeFileSync(f.alias, secret); }],
  ['new external hardlink', f => fs.linkSync(f.file, path.join(f.home, 'external'))],
  ['removed hardlink', f => fs.unlinkSync(f.alias)],
  ['file mode change', f => fs.chmodSync(f.alias, 0o600)],
  ['directory mode change', f => fs.chmodSync(f.root, 0o755)],
  ['mtime change', f => fs.utimesSync(f.file, new Date(0), new Date(0))],
  ['same length changed bytes', f => fs.writeFileSync(f.file, 'X'.repeat(Buffer.byteLength(secret)))],
  ['added file', f => fs.writeFileSync(path.join(f.root, 'extra'), 'extra')],
  ['removed private file', f => fs.unlinkSync(f.privateFile)]
]) test(`unchanged verification refuses ${name}`, () => {
  const f = fixture();
  try { const before = f.capture(); change(f); failure(() => verifyPreservedTree(before)); }
  finally { f.close(); }
});
test('an external alias is allowed but not falsely inventoried', () => {
  const f = fixture();
  try {
    fs.linkSync(f.file, path.join(f.home, 'outside'));
    const baseline = f.capture();
    assert.equal(baseline.entries.filter(row => row.nlink === '3' && row.kind === 'file').length, 2);
    assert.equal(preservationCounts(baseline).hardlinkedPaths, 2);
    verifyPreservedTree(baseline);
    fs.unlinkSync(path.join(f.home, 'outside'));
    failure(() => verifyPreservedTree(baseline));
  } finally { f.close(); }
});
test('required private hardlinks remain refused', () => {
  const f = fixture();
  try {
    fs.linkSync(f.privateFile, path.join(f.home, 'private-alias'));
    assert.throws(f.capture, error => error.category === 'private-multiple-links');
  } finally { f.close(); }
});
for (const [name, change] of [
  ['public private file', f => fs.chmodSync(f.privateFile, 0o644)],
  ['public private directory', f => fs.chmodSync(f.privateRoot, 0o755)],
  ['private executable bit', f => fs.chmodSync(f.privateFile, 0o700)]
]) test(`private scope keeps mode restrictions: ${name}`, () => {
  const f = fixture();
  try { change(f); assert.throws(f.capture, error => error.category === 'private-mode-mismatch'); }
  finally { f.close(); }
});
for (const [name, change] of [
  ['file symlink', f => fs.symlinkSync(f.file, path.join(f.root, 'link'))],
  ['directory symlink', f => fs.symlinkSync(f.privateRoot, path.join(f.root, 'link'))],
  ['broken symlink', f => fs.symlinkSync(path.join(f.root, 'missing'), path.join(f.root, 'link'))]
]) test(`links are never followed: ${name}`, () => {
  const f = fixture();
  try { change(f); assert.throws(f.capture, error => error.category === 'symlink-refused'); }
  finally { f.close(); }
});
test('a symlink in root ancestry is refused', () => {
  const f = fixture();
  try {
    const linked = path.join(f.home, 'linked-root'); fs.symlinkSync(f.root, linked);
    assert.throws(() => capturePreservedTree([path.join(linked, 'private')]), error => error.category === 'symlink-refused');
  } finally { f.close(); }
});
test('named pipes are rejected without opening or hanging', () => {
  const f = fixture();
  try {
    const result = spawnSync('mkfifo', [path.join(f.root, 'pipe')], {encoding: 'utf8'});
    assert.equal(result.status, 0);
    assert.throws(f.capture, error => error.category === 'unsupported-file-type');
  } finally { f.close(); }
});
test('streamed large and empty files have correct hashes', () => {
  const f = fixture();
  try {
    const large = Buffer.alloc(3 * 1024 * 1024 + 9, 0x41);
    fs.writeFileSync(path.join(f.root, 'large'), large);
    fs.writeFileSync(path.join(f.root, 'empty'), '');
    const baseline = f.capture();
    for (const [name, data] of [['large', large], ['empty', Buffer.alloc(0)]]) {
      const row = baseline.entries.find(row => row.path === path.join(f.root, name));
      assert.equal(row.sha256, createHash('sha256').update(data).digest('hex'));
      assert.equal(row.size, String(data.length));
    }
    verifyPreservedTree(baseline);
  } finally { f.close(); }
});
test('same-inode content mutation during a read fails closed', () => {
  const f = fixture(), original = fs.readSync;
  try {
    let modified = false;
    fs.readSync = (...args) => {
      const result = original(...args);
      if (!modified && fs.fstatSync(args[0]).ino === fs.lstatSync(f.file).ino) {
        modified = true; fs.writeFileSync(f.alias, 'changed');
      }
      return result;
    };
    failure(f.capture); assert.equal(modified, true);
  } finally { fs.readSync = original; f.close(); }
});
test('replacement with identical bytes during a read fails closed', () => {
  const f = fixture(), original = fs.readSync;
  try {
    let modified = false;
    fs.readSync = (...args) => {
      const result = original(...args);
      if (!modified && fs.fstatSync(args[0]).ino === fs.lstatSync(f.file).ino) {
        modified = true; fs.unlinkSync(f.file); fs.writeFileSync(f.file, secret);
      }
      return result;
    };
    failure(f.capture); assert.equal(modified, true);
  } finally { fs.readSync = original; f.close(); }
});
test('safe errors never expose a path or raw filesystem exception', () => {
  const f = fixture();
  try {
    const missing = path.join(f.root, secret);
    let error;
    try { capturePreservedTree([missing]); } catch (caught) { error = caught; }
    const safe = safePreservationFailure(error);
    assert.equal(safe.category, 'ENOENT'); assert.match(safe.pathToken, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(safe).includes(f.root)); assert.ok(!JSON.stringify(error).includes(secret));
    assert.deepEqual(safePreservationFailure(new Error(secret)), {category: 'unclassified-preservation-failure', pathToken: null});
  } finally { f.close(); }
});
test('roots must be explicit, non-overlapping and privately scoped', () => {
  const f = fixture();
  try {
    for (const call of [
      () => capturePreservedTree([]), () => capturePreservedTree(['relative']),
      () => capturePreservedTree([f.root, f.root]), () => capturePreservedTree([f.root, f.privateRoot]),
      () => capturePreservedTree([f.root], {privateRoots: [f.home]}),
      () => capturePreservedTree([f.root], {privateRoots: [path.join(f.root, 'missing')]}),
      () => capturePreservedTree([f.root], {maxEntries: 1}), () => capturePreservedTree([f.root], {maxEntries: NaN}),
      () => verifyPreservedTree({})
    ]) failure(call);
  } finally { f.close(); }
});
test('normal Git local-clone object hardlinks can be inventoried without Git writes', () => {
  const f = fixture();
  try {
    const source = path.join(f.home, 'git-source'), clone = path.join(f.home, 'git-copy'), template = path.join(f.home, 'empty-template');
    fs.mkdirSync(template);
    const env = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0'};
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'])
      delete env[key];
    const git = args => {
      const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
        {env, encoding: 'utf8', timeout: 15000});
      assert.equal(result.status, 0, 'synthetic Git fixture failed');
    };
    git(['init', '--template=' + template, source]);
    fs.writeFileSync(path.join(source, 'fixture'), 'synthetic git object');
    git(['-C', source, 'add', 'fixture']);
    git(['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture']);
    git(['clone', '--local', '--no-checkout', '--template=' + template, source, clone]);
    const baseline = capturePreservedTree([source, clone]);
    assert.ok(preservationCounts(baseline).hardlinkedPaths >= 2);
    assert.ok(baseline.entries.some(row => row.path.includes('/.git/objects/') && row.kind === 'file' && BigInt(row.nlink) > 1n));
    verifyPreservedTree(baseline);
  } finally { f.close(); }
});
