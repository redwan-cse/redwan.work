import 'server-only';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function consumeRateLimit(
  kind: string,
  rawKey: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const salt =
    process.env.LEAD_IP_HASH_SALT ||
    (process.env.NODE_ENV !== 'production' ? 'test-only-ephemeral-salt' : '');
  if (!salt) {
    throw new Error('LEAD_IP_HASH_SALT is required in production.');
  }
  const keyHash = createHash('sha256').update(`${salt}:${kind}:${rawKey}`).digest('hex');
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_kind: kind,
    p_key_hash: keyHash,
    p_window_seconds: windowSeconds,
    p_max_count: maxCount,
  });
  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data);
}
