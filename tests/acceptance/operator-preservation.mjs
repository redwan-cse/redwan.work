// Read-only Linux file preservation. This module grants no cleanup authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const digest = value => createHash('sha256').update(value).digest('hex');
const within = (file, root) => file === root || file.startsWith(root + path.sep);
const metadata = s => Object.fromEntries(
  ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .map(key => [key, s[key].toString()])
);

export class PreservationError extends Error {
  constructor(category, file = null) {
    super(`PRESERVATION/${category}`);
    this.name = 'PreservationError';
    this.category = category;
    this.pathToken = file === null ? null : digest(file);
  }
}
const refuse = (category, file = null) => { throw new PreservationError(category, file); };
function io(file, action) {
  try { return action(); }
  catch (error) {
    if (error instanceof PreservationError) throw error;
    const code = ['ENOENT', 'EACCES', 'EPERM', 'ELOOP'].includes(error?.code) ? error.code : 'io-failed';
    refuse(code, file);
  }
}
function stat(file) { return io(file, () => fs.lstatSync(file, {bigint: true})); }
function same(a, b, file) {
  if (!isDeepStrictEqual(metadata(a), metadata(b))) refuse('metadata-changed', file);
}
function ancestry(file) {
  const ancestors = [];
  for (let p = path.dirname(file); ; p = path.dirname(p)) {
    const s = stat(p);
    if (s.isSymbolicLink()) refuse('symlink-refused', p);
    if (!s.isDirectory()) refuse('parent-not-directory', p);
    ancestors.push({path: p, dev: s.dev, ino: s.ino});
    if (p === path.dirname(p)) break;
  }
  return ancestors;
}
function verifyAncestry(before) {
  for (const item of before) {
    const s = stat(item.path);
    if (s.isSymbolicLink() || !s.isDirectory() || s.dev !== item.dev || s.ino !== item.ino)
      refuse('ancestor-changed', item.path);
  }
}
function fileHash(file, initial, strict) {
  if (initial.nlink < 1n) refuse('invalid-link-count', file);
  if (strict && initial.nlink !== 1n) refuse('private-multiple-links', file);
  const parents = ancestry(file);
  const fd = io(file, () => fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK));
  try {
    const start = io(file, () => fs.fstatSync(fd, {bigint: true}));
    if (!start.isFile()) refuse('not-regular-file', file);
    same(initial, start, file);
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
    let total = 0n;
    while (total <= start.size) {
      const length = Number(start.size - total + 1n < BigInt(buffer.length) ? start.size - total + 1n : BigInt(buffer.length));
      const read = io(file, () => fs.readSync(fd, buffer, 0, length, null));
      if (read === 0) break;
      total += BigInt(read);
      if (total > start.size) refuse('file-size-changed', file);
      hash.update(buffer.subarray(0, read));
    }
    if (total !== start.size) refuse('file-size-changed', file);
    same(start, io(file, () => fs.fstatSync(fd, {bigint: true})), file);
    same(start, stat(file), file);
    verifyAncestry(parents);
    return hash.digest('hex');
  } finally { io(file, () => fs.closeSync(fd)); }
}
function normalizeRoots(values, label) {
  if (!Array.isArray(values)) refuse(`invalid-${label}`);
  const result = values.map(value => {
    if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) refuse(`invalid-${label}`);
    return path.resolve(value);
  }).sort();
  if (new Set(result).size !== result.length) refuse(`duplicate-${label}`);
  return result;
}

// Preserve regular hardlinks as-is. Known private inputs retain one-link, owner and mode checks.
// Returned paths, inode metadata and hashes belong in private operator evidence, not public logs.
export function capturePreservedTree(roots, {privateRoots = [], maxEntries = 1_000_000} = {}) {
  const selected = normalizeRoots(roots, 'roots');
  const strict = normalizeRoots(privateRoots, 'private-roots');
  if (!selected.length || !Number.isSafeInteger(maxEntries) || maxEntries < 1) refuse('invalid-scope');
  for (let i = 0; i < selected.length; i++)
    if (selected.some((root, j) => i !== j && within(selected[i], root))) refuse('overlapping-roots');
  if (strict.some(root => !selected.some(parent => within(root, parent)))) refuse('private-root-outside-scope');
  const entries = [], directories = new Set();
  const walk = (file, depth) => {
    if (depth > 512 || entries.length >= maxEntries) refuse('inventory-limit', file);
    const parents = ancestry(file), s = stat(file), isPrivate = strict.some(root => within(file, root));
    if (s.isSymbolicLink()) refuse('symlink-refused', file);
    if (!s.isDirectory() && !s.isFile()) refuse('unsupported-file-type', file);
    if (isPrivate) {
      if (s.uid !== BigInt(process.getuid())) refuse('private-owner-mismatch', file);
      if ((s.mode & 0o7777n) !== (s.isDirectory() ? 0o700n : 0o600n)) refuse('private-mode-mismatch', file);
    }
    if (s.isDirectory()) {
      const inode = `${s.dev}:${s.ino}`;
      if (directories.has(inode)) refuse('directory-alias', file);
      directories.add(inode);
      const names = io(file, () => fs.readdirSync(file).sort());
      entries.push({path: file, kind: 'directory', private: isPrivate, ...metadata(s)});
      for (const name of names) walk(path.join(file, name), depth + 1);
      if (!isDeepStrictEqual(names, io(file, () => fs.readdirSync(file).sort()))) refuse('directory-entries-changed', file);
      same(s, stat(file), file);
    } else {
      const sha256 = fileHash(file, s, isPrivate);
      entries.push({path: file, kind: 'file', private: isPrivate, ...metadata(s), sha256});
    }
    verifyAncestry(parents);
  };
  for (const root of selected) walk(root, 0);
  // A required private subroot must exist, not merely have an allowed lexical prefix.
  if (strict.some(root => !entries.some(entry => entry.path === root))) refuse('private-root-missing');
  return {schema: 'operator-preservation-v1', roots: selected, privateRoots: strict, maxEntries, entries};
}

export function verifyPreservedTree(before) {
  if (before?.schema !== 'operator-preservation-v1') refuse('invalid-baseline');
  const after = capturePreservedTree(before.roots, {privateRoots: before.privateRoots, maxEntries: before.maxEntries});
  if (!isDeepStrictEqual(before, after)) refuse('inventory-changed');
  return preservationCounts(after);
}

export function preservationCounts(snapshot) {
  if (snapshot?.schema !== 'operator-preservation-v1' || !Array.isArray(snapshot.entries)) refuse('invalid-baseline');
  const files = snapshot.entries.filter(row => row.kind === 'file');
  const linked = files.filter(row => BigInt(row.nlink) > 1n);
  return {
    files: files.length, directories: snapshot.entries.length - files.length,
    privateFiles: files.filter(row => row.private).length,
    hardlinkedPaths: linked.length,
    distinctHardlinkedInodes: new Set(linked.map(row => `${row.dev}:${row.ino}`)).size
  };
}

export function safePreservationFailure(error) {
  return error instanceof PreservationError
    ? {category: error.category, pathToken: error.pathToken}
    : {category: 'unclassified-preservation-failure', pathToken: null};
}
