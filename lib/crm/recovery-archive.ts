import 'server-only';
import { inflateRawSync } from 'node:zlib';
/** Restricted ZIP dialect for app backups; never extracts to the filesystem.
 * Supports stored/deflated entries and signed data descriptors from archiver.
 * Integrity is not provenance: callers must validate manifests and authority.
 */
export const RECOVERY_MAX_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 2004;
export type RecoveryEntry = { name: string; bytes: Buffer };
const SAFE_NAME = /^(?:recovery|project|milestones|files)\.json$|^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function invalid(): never { throw new Error('Recovery archive is invalid or exceeds supported limits.'); }
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let c = value;
  for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 255];
  return (c ^ 0xffffffff) >>> 0;
}
export function encodeRecoveryArchive(entries: readonly RecoveryEntry[]): Buffer {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ENTRIES) return invalid();
  const seen = new Set<string>();
  const localParts: Buffer[] = [], centralParts: Buffer[] = [];
  let offset = 0, expanded = 0, centralSize = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !SAFE_NAME.test(entry.name) || seen.has(entry.name) || !Buffer.isBuffer(entry.bytes)) return invalid();
    seen.add(entry.name);
    expanded += entry.bytes.length;
    if (expanded > RECOVERY_MAX_BYTES) return invalid();
    const name = Buffer.from(entry.name, 'ascii'), crc = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(entry.bytes.length, 18); local.writeUInt32LE(entry.bytes.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(entry.bytes.length, 20); central.writeUInt32LE(entry.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    localParts.push(local, name, entry.bytes); centralParts.push(central, name);
    offset += local.length + name.length + entry.bytes.length;
    centralSize += central.length + name.length;
    if (offset + centralSize + 22 > RECOVERY_MAX_BYTES) return invalid();
  }
  if (!seen.has('recovery.json')) return invalid();
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}
export function decodeRecoveryArchive(archive: Buffer): Map<string, Buffer> {
  try {
    if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > RECOVERY_MAX_BYTES) return invalid();
    const end = archive.length - 22;
    if (archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt16LE(end + 4) !== 0 || archive.readUInt16LE(end + 6) !== 0 || archive.readUInt16LE(end + 20) !== 0) return invalid();
    const count = archive.readUInt16LE(end + 10), centralSize = archive.readUInt32LE(end + 12), centralStart = archive.readUInt32LE(end + 16);
    if (!count || count > MAX_ENTRIES || archive.readUInt16LE(end + 8) !== count || centralStart + centralSize !== end) return invalid();
    const result = new Map<string, Buffer>();
    let cursor = centralStart, expanded = 0;
    const ranges: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) return invalid();
      const version = archive.readUInt16LE(cursor + 6), flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10);
      const crc = archive.readUInt32LE(cursor + 16), compressedSize = archive.readUInt32LE(cursor + 20), size = archive.readUInt32LE(cursor + 24);
      const nameLength = archive.readUInt16LE(cursor + 28), extraLength = archive.readUInt16LE(cursor + 30), commentLength = archive.readUInt16LE(cursor + 32);
      const disk = archive.readUInt16LE(cursor + 34), attrs = archive.readUInt32LE(cursor + 38), localOffset = archive.readUInt32LE(cursor + 42);
      // No encryption, ZIP64, multipart, comments, unknown flags, directories or
      // Unix symlinks/devices. Ordinary archive file permissions are accepted.
      const unixType = (attrs >>> 16) & 0xf000;
      if (version > 20 || (flags & ~(8 | 2048)) !== 0 || (method !== 0 && method !== 8) || disk || extraLength || commentLength || (attrs & 16) || (unixType !== 0 && unixType !== 0x8000)) return invalid();
      const next = cursor + 46 + nameLength;
      if (!nameLength || next > end) return invalid();
      const nameBytes = archive.subarray(cursor + 46, next), name = nameBytes.toString('utf8');
      if (!Buffer.from(name, 'utf8').equals(nameBytes) || !SAFE_NAME.test(name) || result.has(name)) return invalid();
      expanded += size;
      if (expanded > RECOVERY_MAX_BYTES || localOffset + 30 > centralStart || archive.readUInt32LE(localOffset) !== 0x04034b50) return invalid();
      if (archive.readUInt16LE(localOffset + 4) !== version || archive.readUInt16LE(localOffset + 6) !== flags || archive.readUInt16LE(localOffset + 8) !== method || archive.readUInt16LE(localOffset + 26) !== nameLength || archive.readUInt16LE(localOffset + 28) !== 0) return invalid();
      const start = localOffset + 30 + nameLength;
      if (start > centralStart || !archive.subarray(localOffset + 30, start).equals(nameBytes)) return invalid();
      let finish = start + compressedSize;
      if (finish > centralStart) return invalid();
      if (flags & 8) {
        if (archive.readUInt32LE(localOffset + 14) !== 0 || archive.readUInt32LE(localOffset + 18) !== 0 || archive.readUInt32LE(localOffset + 22) !== 0) return invalid();
        if (finish + 16 > centralStart || archive.readUInt32LE(finish) !== 0x08074b50 || archive.readUInt32LE(finish + 4) !== crc || archive.readUInt32LE(finish + 8) !== compressedSize || archive.readUInt32LE(finish + 12) !== size) return invalid();
        finish += 16;
      } else if (archive.readUInt32LE(localOffset + 14) !== crc || archive.readUInt32LE(localOffset + 18) !== compressedSize || archive.readUInt32LE(localOffset + 22) !== size) return invalid();
      const payload = archive.subarray(start, start + compressedSize);
      let bytes: Buffer;
      if (method === 0) {
        if (compressedSize !== size) return invalid();
        bytes = Buffer.from(payload);
      } else {
        const inflated = inflateRawSync(payload, { maxOutputLength: Math.max(1, size), info: true });
        if (inflated.engine.bytesWritten !== compressedSize) return invalid();
        bytes = inflated.buffer;
      }
      if (bytes.length !== size || crc32(bytes) !== crc) return invalid();
      result.set(name, bytes); ranges.push([localOffset, finish]); cursor = next;
    }
    if (cursor !== end || !result.has('recovery.json')) return invalid();
    ranges.sort((a, b) => a[0] - b[0]);
    let expected = 0;
    for (const [start, finish] of ranges) { if (start !== expected) return invalid(); expected = finish; }
    if (expected !== centralStart) return invalid();
    return result;
  } catch {
    return invalid();
  }
}
