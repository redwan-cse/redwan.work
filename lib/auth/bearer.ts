import { timingSafeEqual } from 'crypto';

/**
 * Shared `Authorization: Bearer <token>` check (fail-closed).
 *
 * Returns false when the secret is missing, when the header is not a
 * `Bearer <token>` value, or when the token does not match. The compare
 * is length-guarded: `timingSafeEqual` requires equal-length buffers and
 * unequal length short-circuits safely (lengths alone leak nothing useful).
 */
export function requireBearer(secret: string | undefined, header: string | null): boolean {
  if (!secret) return false;
  const match = (header ?? '').match(/^Bearer (.+)$/);
  if (!match) return false;
  const provided = Buffer.from(match[1], 'utf-8');
  const expected = Buffer.from(secret, 'utf-8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
