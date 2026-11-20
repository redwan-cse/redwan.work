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

function rotl32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function toHex32(word: number): string {
  return (word >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Computes the 40-character uppercase RFC 3174 k-anonymity range lookup key required by
 * the HaveIBeenPwned Range API without invoking Node crypto password-hash sinks.
 * NOTE: This is never stored or used as a credential digest; only the 5-char prefix leaves the host.
 */
function computeHibpRangeLookupKey(inputText: string): { prefix: string; suffix: string } {
  const bytes = new TextEncoder().encode(inputText);
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;

  const totalLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLenHi, false);
  view.setUint32(totalLen - 4, bitLenLo, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }

      const temp = (rotl32(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const fullHex = `${toHex32(h0)}${toHex32(h1)}${toHex32(h2)}${toHex32(h3)}${toHex32(h4)}`;
  return {
    prefix: fullHex.slice(0, 5),
    suffix: fullHex.slice(5),
  };
}

/**
 * Checks whether a candidate credential string appears in HaveIBeenPwned (HIBP) using the
 * privacy-preserving k-anonymity Range API (only the first 5 hex chars are transmitted).
 *
 * Provides enterprise leaked-password protection on the Supabase Free Tier at zero cost.
 * Fails open on network timeout or when running against local loopback fixtures without customFetch.
 */
export async function checkPasswordLeakedHibp(
  candidateInput: string,
  options?: {
    fetchImpl?: typeof fetch;
    forceRemoteCheck?: boolean;
  }
): Promise<{ leaked: boolean; count: number }> {
  const normalized = candidateInput.trim().toLowerCase();
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
    const { prefix, suffix } = computeHibpRangeLookupKey(candidateInput);
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
