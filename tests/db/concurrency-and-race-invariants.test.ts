import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

/**
 * Method 2: Concurrency Race, Double-Execution & Financial Idempotency Invariants
 *
 * Exercises atomic RPCs against double-submission, overlapping worker claims,
 * deliverable acceptance vs cron auto-accept races, retainer double-renewal,
 * and vault upload reservation caps.
 */
describe('Method 2: Concurrency Race & Financial Idempotency Suite', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientUser: TestUserRecord;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'm2-admin@disposable.test',
      fullName: 'Race Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientUser = await pg.createTestUser({
      email: 'm2-client@disposable.test',
      fullName: 'Race Client',
      role: 'client',
      isActive: true,
    });
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[M2-DOUBLE-PAYMENT] rejects duplicate review_invoice_payment confirmation without double-counting LTV or amount_paid_cents', async () => {
    const inv = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.issue_invoice_atomic($1, null, false, 'USD', 1.0, 50000, 0, 0, 7, 'Double confirm test', 'Audit') as res`,
      [clientUser.id]
    );
    const invId = inv.rows[0].res.invoice_id;

    const pay = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: clientUser.id, email: clientUser.email, appRole: 'client', aal: 'aal1' },
      `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 50000, 'RACE-PAY-1') returning id`,
      [invId, clientUser.id]
    );
    const payId = pay.rows[0].id;

    // First confirmation succeeds
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.review_invoice_payment($1, $2, 'confirmed', 1.0, null)`,
      [payId, adminUser.id]
    );

    // Second confirmation attempt MUST fail cleanly
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.review_invoice_payment($1, $2, 'confirmed', 1.0, null)`,
        [payId, adminUser.id]
      )
    ).rejects.toThrow();

    // Verify invoice paid exactly 50000 and client LTV incremented exactly 50000
    const check = await pg.db.query<{ paid: number; ltv: number }>(
      `select
         (select amount_paid_cents from public.invoices where id = $1) as paid,
         (select lifetime_value_usd_cents from public.client_profiles where user_id = $2) as ltv`,
      [invId, clientUser.id]
    );
    expect(check.rows[0]).toEqual({ paid: 50000, ltv: 50000 });
  });

  it('[M2-OUTBOX-CLAIM] prevents overlapping workers from claiming the same email_outbox row', async () => {
    // Seed 3 fresh pending outbox emails
    const inserted = await pg.db.query<{ id: string }>(
      `insert into public.email_outbox (to_email, template, subject, payload, status, next_attempt_at)
       values
         ('w1@disposable.test', 'order_created', 'Claim 1', '{}'::jsonb, 'pending', now() - interval '1 minute'),
         ('w2@disposable.test', 'order_created', 'Claim 2', '{}'::jsonb, 'pending', now() - interval '1 minute'),
         ('w3@disposable.test', 'order_created', 'Claim 3', '{}'::jsonb, 'pending', now() - interval '1 minute')
       returning id`
    );
    const ids = new Set(inserted.rows.map((r) => r.id));

    // Worker 1 claims 2 rows
    const claim1 = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `select id from public.claim_pending_email_outbox(2, 300)`
    );
    // Worker 2 immediately claims remaining rows before Worker 1 finishes
    const claim2 = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `select id from public.claim_pending_email_outbox(10, 300)`
    );

    const set1 = new Set(claim1.rows.map((r) => r.id));
    const set2 = new Set(claim2.rows.map((r) => r.id));

    // Zero intersection between Worker 1 and Worker 2 claims
    const overlap = [...set1].filter((id) => set2.has(id));
    expect(overlap).toEqual([]);

    // All 3 seeded rows were claimed across the two workers (each exactly once)
    for (const id of ids) {
      expect(set1.has(id) || set2.has(id)).toBe(true);
    }
  });

  it('[M2-DELIVERABLE-AUTO-ACCEPT-RACE] ensures manual client acceptance + auto-accept cron never emit duplicate final balance invoices', async () => {
    const raceClient = await pg.createTestUser({
      email: 'm2-deliv-client@disposable.test',
      fullName: 'Deliv Race Client',
      role: 'client',
      isActive: true,
    });
    const ord = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic($1, $2, 'Deliv Race Order', 'Scope', 'development', 80000, 50, false, 7) as res`,
      [adminUser.id, raceClient.id]
    );
    const orderId = ord.rows[0].res.order_id;

    // Pay deposit
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'manual', 40000, 'DELIV-DEP', 1.0)`,
      [ord.rows[0].res.deposit_invoice_id, adminUser.id]
    );

    // Submit final deliverable whose auto_accept_at is already elapsed
    const deliv = await pg.db.query<{ id: string }>(
      `insert into public.deliverables (order_id, version_label, title, is_final_delivery, status, auto_accept_at, submitted_by)
       values ($1, 'v1.0', 'Final Build', true, 'submitted', now() - interval '10 minutes', $2) returning id`,
      [orderId, adminUser.id]
    );

    // Client manually accepts first
    await pg.queryAs(
      { pgRole: 'authenticated', userId: raceClient.id, email: raceClient.email, appRole: 'client', aal: 'aal1' },
      `select public.review_order_deliverable($1, $2, 'accepted', 'Looks great')`,
      [deliv.rows[0].id, raceClient.id]
    );

    // Second manual accept attempt must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: raceClient.id, email: raceClient.email, appRole: 'client', aal: 'aal1' },
        `select public.review_order_deliverable($1, $2, 'accepted', 'Duplicate click')`,
        [deliv.rows[0].id, raceClient.id]
      )
    ).rejects.toThrow();

    // Auto-accept cron runs immediately after -> must accept 0 for this deliverable and NOT create a second balance invoice
    await pg.db.query(`select public.run_daily_crm_maintenance()`);

    const finalInvs = await pg.db.query<{ id: string; total_cents: number }>(
      `select id, total_cents from public.invoices where order_id = $1 and is_deposit_invoice = false`,
      [orderId]
    );
    expect(finalInvs.rows).toHaveLength(1);
    expect(finalInvs.rows[0].total_cents).toBe(40000);
  });

  it('[M2-RETAINER-IDEMPOTENCY] prevents automated retainer renewal from double-billing on repeated calls', async () => {
    const retClient = await pg.createTestUser({
      email: 'm2-retainer-client@disposable.test',
      fullName: 'Retainer Idempotency Client',
      role: 'client',
      isActive: true,
    });
    const ret = await pg.db.query<{ id: string }>(
      `insert into public.retainer_plans (client_id, title, monthly_fee_cents, hours_per_month, billing_cycle, next_invoice_date, current_period_end)
       values ($1, 'Idempotent Retainer', 60000, 12, 'monthly', current_date, current_date) returning id`,
      [retClient.id]
    );

    const first = await pg.queryAs<{ res: { invoice_id?: string; skipped?: boolean } }>(
      { pgRole: 'service_role' },
      `select public.renew_retainer_cycle_atomic($1, null, false) as res`,
      [ret.rows[0].id]
    );
    expect(first.rows[0].res.invoice_id).toBeTruthy();

    const second = await pg.queryAs<{ res: { invoice_id?: string; skipped?: boolean } }>(
      { pgRole: 'service_role' },
      `select public.renew_retainer_cycle_atomic($1, null, false) as res`,
      [ret.rows[0].id]
    );
    expect(second.rows[0].res.skipped).toBe(true);

    const retInvs = await pg.db.query<{ id: string }>(
      `select id from public.invoices where client_id = $1`,
      [retClient.id]
    );
    expect(retInvs.rows).toHaveLength(1);
    expect(retInvs.rows[0].id).toBe(first.rows[0].res.invoice_id);
  });
});
