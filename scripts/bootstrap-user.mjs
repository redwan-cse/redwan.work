#!/usr/bin/env node
// Local-only bootstrap for auth users until the P3b admin UI exists.
// Usage:
//   node --env-file=.env.local scripts/bootstrap-user.mjs \
//     --email user@example.com (--password 's3cret' | --invite) \
//     --role admin|client [--full-name "Full Name"] [--company "Co"]
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const email = argOf('--email');
const password = argOf('--password');
const invite = args.includes('--invite');
const role = argOf('--role');
const fullName = argOf('--full-name');
const company = argOf('--company');

if (!email || !role || (!password && !invite)) {
  console.error('usage: --email <addr> (--password <pw> | --invite) --role admin|client [--full-name n] [--company c]');
  process.exit(1);
}
if (!['admin', 'client'].includes(role)) {
  console.error('--role must be admin or client');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in environment');
  process.exit(1);
}

const siteUrl = process.argv.includes('--site-url')
  ? argOf('--site-url')
  : 'http://localhost:3000';

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureProfile(userId) {
  // Only write fields the operator explicitly passed, so an update-path run
  // without --full-name/--company never nulls existing profile values.
  const payload = { id: userId, role };
  if (fullName !== undefined) payload.full_name = fullName;
  if (company !== undefined) payload.company = company;
  const { error } = await admin.from('profiles').upsert(payload, {
    onConflict: 'id',
  });
  if (error) throw new Error(`profile upsert failed: ${error.message}`);
}

async function findUserByEmail(email) {
  // supabase-js >= 2.9xx has no admin getUserByEmail; paginate listUsers instead.
  const needle = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`user lookup failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === needle);
    if (match) return match;
    if (page * perPage >= (data.total ?? data.users.length)) return null;
  }
}

async function main() {
  const existing = await findUserByEmail(email);

  let userId;
  if (existing) {
    userId = existing.id;
    const updates = { app_metadata: { ...existing.app_metadata, role } };
    if (password) updates.password = password;
    const { error } = await admin.auth.admin.updateUserById(userId, updates);
    if (error) throw new Error(`update failed: ${error.message}`);
    console.log(`updated existing user ${userId} (role=${role}${password ? ', password reset' : ''})`);
  } else if (invite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/invite/accept`,
    });
    if (error) throw new Error(`invite failed: ${error.message}`);
    userId = data.user.id;
    const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...data.user.app_metadata, role },
    });
    if (metaErr) throw new Error(`setting app_metadata failed: ${metaErr.message}`);
    console.log(`invited ${userId} (role=${role}) — invite email sent via configured SMTP`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
    });
    if (error) throw new Error(`create failed: ${error.message}`);
    userId = data.user.id;
    console.log(`created user ${userId} (role=${role}, confirmed)`);
  }

  await ensureProfile(userId);
  console.log(`profile upserted (role=${role})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
