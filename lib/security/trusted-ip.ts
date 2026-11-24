/**
 * Centralized trusted client IP resolver.
 *
 * On Vercel, `x-vercel-forwarded-for` is set directly by the edge proxy and
 * cannot be forged by clients, whereas `cf-connecting-ip` is client-spoofable
 * when traffic is not fronted by Cloudflare. Always prefer the platform-owned
 * edge header first and pick the rightmost hop from forwarded chains.
 */
export function resolveTrustedIp(headers: Pick<Headers, 'get'>): string {
  const vercelForwarded = headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) {
    const rightmost = vercelForwarded
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (rightmost) return rightmost;
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const rightmost = forwarded
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (rightmost) return rightmost;
  }

  const cfIp = headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  return 'unknown';
}
