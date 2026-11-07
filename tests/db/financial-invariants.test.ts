import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposablePostgres, type DisposablePostgres, type TestUserRecord } from '../harness/disposable-pg.mjs';

describe('Database Financial Invariants, Payment Idempotency & Split-Deposit Settlement', () => {
  let pg: DisposablePostgres;
  let admin: TestUserRecord;
  let client: TestUserRecord;
  let serviceId: string;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    admin = await pg.createTestUser({
      email: 'finance-admin@disposable.test',
      fullName: 'Finance Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    client = await pg.createTestUser({
      email: 'finance-client@disposable.test',
      fullName: 'Finance Client',
      role: 'client',
      isActive: true,
    });
    const svc = await pg.db.query<{ id: string }>(
      `select id from public.services where is_public = true order by sort_order asc limit 1`
    );
    serviceId = svc.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[PAYMENT-IDEMPOTENCY] enforces unique active payment references, blocks overpayment/currency drift, freezes invoice snapshots + line items, and settles 50/50 split-deposit orders atomically', async () => {
    // 1. Create a 50%-deposit proposal ($1,000.00 = 100,000 cents)
    const propRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
      `insert into public.proposals (
         client_id, service_id, recipient_name, recipient_email, title, pillar,
         pricing_model, scope_summary, deliverables_summary, estimated_days,
         currency, subtotal_cents, discount_cents, tax_cents, total_cents,
         deposit_percent, status, valid_until, created_by
       ) values (
         $1, $2, 'Finance Client', $3, 'Split-Deposit Security Engagement', 'cybersecurity',
         'fixed_package', 'Full web/API assessment', 'Executive & technical reports', 10,
         'USD', 100000, 0, 0, 100000,
         50, 'sent', current_date + 14, $4
       ) returning id`,
      [client.id, serviceId, client.email, admin.id]
    );
    const proposalId = propRes.rows[0].id;

    // 2. Client accepts proposal -> creates order + issued 50% deposit invoice ($500 = 50,000 cents)
    const accepted = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string; status: string } }>(
      { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
      `select public.accept_proposal_and_create_order($1, $2) as res`,
      [proposalId, client.id]
    );
    const { order_id: orderId, deposit_invoice_id: depositInvoiceId } = accepted.rows[0].res;

    // Deposit invoice must have immutable_snapshot populated and reject post-issuance item mutation
    const depInv = await pg.db.query<{ status: string; immutable_snapshot: Record<string, unknown> | null }>(
      `select status, immutable_snapshot from public.invoices where id = $1`,
      [depositInvoiceId]
    );
    expect(depInv.rows[0].status).toBe('issued');
    expect(depInv.rows[0].immutable_snapshot).not.toBeNull();

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
        `insert into public.invoice_items (invoice_id, description, qty, unit_price_cents, position)
         values ($1, 'Tampered extra line item', 1, 99999, 1)`,
        [depositInvoiceId]
      )
    ).rejects.toThrow(/non-draft|immutable/i);

    // 3. Reject currency mismatch and overpayment on deposit invoice
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
        `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
         values ($1, $2, 'bank_transfer', 'EUR', 50000, 'EUR-MISMATCH-001')`,
        [depositInvoiceId, client.id]
      )
    ).rejects.toThrow();

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
        `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
         values ($1, $2, 'bank_transfer', 'USD', 50001, 'OVERPAY-001')`,
        [depositInvoiceId, client.id]
      )
    ).rejects.toThrow(/exceeds|overpay/i);

    // 4. Submit valid $500 deposit payment; duplicate reference (case/whitespace insensitive) must fail idempotently
    const depPay = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
      `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 50000, 'WIRE-DEP-500')
       returning id`,
      [depositInvoiceId, client.id]
    );

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
        `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
         values ($1, $2, 'bank_transfer', 'USD', 50000, '  wire-dep-500 ')`,
        [depositInvoiceId, client.id]
      )
    ).rejects.toThrow(/duplicate|unique/i);

    // 5. Admin confirms deposit -> order unlocks to pending_requirements, LTV = 50,000
    await pg.queryAs(
      { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
      `select public.review_invoice_payment($1, $2, 'confirmed', 1.0, null)`,
      [depPay.rows[0].id, admin.id]
    );

    // 6. Admin publishes final deliverable -> client accepts -> Final 50% Balance Invoice ($500) is issued,
    //    and order stays 'delivered' until final balance is paid!
    const deliv = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
      `insert into public.deliverables (
         order_id, version_label, title, is_final_delivery, status, submitted_by
       ) values ($1, 'v1.0', 'Final VAPT Report', true, 'submitted', $2)
       returning id`,
      [orderId, admin.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
      `update public.orders set status = 'delivered' where id = $1`,
      [orderId]
    );

    const reviewRes = await pg.queryAs<{
      res: { status: string; order_id: string; final_invoice_id?: string | null; order_status?: string };
    }>(
      { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
      `select public.review_order_deliverable($1, $2, 'accepted', 'Verified all findings') as res`,
      [deliv.rows[0].id, client.id]
    );
    const finalInvoiceId = reviewRes.rows[0].res.final_invoice_id;
    expect(typeof finalInvoiceId).toBe('string');

    const midOrder = await pg.db.query<{ status: string }>(`select status from public.orders where id = $1`, [orderId]);
    expect(midOrder.rows[0].status).toBe('delivered');

    // 7. Client pays final $500 balance -> Admin confirms -> Order atomically transitions to 'completed' and LTV = 100,000!
    const balPay = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: client.id, email: client.email, aal: 'aal1', appRole: 'client' },
      `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 50000, 'WIRE-BAL-500')
       returning id`,
      [finalInvoiceId, client.id]
    );

    await pg.queryAs(
      { pgRole: 'authenticated', userId: admin.id, email: admin.email, aal: 'aal2', appRole: 'admin' },
      `select public.review_invoice_payment($1, $2, 'confirmed', 1.0, null)`,
      [balPay.rows[0].id, admin.id]
    );

    const finalOrder = await pg.db.query<{ status: string; progress_percent: number }>(
      `select status, progress_percent from public.orders where id = $1`,
      [orderId]
    );
    expect(finalOrder.rows[0]).toEqual({ status: 'completed', progress_percent: 100 });

    const cp = await pg.db.query<{ lifetime_value_usd_cents: string; completed_orders_count: number }>(
      `select lifetime_value_usd_cents::text, completed_orders_count from public.client_profiles where user_id = $1`,
      [client.id]
    );
    expect(Number(cp.rows[0].lifetime_value_usd_cents)).toBe(100_000);
    expect(cp.rows[0].completed_orders_count).toBe(1);
  });
});
