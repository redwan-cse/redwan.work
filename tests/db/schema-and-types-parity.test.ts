import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
} from '../harness/disposable-pg.mjs';

/**
 * Method 3: Schema-vs-TypeScript & DB-Constraint Parity Gate
 *
 * Cross-checks live migrated PostgreSQL tables, enums, and critical atomic RPCs
 * against `lib/supabase/database.types.ts` so schema drift never slips into production.
 */
describe('Method 3: Schema-vs-TypeScript & DB-Constraint Parity Gate', () => {
  let pg: DisposablePostgres;
  let dbTypesSrc = '';

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    dbTypesSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/supabase/database.types.ts'),
      'utf8'
    );
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[M3-TABLE-PARITY] declares every migrated public table in lib/supabase/database.types.ts', async () => {
    const res = await pg.db.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`
    );
    const dbTables = res.rows.map((r) => r.table_name);
    expect(dbTables.length).toBeGreaterThanOrEqual(35);

    const tablesSection = dbTypesSrc.slice(
      dbTypesSrc.indexOf('Tables: {'),
      dbTypesSrc.indexOf('Views: {')
    );
    expect(tablesSection.length).toBeGreaterThan(500);

    const missingInTypes = dbTables.filter(
      (tbl) => !new RegExp(`\\b${tbl}:\\s*\\{`).test(tablesSection)
    );
    expect(
      missingInTypes,
      'Public tables migrated in SQL but missing from lib/supabase/database.types.ts'
    ).toEqual([]);
  });

  it('[M3-ENUM-PARITY] matches every public Postgres enum type and its enum values in database.types.ts', async () => {
    const res = await pg.db.query<{ typname: string; enumlabel: string }>(
      `select t.typname, e.enumlabel
       from pg_type t
       join pg_enum e on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public'
       order by t.typname, e.enumsortorder`
    );

    const enumsByName = new Map<string, string[]>();
    for (const row of res.rows) {
      const list = enumsByName.get(row.typname) ?? [];
      list.push(row.enumlabel);
      enumsByName.set(row.typname, list);
    }
    expect(enumsByName.size).toBeGreaterThanOrEqual(10);

    const enumsStart = dbTypesSrc.indexOf('Enums: {');
    const enumsSection = dbTypesSrc.slice(enumsStart);

    const missingEnums: string[] = [];
    const missingValues: string[] = [];
    for (const [enumName, labels] of enumsByName.entries()) {
      const rx = new RegExp(`\\b${enumName}:([\\s\\S]*?)(?=\\n\\s{6}[a-z_]+:|\\n\\s{4}\\})`);
      const match = enumsSection.match(rx);
      if (!match) {
        missingEnums.push(enumName);
        continue;
      }
      const def = match[1];
      for (const label of labels) {
        if (!def.includes(`'${label}'`) && !def.includes(`"${label}"`)) {
          missingValues.push(`${enumName}.${label}`);
        }
      }
    }

    expect(missingEnums, 'Postgres enums missing from database.types.ts').toEqual([]);
    expect(missingValues, 'Postgres enum values missing from database.types.ts').toEqual([]);
  });

  it('[M3-RPC-PARITY] verifies 100% of RPC functions declared in database.types.ts exist in the migrated public schema', async () => {
    const fnStart = dbTypesSrc.indexOf('Functions: {');
    const fnEnd = dbTypesSrc.indexOf('Enums: {');
    const fnSection = dbTypesSrc.slice(fnStart, fnEnd);
    const typedRpcs = [...fnSection.matchAll(/^\s{6}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
    expect(typedRpcs.length).toBeGreaterThanOrEqual(25);

    const res = await pg.db.query<{ proname: string }>(
      `select distinct p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`
    );
    const existing = new Set(res.rows.map((r) => r.proname));
    const missing = typedRpcs.filter((fn) => !existing.has(fn));
    expect(missing, 'RPCs declared in database.types.ts but missing from migrated public schema').toEqual([]);
  });
});
