import 'server-only';
/** Approved backup/restore contract, 2026-09-17. Test-first scaffold.
 * No callers or production behavior are changed by this module alone.
 */
export const RECOVERY_MAX_BYTES = 100 * 1024 * 1024;
export type RecoveryEntry = { name: string; bytes: Buffer };
export function encodeRecoveryArchive(_entries: readonly RecoveryEntry[]): Buffer {
  throw new Error('Recovery archive unavailable.');
}
export function decodeRecoveryArchive(_archive: Buffer): Map<string, Buffer> {
  throw new Error('Recovery archive unavailable.');
}
