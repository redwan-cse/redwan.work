// Pure classification helpers only. One-shot production/GitHub network entry points retired.
// Historical inspected executable: 485d3565af68647faf148a60d7b317dee3640406.
export function r2Category(value) {
  if (!value) return 'MISSING';
  if (typeof value !== 'string') return 'INVALID';
  if (/\s/.test(value)) return 'WHITESPACE';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return 'NON_HTTPS';
    if (u.username || u.password || u.port || u.search || u.hash) return 'INVALID';
    if (u.pathname !== '/') return 'NON_ROOT';
    if (/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(u.hostname)) return 'CANONICAL';
    if (/^[a-f0-9]{32}\.(eu|fedramp)\.r2\.cloudflarestorage\.com$/.test(u.hostname)) return 'JURISDICTION';
    return 'OTHER_HOST';
  } catch { return 'INVALID'; }
}
export function siteCategory(value) {
  if (!value) return 'MISSING';
  if (typeof value !== 'string' || /\s/.test(value)) return 'INVALID';
  try {
    const u = new URL(value);
    if (u.username || u.password || !['http:','https:'].includes(u.protocol)) return 'INVALID';
    if (u.origin === 'https://redwan.work') return u.pathname === '/' && !u.search && !u.hash ? 'PRODUCTION_ORIGIN' : 'PRODUCTION_WITH_PATH';
    if (['localhost','127.0.0.1','[::1]'].includes(u.hostname)) return 'LOCAL_ORIGIN';
    return 'OTHER_ORIGIN';
  } catch { return 'INVALID'; }
}
export function templateCategories(value) {
  const text = typeof value === 'string' ? value : '';
  return {
    'recovery-token-hash': /\{\{\s*\.TokenHash\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-confirmation-url': /\{\{\s*\.ConfirmationURL\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-reset-path': /\/reset-password\?/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-site-url': /\{\{\s*\.SiteURL\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
  };
}
export function outboxCategory(status, body) {
  if (status === 200) return Array.isArray(body) && body.length === 0 ? 'AVAILABLE' : 'UNEXPECTED_RESPONSE';
  if ([401,403].includes(status)) return 'DENIED';
  if (body?.code === 'PGRST205') return 'TABLE_NOT_IN_CACHE';
  if (body?.code === '42P01') return 'RELATION_MISSING';
  if (body?.code === '42501') return 'DENIED';
  return 'UNAVAILABLE';
}
