const DIRECT_IMAGE_HOSTS = new Set(['cdn.jsdelivr.net', 'raw.githubusercontent.com']);
/** Optimization policy only, not authorization for fetching arbitrary URLs. */
export function isDirectBlogImage(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.port === '' || url.port === '443') && DIRECT_IMAGE_HOSTS.has(url.hostname);
  } catch { return false; }
}
