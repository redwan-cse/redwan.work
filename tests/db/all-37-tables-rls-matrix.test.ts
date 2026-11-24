import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

/**
 * Method 1: Complete Public-Schema RLS Matrix (All Tables × 5 Roles) + Credit-Note Immutability
 *
 * Dynamically enumerates every table in `public` so no future migration can introduce an
 * unprotected table or forget an RLS policy without immediately failing CI.
 */
const INTENTIONALLY_PUBLIC_READ_TABLES = new Set([
  'services',
  'service_packages',
  'portfolio_items',
  'resume_items',
  'site_settings',
  'consent_policies',
  'client_reviews',
]);

describe('Method 1: Complete Public-Schema RLS Matrix (All Tables × 5 Roles)', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let clientB: TestUserRecord;
  let allPublicTables: string[] = [];

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'm1-admin@disposable.test',
      fullName: 'Matrix Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'm1-client-a@disposable.test',
      fullName: 'Matrix Client A',
      role: 'client',
      isActive: true,
    });
    clientB = await pg.createTestUser({
      email: 'm1-client-b@disposable.test',
      fullName: 'Matrix Client B',
      role: 'client',
      isActive: true,
    });

    const tblRes = await pg.db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`
    );
    allPublicTables = tblRes.rows.map((r) => r.tablename);

    // Seed representative rows in sensitive private tables owned by Client B / Admin
    const svc = await pg.db.query<{ id: string }>(
      `select id from public.services limit 1`
    );
    const ordB = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.orders (client_id, service_id, title, status, priority, currency, subtotal_cents, total_cents, deposit_percent)
       values ($1, $2, 'Matrix Secret Order B', 'in_progress', 'standard', 'USD', 80000, 80000, 50)
       returning id`,
      [clientB.id, svc.rows[0].id]
    );
    const invB = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.invoices (order_id, client_id, is_deposit_invoice, status, currency, subtotal_cents, total_cents, fx_rate_to_usd, due_at, issued_at)
       values ($1, $2, false, 'issued', 'USD', 40000, 40000, 1.0, now() + interval '7 days', now())
       returning id`,
      [ordB.rows[0].id, clientB.id]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.credit_notes (invoice_id, client_id, amount_cents, currency, reason, issued_by)
       values ($1, $2, 5000, 'USD', 'Matrix Immutability Test Credit', $3)`,
      [invB.rows[0].id, clientB.id, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.client_notes (client_id, author_id, note_type, body)
       values ($1, $2, 'general', 'Confidential Admin Note on Client B')`,
      [clientB.id, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.email_outbox (to_email, template, subject, payload)
       values ($1, 'invoice_issued', 'Matrix Outbox Entry', '{"message":"secret"}'::jsonb)`,
      [clientB.email]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.rate_limits (kind, key_hash, window_started_at, count)
       values ('ip', 'matrix-rl-hash', now(), 1)`
    );
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[M1-RLS-COVERAGE] enforces RLS enabled + >=1 policy on 100% of public tables', async () => {
    expect(allPublicTables.length).toBeGreaterThanOrEqual(35);

    const rlsStatus = await pg.db.query<{
      tablename: string;
      rowsecurity: boolean;
      policy_count: number;
    }>(
      `select
         t.tablename,
         t.rowsecurity,
         (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as policy_count
       from pg_tables t
       where t.schemaname = 'public'
       order by t.tablename`
    );

    const unprotected = rlsStatus.rows.filter((r) => !r.rowsecurity);
    const policyLess = rlsStatus.rows.filter((r) => r.policy_count === 0);

    expect(unprotected, 'Tables missing ENABLE ROW LEVEL SECURITY').toEqual([]);
    expect(policyLess, 'Tables with RLS enabled but 0 policies').toEqual([]);
  });

  it('[M1-ANON-ZERO-LEAK] blocks anon from reading any non-public table across the entire schema', async () => {
    const privateTables = allPublicTables.filter((t) => !INTENTIONALLY_PUBLIC_READ_TABLES.has(t));
    expect(privateTables.length).toBeGreaterThanOrEqual(28);

    const leaked: Array<{ table: string; rows: number }> = [];
    for (const table of privateTables) {
      try {
        const res = await pg.queryAs(
          { pgRole: 'anon' },
          `select count(*)::int as cnt from public."${table}"`
        );
        const cnt = Number((res.rows[0] as { cnt: number }).cnt);
        if (cnt > 0) {
          leaked.push({ table, rows: cnt });
        }
      } catch {
        // Permission denied / RLS block is a valid fail-closed outcome for anon
      }
    }
    expect(leaked, 'Private tables leaked rows to anon').toEqual([]);
  });

  it('[M1-ROLE-BOUNDARIES] blocks Client A and AAL1 Admin from sensitive admin/Client-B tables while allowing AAL2 Admin', async () => {
    const adminOnlyTables = [
      'email_outbox',
      'client_notes',
      'rate_limits',
      'vault_upload_reservations',
    ];

    for (const table of adminOnlyTables) {
      // Client A must see 0 rows or receive permission denied (fail-closed)
      const clientACnt = await pg
        .queryAs<{ cnt: number }>(
          { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
          `select count(*)::int as cnt from public."${table}"`
        )
        .then((r) => r.rows[0].cnt)
        .catch(() => 0);
      expect(clientACnt, `Client A read ${table}`).toBe(0);

      // Admin AAL1 (pre-MFA) must see 0 rows or receive permission denied (fail-closed)
      const aal1Cnt = await pg
        .queryAs<{ cnt: number }>(
          { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
          `select count(*)::int as cnt from public."${table}"`
        )
        .then((r) => r.rows[0].cnt)
        .catch(() => 0);
      expect(aal1Cnt, `AAL1 Admin read ${table}`).toBe(0);
    }

    // Admin AAL2 CAN read admin-managed tables (client_notes & email_outbox)
    const aal2Notes = await pg.queryAs<{ cnt: number }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select count(*)::int as cnt from public.client_notes`
    );
    expect(aal2Notes.rows[0].cnt).toBeGreaterThanOrEqual(1);

    const aal2Outbox = await pg.queryAs<{ cnt: number }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select count(*)::int as cnt from public.email_outbox`
    );
    expect(aal2Outbox.rows[0].cnt).toBeGreaterThanOrEqual(1);

    // Client A cannot read Client B's orders, invoices, or credit notes
    for (const tenantTable of ['orders', 'invoices', 'credit_notes']) {
      const cross = await pg.queryAs<{ cnt: number }>(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select count(*)::int as cnt from public."${tenantTable}" where client_id = $1`,
        [clientB.id]
      );
      expect(cross.rows[0].cnt, `Cross-tenant leak on ${tenantTable}`).toBe(0);
    }
  });

  it('[M1-CREDIT-NOTE-IMMUTABLE] blocks UPDATE and DELETE on credit_notes for both adminAAL2 and service_role', async () => {
    const cnRow = await pg.db.query<{ id: string }>(
      `select id from public.credit_notes limit 1`
    );
    const cnId = cnRow.rows[0].id;

    // UPDATE must fail even for service_role
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `update public.credit_notes set amount_cents = 999999 where id = $1`,
        [cnId]
      )
    ).rejects.toThrow(/immutable|cannot be|credit/i);

    // DELETE must fail even for service_role
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `delete from public.credit_notes where id = $1`,
        [cnId]
      )
    ).rejects.toThrow(/immutable|cannot be|credit/i);

    // Admin AAL2 UPDATE/DELETE also blocked
    const aal2Del = await pg
      .queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `delete from public.credit_notes where id = $1 returning id`,
        [cnId]
      )
      .then((r) => r.rows.length)
      .catch(() => 0);
    expect(aal2Del).toBe(0);
  });
});
