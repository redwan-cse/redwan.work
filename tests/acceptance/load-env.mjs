/**
 * Explicit Disposable Environment Loader & Validator for Acceptance Testing.
 * Zero silent authorization:
 * - NO fallback credentials
 * - NO auto-setting DISPOSABLE_AUTH_CI
 * - NO auto-generated run IDs
 * Fails closed immediately if explicit opt-in or required variables are missing.
 */

export const REQUIRED_ACCEPTANCE_ENV_VARS = [
  'DISPOSABLE_AUTH_CI',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'R2_ENDPOINT',
  'R2_PRIVATE_BUCKET',
  'R2_PRIVATE_ACCESS_KEY_ID',
  'R2_PRIVATE_SECRET_ACCESS_KEY',
  'APP_URL',
  'DISPOSABLE_RUN_ID',
  'LEAD_IP_HASH_SALT',
];

export function validateAcceptanceEnv(env = process.env) {
  // 1. Explicit Opt-In: DISPOSABLE_AUTH_CI must be explicitly set to 'true'
  if (!env.DISPOSABLE_AUTH_CI || env.DISPOSABLE_AUTH_CI !== 'true') {
    throw new Error(
      'CRITICAL SAFETY HALT: DISPOSABLE_AUTH_CI must be explicitly set to "true" in the environment. Silent test authorization is forbidden.'
    );
  }

  // 2. Ephemeral Configuration: all required variables must be non-empty strings without fallback
  const missing = [];
  for (const v of REQUIRED_ACCEPTANCE_ENV_VARS) {
    if (!env[v] || typeof env[v] !== 'string' || env[v].trim() === '') {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `CRITICAL SAFETY HALT: Missing required disposable environment configuration without fallback: ${missing.join(', ')}`
    );
  }

  // 3. Run ID format check
  if (!env.DISPOSABLE_RUN_ID.startsWith('test-run-')) {
    throw new Error(
      `CRITICAL SAFETY HALT: DISPOSABLE_RUN_ID must start with "test-run-", got: "${env.DISPOSABLE_RUN_ID}"`
    );
  }

  return true;
}

// Fail closed on import unless auto-validation is explicitly suppressed (e.g. during isolated unit tests of validateAcceptanceEnv)
if (process.env.SUPPRESS_LOAD_ENV_AUTO_VALIDATE !== 'true') {
  validateAcceptanceEnv(process.env);
}
