import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';

const root = new URL('../../', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
const names = ['supabase-js', 'auth-js', 'ssr'];
const versions = names.map(name => {
  const entry = lock.packages[`node_modules/@supabase/${name}`];
  assert.match(entry?.version ?? '', /^\d+\.\d+\.\d+$/);
  const installed = JSON.parse(readFileSync(new URL(`node_modules/@supabase/${name}/package.json`, root), 'utf8'));
  assert.equal(installed.version, entry.version, 'installed Auth dependencies must match the committed lock');
  return entry.version;
});

test(`P1C SDK ${versions.join(' / ')} requires authenticated password change`, () => {
  assert.ok(existsSync(new URL('lib/auth/password-change.ts', root)), 'authenticated own-account password change is not implemented');
});

test('locked Auth SDK declares current password verification without a new sign-in', () => {
  const types = readFileSync(new URL('node_modules/@supabase/auth-js/src/lib/types.ts', root), 'utf8');
  assert.match(types, /current_password\??\s*:\s*string/, 'locked SDK must explicitly support current_password before implementation');
});
