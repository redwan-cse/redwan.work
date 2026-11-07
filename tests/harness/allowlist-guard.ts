const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ALLOWED_BUCKETS = new Set([
  'disposable-test-bucket',
  'test-vault-bucket',
  'isolated-ci-bucket',
]);

export function assertLoopbackUrl(rawUrl: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[allowlist-guard] Invalid URL for ${label}`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[allowlist-guard] Refusing non-loopback host "${parsed.hostname}" for ${label}. Tests must never touch remote or retained services.`
    );
  }
  return parsed;
}

export function assertDisposableSupabaseKeys(publishableKey: string, secretKey: string): void {
  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error(
      '[allowlist-guard] Disposable tests must use supported sb_publishable_* keys, never legacy anon JWT keys.'
    );
  }
  if (!secretKey.startsWith('sb_secret_')) {
    throw new Error(
      '[allowlist-guard] Disposable tests must use supported sb_secret_* keys, never legacy service_role JWT keys.'
    );
  }
  if (
    !publishableKey.includes('disposable') &&
    !publishableKey.includes('ci_placeholder') &&
    !publishableKey.includes('test_')
  ) {
    throw new Error('[allowlist-guard] Refusing unrecognized publishable key in test harness.');
  }
  if (
    !secretKey.includes('disposable') &&
    !secretKey.includes('ci_placeholder') &&
    !secretKey.includes('test_')
  ) {
    throw new Error('[allowlist-guard] Refusing unrecognized secret key in test harness.');
  }
}

export function assertDisposableBucket(bucket: string): void {
  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw new Error(
      `[allowlist-guard] Bucket "${bucket}" is not on the disposable test allowlist.`
    );
  }
}
