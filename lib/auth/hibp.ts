import { createHash } from 'node:crypto';

/**
 * High-frequency 12+ character breached passwords rejected offline before any network call.
 */
const COMMON_BREACHED_PASSWORDS_12_PLUS = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '111111111111',
  '000000000000',
  'password1234',
  'password12345',
  'password123456',
  'password123!',
  'p@ssw0rd1234',
  'qwertyuiop12',
  'qwerty123456',
  'admin1234567',
  'welcome12345',
  'letmein12345',
  'changeme1234',
  'iloveyou1234',
  'sunshine1234',
  'princess1234',
  'football1234',
  'baseball1234',
  'superman1234',
  'trustno11234',
]);

export const LEAKED_PASSWORD_ERROR =
  'This password appears in known public data breaches. Please choose a unique, uncompromised password.';

/**
 * Checks whether a candidate password appears in HaveIBeenPwned (HIBP) using the
 * privacy-preserving k-anonymity Range API (only the first 5 SHA-1 hex chars are transmitted).
 *
 * Provides enterprise leaked-password protection on the Supabase Free Tier at zero cost.
 * Fails open on network timeout or when running against local loopback fixtures without customFetch.
 */
export async function checkPasswordLeakedHibp(
  password: string,
  options?: {
    fetchImpl?: typeof fetch;
    forceRemoteCheck?: boolean;
  }
): Promise<{ leaked: boolean; count: number }> {
  const normalized = password.trim().toLowerCase();
  if (COMMON_BREACHED_PASSWORDS_12_PLUS.has(normalized)) {
    return { leaked: true, count: 1000 };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const isLoopbackEnv =
    !options?.forceRemoteCheck &&
    !options?.fetchImpl &&
    (process.env.VITEST === 'true' ||
      supabaseUrl.includes('127.0.0.1') ||
      supabaseUrl.includes('localhost'));

  if (isLoopbackEnv) {
    return { leaked: false, count: 0 };
  }

  try {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const fetchFn = options?.fetchImpl ?? fetch;

    const response = await fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'redwan.work-auth-hibp-check/2.0',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return { leaked: false, count: 0 };
    }

    const body = await response.text();
    for (const rawLine of body.split(/\r?\n/)) {
      const [hashSuffix, countStr] = rawLine.split(':');
      if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
        const count = Number.parseInt((countStr ?? '0').trim(), 10);
        if (Number.isFinite(count) && count > 0) {
          return { leaked: true, count };
        }
        return { leaked: false, count: 0 };
      }
    }

    return { leaked: false, count: 0 };
  } catch {
    // Fail open if HIBP API is temporarily unreachable so signups/resets are not bricked
    return { leaked: false, count: 0 };
  }
}
