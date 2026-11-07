import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposablePostgres, type DisposablePostgres, type TestUserRecord } from '../harness/disposable-pg.mjs';
import { assertDisposableSupabaseKeys, assertLoopbackUrl } from '../harness/allowlist-guard';

describe('Database Trust Boundaries, Function ACLs, AAL2 & Tenant Isolation', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let clientB: TestUserRecord;
  let inactiveClient: TestUserRecord;
  let serviceId: string;

  beforeAll(async () => {
    assertLoopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:9', 'SUPABASE_URL');
    assertDisposableSupabaseKeys(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_disposable_local_key',
      process.env.SUPABASE_SECRET_KEY ?? 'sb_secret_disposable_local_key'
    );

    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'admin@disposable.test',
      fullName: 'Security Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'client-a@disposable.test',
      fullName: 'Client Alpha',
      role: 'client',
      isActive: true,
    });
    clientB = await pg.createTestUser({
      email: 'client-b@disposable.test',
      fullName: 'Client Bravo',
      role: 'client',
      isActive: true,
    });
    inactiveClient = await pg.createTestUser({
      email: 'inactive@disposable.test',
      fullName: 'Deactivated Client',
      role: 'client',
      isActive: false,
    });

    const svcRes = await pg.db.query<{ id: string }>(
      `select id from public.services where is_public = true order by sort_order asc limit 1`
    );
    serviceId = svcRes.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[MIGRATION-BOOTSTRAP] bootstraps cleanly and upgrades cleanly from 0010 baseline with RLS enabled on all public tables', async () => {
    const rlsDisabled = await pg.db.query<{ tablename: string }>(
      `select tablename
       from pg_tables
       where schemaname = 'public'
         and rowsecurity is false`
    );
    expect(rlsDisabled.rows).toEqual([]);

    // Also verify upgrade path: 0001..0010 -> forward migrations
    const upgradePg = await createDisposablePostgres({ maxMigrationPrefix: '0010', applySeed: false });
    try {
      expect(upgradePg.appliedMigrations.length).toBe(10);
      const upgraded = await upgradePg.applyMigrationsAfter('0010');
      expect(upgraded.length).toBeGreaterThanOrEqual(1);
    } finally {
      await upgradePg.close();
    }
  });

  it('[FUNCTION-ACLS] revokes PUBLIC/anon execution on privileged RPCs and restricts internal jobs to service_role', async () => {
    const anonCheck = await pg.db.query<{ fn: string; allowed: boolean }>(
      `select fn, has_function_privilege('anon', fn, 'EXECUTE') as allowed
       from unnest(array[
         'public.accept_proposal_and_create_order(uuid, uuid)',
         'public.review_order_deliverable(uuid, uuid, text, text)',
         'public.review_invoice_payment(uuid, uuid, text, numeric, text)',
         'public.admin_command_center_metrics()',
         'public.client_portal_overview(uuid)',
         'public.consume_rate_limit(text, text, integer, integer)',
         'public.run_auto_accept_deliverables()',
         'public.is_admin()',
         'public.caller_account_state()'
       ]) as fn`
    );
    for (const row of anonCheck.rows) {
      expect(row, `${row.fn} must not be executable by anon`).toEqual({
        fn: row.fn,
        allowed: false,
      });
    }

    const authInternalCheck = await pg.db.query<{ fn: string; allowed: boolean }>(
      `select fn, has_function_privilege('authenticated', fn, 'EXECUTE') as allowed
       from unnest(array[
         'public.consume_rate_limit(text, text, integer, integer)',
         'public.run_auto_accept_deliverables()'
       ]) as fn`
    );
    for (const row of authInternalCheck.rows) {
      expect(row, `${row.fn} must not be executable by authenticated`).toEqual({
        fn: row.fn,
        allowed: false,
      });
    }
  });

  it('[RPC-ACTOR-BINDING] blocks client from spoofing admin/other-client UUIDs in SECURITY DEFINER RPCs', async () => {
    // Seed a sent proposal + issued invoice + submitted payment for Client A via service_role
    const propRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.proposals (
         client_id, recipient_email, recipient_name, title, scope_summary,
         deliverables_summary, estimated_days, currency, subtotal_cents, total_cents,
         deposit_percent, status
       ) values (
         $1, $2, 'Client Alpha', 'API VAPT Scope', 'Test summary',
         'Report', 7, 'USD', 100000, 100000, 50, 'sent'
       ) returning id`,
      [clientA.id, clientA.email]
    );
    const proposalId = propRes.rows[0].id;

    // Client B attempts to accept Client A's proposal by spoofing p_actor_id = clientA.id
    await expect(
      pg.queryAs(
        { userId: clientB.id, email: clientB.email, appRole: 'client', aal: 'aal1' },
        `select public.accept_proposal_and_create_order($1, $2)`,
        [proposalId, clientA.id]
      )
    ).rejects.toThrow();

    // Admin AAL2 attempts to accept Client A's proposal on Client A's behalf (must require genuine client owner)
    await expect(
      pg.queryAs(
        { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.accept_proposal_and_create_order($1, $2)`,
        [proposalId, clientA.id]
      )
    ).rejects.toThrow();

    // Legitimate Client A accepts their own proposal
    const accepted = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.accept_proposal_and_create_order($1, $2) as res`,
      [proposalId, clientA.id]
    );
    const { deposit_invoice_id: invoiceId } = accepted.rows[0].res;

    // Client A submits a payment row
    const payRes = await pg.queryAs<{ id: string }>(
      { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 50000, 'TX-SPOOF-CHECK-1')
       returning id`,
      [invoiceId, clientA.id]
    );
    const paymentId = payRes.rows[0].id;

    // Client A attempts to self-confirm payment by passing adminUser.id!
    await expect(
      pg.queryAs(
        { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select public.review_invoice_payment($1, $2, 'confirmed', 1, 'self-approved')`,
        [paymentId, adminUser.id]
      )
    ).rejects.toThrow();

    // Client A attempts to call admin_command_center_metrics()
    await expect(
      pg.queryAs(
        { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select public.admin_command_center_metrics()`
      )
    ).rejects.toThrow();
  });

  it('[ADMIN-AAL2] denies admin privileges at AAL1 when mfa_enforced is true and grants at AAL2', async () => {
    const aal1Check = await pg.queryAs<{ ok: boolean }>(
      { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
      `select public.is_admin() as ok`
    );
    expect(aal1Check.rows[0].ok).toBe(false);

    // Admin at AAL1 cannot read other clients' orders via RLS
    const aal1Orders = await pg.queryAs(
      { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
      `select id from public.orders where client_id = $1`,
      [clientA.id]
    );
    expect(aal1Orders.rows.length).toBe(0);

    // Admin at AAL1 cannot self-disable mfa_enforced on their own profile row
    await expect(
      pg.queryAs(
        { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
        `update public.profiles set mfa_enforced = false where id = $1`,
        [adminUser.id]
      )
    ).rejects.toThrow();
    const stillEnforced = await pg.queryAs<{ mfa_enforced: boolean }>(
      { pgRole: 'service_role' },
      `select mfa_enforced from public.profiles where id = $1`,
      [adminUser.id]
    );
    expect(stillEnforced.rows[0].mfa_enforced).toBe(true);

    // Admin at AAL2 passes public.is_admin() and sees client orders
    const aal2Check = await pg.queryAs<{ ok: boolean }>(
      { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.is_admin() as ok`
    );
    expect(aal2Check.rows[0].ok).toBe(true);

    const aal2Orders = await pg.queryAs(
      { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select id from public.orders where client_id = $1`,
      [clientA.id]
    );
    expect(aal2Orders.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('[TENANT-ISOLATION] enforces active-account state, parent-child ownership, RoE client-only signing, and immutable audit_logs', async () => {
    // Seed an order for Client B and an order for inactiveClient
    const orderBRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.orders (
         client_id, service_id, title, status, priority, currency,
         subtotal_cents, total_cents, deposit_percent, requires_roe
       ) values ($1, $2, 'Client B Pentest', 'pending_requirements', 'priority', 'USD', 80000, 80000, 50, true)
       returning id`,
      [clientB.id, serviceId]
    );
    const orderBId = orderBRes.rows[0].id;

    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.orders (
         client_id, service_id, title, status, priority, currency,
         subtotal_cents, total_cents, deposit_percent
       ) values ($1, $2, 'Inactive Client Order', 'in_progress', 'standard', 'USD', 40000, 40000, 100)`,
      [inactiveClient.id, serviceId]
    );

    // 1. Deactivated user with unexpired JWT cannot read orders or open tickets
    const inactiveOrders = await pg.queryAs(
      { userId: inactiveClient.id, email: inactiveClient.email, appRole: 'client', aal: 'aal1' },
      `select id from public.orders`
    );
    expect(inactiveOrders.rows).toEqual([]);

    await expect(
      pg.queryAs(
        { userId: inactiveClient.id, email: inactiveClient.email, appRole: 'client', aal: 'aal1' },
        `insert into public.tickets (client_id, subject, category) values ($1, 'Bypass attempt', 'general')`,
        [inactiveClient.id]
      )
    ).rejects.toThrow();

    // 2. Active Client A cannot attach order_requirements or support tickets to Client B's order_id
    await expect(
      pg.queryAs(
        { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.order_requirements (order_id, client_id, responses)
         values ($1, $2, '{"target":"evil"}'::jsonb)`,
        [orderBId, clientA.id]
      )
    ).rejects.toThrow();

    await expect(
      pg.queryAs(
        { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.tickets (client_id, order_id, subject, category)
         values ($1, $2, 'Cross-tenant order link', 'general')`,
        [clientA.id, orderBId]
      )
    ).rejects.toThrow();

    // 3. Admin cannot insert legal RoE ownership attestation on behalf of Client B
    await expect(
      pg.queryAs(
        { userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `insert into public.engagement_authorizations (
           order_id, client_id, authorized_targets,
           testing_window_start, testing_window_end,
           emergency_contact_name, emergency_contact_phone,
           ownership_attested, signer_full_name, signer_title
         ) values (
           $1, $2, array['example.com'],
           timezone('utc', now()), timezone('utc', now()) + interval '4 hours',
           'Ops Lead', '+15550100',
           true, 'Admin Forged', 'CEO'
         )`,
        [orderBId, clientB.id]
      )
    ).rejects.toThrow();

    // 4. Client A cannot insert arbitrary audit_logs, and audit_logs cannot be deleted
    await expect(
      pg.queryAs(
        { userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.audit_logs (actor_id, actor_role, action, entity_type, summary)
         values ($1, 'client', 'fake.event', 'order', 'Spoofed entry')`,
        [clientA.id]
      )
    ).rejects.toThrow();

    const auditIns = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.audit_logs (actor_role, action, entity_type, summary)
       values ('system', 'test.immutable', 'system', 'Immutable check')
       returning id`
    );
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `delete from public.audit_logs where id = $1`,
        [auditIns.rows[0].id]
      )
    ).rejects.toThrow();

    // 5. Vault file trigger blocks Client A from claiming an r2_key under Client B's private prefix
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.vault_files (
           bucket, r2_key, category, owner_client_id, uploaded_by, filename, mime_type, size_bytes
         ) values (
           'private', $1, 'payment_proof', $2, $2, 'hijack.pdf', 'application/pdf', 1024
         )`,
        [`private/${clientB.id}/payment_proof/secret.pdf`, clientA.id]
      )
    ).rejects.toThrow(/r2_key prefix/);

    // 6. Vault file 500 MiB quota is enforced even when owner_client_id is omitted (inferred via order_id)
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.vault_files (
           bucket, r2_key, category, owner_client_id, order_id, uploaded_by, filename, mime_type, size_bytes
         ) values (
           'private', $1, 'deliverable', null, $2, $3, 'oversize.zip', 'application/zip', 530000000
         )`,
        [`private/${clientB.id}/deliverable/oversize.zip`, orderBId, adminUser.id]
      )
    ).rejects.toThrow(/quota/i);
  });
});
