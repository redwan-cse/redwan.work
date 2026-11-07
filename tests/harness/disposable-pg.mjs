import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SUPABASE_PREAMBLE_SQL = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

alter role anon set search_path = public, extensions;
alter role authenticated set search_path = public, extensions;
alter role service_role set search_path = public, extensions;
set search_path = public, extensions;

create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz default timezone('utc', now()),
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  aud text not null default 'authenticated',
  role text not null default 'authenticated',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'sub', '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user::text
  );
$$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant all on all tables in schema auth to service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function listMigrationFiles(rootDir = process.cwd(), { maxPrefix = null } = {}) {
  const dir = resolve(rootDir, 'supabase/migrations');
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .filter((f) => (maxPrefix ? f.slice(0, 4) <= maxPrefix : true))
    .map((f) => ({ name: f, path: resolve(dir, f) }));
}

export async function createDisposablePostgres({
  rootDir = process.cwd(),
  maxMigrationPrefix = null,
  applySeed = true,
} = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_PREAMBLE_SQL);

  const applied = [];
  const files = listMigrationFiles(rootDir, { maxPrefix: maxMigrationPrefix });
  for (const file of files) {
    const sql = readFileSync(file.path, 'utf8');
    await db.exec(`set search_path = public, extensions;\n${sql}`);
    applied.push(file.name);
  }

  if (applySeed) {
    const seedPath = resolve(rootDir, 'supabase/seed.sql');
    const seedSql = readFileSync(seedPath, 'utf8');
    await db.exec(`set search_path = public, extensions;\n${seedSql}`);
  }

  async function applyMigrationsAfter(afterPrefix) {
    const remaining = listMigrationFiles(rootDir).filter((f) => f.name.slice(0, 4) > afterPrefix);
    for (const file of remaining) {
      const sql = readFileSync(file.path, 'utf8');
      await db.exec(`set search_path = public, extensions;\n${sql}`);
      applied.push(file.name);
    }
    return remaining.map((f) => f.name);
  }

  async function createTestUser({
    id,
    email,
    fullName = 'Synthetic User',
    role = 'client',
    isActive = true,
    mfaEnforced = role === 'admin',
  }) {
    const userRes = await db.query(
      `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
       values (
         coalesce($1::uuid, extensions.gen_random_uuid()),
         $2,
         jsonb_build_object('full_name', $3::text),
         jsonb_build_object('role', $4::text)
       )
       returning id, email`,
      [id ?? null, email, fullName, role]
    );
    const created = userRes.rows[0];
    await db.query(
      `update public.profiles
       set role = $2::public.user_role,
           is_active = $3,
           mfa_enforced = $4,
           full_name = $5
       where id = $1`,
      [created.id, role, isActive, mfaEnforced, fullName]
    );
    return { id: created.id, email: created.email, role, isActive, mfaEnforced, fullName };
  }

  async function queryAs(context, sql, params = []) {
    const pgRole =
      context.pgRole ??
      (context.role === 'anon'
        ? 'anon'
        : context.role === 'service_role'
          ? 'service_role'
          : 'authenticated');

    const claims =
      pgRole === 'anon'
        ? { role: 'anon' }
        : pgRole === 'service_role'
          ? { role: 'service_role' }
          : {
              sub: context.userId,
              email: context.email ?? 'user@test.local',
              role: 'authenticated',
              aal: context.aal ?? 'aal1',
              app_metadata: { role: context.appRole ?? 'client' },
              user_metadata: {},
            };

    return db.transaction(async (tx) => {
      await tx.exec(`set local search_path = public, extensions;`);
      await tx.exec(`set local role ${pgRole};`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      if (claims.sub) {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [claims.sub]);
      } else {
        await tx.query(`select set_config('request.jwt.claim.sub', '', true)`);
      }
      await tx.query(`select set_config('request.jwt.claim.role', $1, true)`, [claims.role]);
      return tx.query(sql, params);
    });
  }

  return {
    db,
    appliedMigrations: applied,
    applyMigrationsAfter,
    createTestUser,
    queryAs,
    async close() {
      await db.close();
    },
  };
}
