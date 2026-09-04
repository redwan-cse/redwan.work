/**
 * Canonical site origin for non-email contexts.
 *
 * Pure function (no `headers()` call): returns `NEXT_PUBLIC_SITE_URL`
 * stripped of trailing `/` when set, else the production origin.
 * For email links use `emailOrigin()` from `@/lib/email/recipients`,
 * which adds request-header fallback for local development.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  return configured || 'https://redwan.work';
}
