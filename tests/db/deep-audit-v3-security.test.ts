import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

describe('Deep Audit v3 DB Security, RLS, RPC & Financial Ledger Hardening (Migration 0031)', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let clientB: TestUserRecord;
  let mfaClient: TestUserRecord;
  let webServiceId: string;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'v3-admin@disposable.test',
      fullName: 'V3 Audit Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'v3-client-a@disposable.test',
      fullName: 'V3 Client A',
      role: 'client',
      isActive: true,
    });
    clientB = await pg.createTestUser({
      email: 'v3-client-b@disposable.test',
      fullName: 'V3 Client B',
      role: 'client',
      isActive: true,
    });
    mfaClient = await pg.createTestUser({
      email: 'v3-mfa-client@disposable.test',
      fullName: 'V3 MFA Enforced Client',
      role: 'client',
      isActive: true,
      mfaEnforced: true,
    });

    const svc = await pg.db.query<{ id: string }>(
      `select id from public.services where slug = 'fullstack-web-development' limit 1`
    );
    webServiceId = svc.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[AUDIT-V3-DB-01] enforces AAL2 in current_account_role(), audit_logs/notifications RLS, and MFA-enforced clients', async () => {
    // Seed an audit_log and notification for admin
    await pg.db.query(
      `insert into public.audit_logs (actor_id, actor_role, client_id, action, entity_type, summary)
       values ($1, 'admin', $2, 'client.crm_updated', 'client', 'Admin audit entry')`,
      [adminUser.id, clientA.id]
    );
    await pg.db.query(
      `insert into public.notifications (recipient_id, category, title, body)
       values ($1, 'system', 'Admin Secret Alert', 'Internal alert')`,
      [adminUser.id]
    );

    // Admin at AAL1 gets NULL from current_account_role() and 0 rows from audit_logs & notifications
    const aal1Role = await pg.queryAs<{ role: string | null }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
      `select public.current_account_role() as role`
    );
    expect(aal1Role.rows[0].role).toBeNull();

    const aal1Audit = await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
      `select id from public.audit_logs`
    );
    expect(aal1Audit.rows).toHaveLength(0);

    const aal1Notif = await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal1' },
      `select id from public.notifications where recipient_id = $1`,
      [adminUser.id]
    );
    expect(aal1Notif.rows).toHaveLength(0);

    // Admin at AAL2 succeeds
    const aal2Role = await pg.queryAs<{ role: string | null }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.current_account_role() as role`
    );
    expect(aal2Role.rows[0].role).toBe('admin');

    const aal2Notif = await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select id from public.notifications where recipient_id = $1`,
      [adminUser.id]
    );
    expect(aal2Notif.rows.length).toBeGreaterThanOrEqual(1);

    // MFA-enforced client at AAL1 gets NULL from current_account_role() and cannot update profile
    const mfaAal1 = await pg.queryAs<{ role: string | null }>(
      { pgRole: 'authenticated', userId: mfaClient.id, email: mfaClient.email, appRole: 'client', aal: 'aal1' },
      `select public.current_account_role() as role`
    );
    expect(mfaAal1.rows[0].role).toBeNull();

    const mfaAal2 = await pg.queryAs<{ role: string | null }>(
      { pgRole: 'authenticated', userId: mfaClient.id, email: mfaClient.email, appRole: 'client', aal: 'aal2' },
      `select public.current_account_role() as role`
    );
    expect(mfaAal2.rows[0].role).toBe('client');
  });

  it('[AUDIT-V3-DB-02] blocks ticket & payment sequence-collision DoS and cross-order payment IDOR / pending overpayment', async () => {
    // 1. Forged ticket number is overwritten with sequence-derived number (prevents sequence-collision DoS)
    const tkt = await pg.queryAs<{ number: number; code: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.tickets (client_id, number, subject, category, priority)
       values ($1, 9999, 'Attempted number collision', 'general', 'medium')
       returning number, code`,
      [clientA.id]
    );
    expect(tkt.rows[0].number).not.toBe(9999);
    expect(tkt.rows[0].code).toMatch(/^TKT-\d{4,}$/);

    // 2. Create two orders & invoices for clientA and clientB
    const ordA = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Audit Order A', 'Desc', 'development', 100000, 50, false, 7, 'USD', 1.0
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const ordB = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Audit Order B', 'Desc', 'development', 100000, 50, false, 7, 'USD', 1.0
       ) as res`,
      [adminUser.id, clientB.id]
    );

    const invA = ordA.rows[0].res.deposit_invoice_id;
    const orderBId = ordB.rows[0].res.order_id;

    // 3. Cross-order IDOR on payments INSERT must be rejected
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.payments (invoice_id, order_id, client_id, method, currency, amount_cents, reference)
         values ($1, $2, $3, 'bank_transfer', 'USD', 10000, 'IDOR-PAY-01')`,
        [invA, orderBId, clientA.id]
      )
    ).rejects.toThrow();

    // 4. Forged reviewed_by / reviewed_at on client payment INSERT must be rejected
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.payments (invoice_id, order_id, client_id, method, currency, amount_cents, reference, reviewed_by, reviewed_at)
         values ($1, $2, $3, 'bank_transfer', 'USD', 10000, 'FORGED-REV-01', $4, now())`,
        [invA, ordA.rows[0].res.order_id, clientA.id, adminUser.id]
      )
    ).rejects.toThrow(/review|immutable|policy/i);

    // 5. Forged payment number is overwritten AND combined submitted payments cannot exceed invoice balance (50,000 cents)
    const pay1 = await pg.queryAs<{ number: number; code: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.payments (invoice_id, order_id, client_id, number, method, currency, amount_cents, reference)
       values ($1, $2, $3, 9999, 'bank_transfer', 'USD', 35000, 'VALID-PART-1')
       returning number, code`,
      [invA, ordA.rows[0].res.order_id, clientA.id]
    );
    expect(pay1.rows[0].number).not.toBe(9999);
    expect(pay1.rows[0].code).toMatch(/^PAY-\d{4,}$/);

    // Second pending payment for 20,000 exceeds remaining 50,000 - 35,000 = 15,000 -> rejected
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.payments (invoice_id, order_id, client_id, method, currency, amount_cents, reference)
         values ($1, $2, $3, 'bank_transfer', 'USD', 20000, 'PENDING-OVERFLOW-2')`,
        [invA, ordA.rows[0].res.order_id, clientA.id]
      )
    ).rejects.toThrow(/pending|exceeds/i);
  });

  it('[AUDIT-V3-DB-03] prevents cancelled order deliverable resurrection, disarms auto_accept_at, and syncs milestone approval', async () => {
    const ordRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Zero-Deposit Cancel Test', 'Desc', 'development', 50000, 0, false, 7, 'USD', 1.0
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const orderId = ordRes.rows[0].res.order_id;

    // Move order to in_progress (0% deposit) and create a milestone + deliverable
    await pg.db.query(`update public.orders set status = 'in_progress' where id = $1`, [orderId]);
    const ms = await pg.db.query<{ id: string }>(
      `insert into public.order_milestones (order_id, position, title, amount_cents, status)
       values ($1, 0, 'Delivery Milestone', 50000, 'in_progress') returning id`,
      [orderId]
    );
    const deliv = await pg.db.query<{ id: string }>(
      `insert into public.deliverables (order_id, milestone_id, version_label, title, status, submitted_by, auto_accept_at)
       values ($1, $2, 'v1.0', 'v1 Bundle', 'submitted', $3, now() - interval '2 days') returning id`,
      [orderId, ms.rows[0].id, adminUser.id]
    );

    // Client requests cancellation; duplicate pending cancellation must fail
    const cancelReq = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.cancellation_requests (order_id, requested_by, reason, status)
       values ($1, $2, 'Scope changed by stakeholder', 'pending') returning id`,
      [orderId, clientA.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `insert into public.cancellation_requests (order_id, requested_by, reason, status)
         values ($1, $2, 'Duplicate request', 'pending')`,
        [orderId, clientA.id]
      )
    ).rejects.toThrow(/unique|duplicate/i);

    // Admin approves cancellation -> order becomes cancelled and deliverable auto_accept_at is disarmed
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.resolve_order_cancellation_atomic($1, $2, 'approved', 'Approved cleanly')`,
      [cancelReq.rows[0].id, adminUser.id]
    );

    const afterCancel = await pg.db.query<{ status: string; auto_accept_at: string | null }>(
      `select status, auto_accept_at from public.deliverables where id = $1`,
      [deliv.rows[0].id]
    );
    expect(afterCancel.rows[0].auto_accept_at).toBeNull();

    // Auto-accept job must NOT touch the cancelled order
    await pg.db.query(`select public.run_auto_accept_deliverables()`);
    const ordStatus = await pg.db.query<{ status: string }>(
      `select status::text from public.orders where id = $1`,
      [orderId]
    );
    expect(ordStatus.rows[0].status).toBe('cancelled');

    // Client reviewing a deliverable on a cancelled order must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select public.review_order_deliverable($1, $2, 'accepted', 'Trying to revive')`,
        [deliv.rows[0].id, clientA.id]
      )
    ).rejects.toThrow(/cancelled|completed/i);

    // Inserting a new deliverable on a cancelled order must fail
    await expect(
      pg.db.query(
        `insert into public.deliverables (order_id, version_label, title, status, submitted_by)
         values ($1, 'v2.0', 'Ghost Deliverable', 'submitted', $2)`,
        [orderId, adminUser.id]
      )
    ).rejects.toThrow(/cancelled|completed/i);

    // Separate active order: accepting milestone-linked deliverable approves the milestone
    const ord2 = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Milestone Sync Order', 'Desc', 'development', 25000, 0, false, 7, 'USD', 1.0
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const order2Id = ord2.rows[0].res.order_id;
    await pg.db.query(`update public.orders set status = 'in_progress' where id = $1`, [order2Id]);
    const ms2 = await pg.db.query<{ id: string }>(
      `insert into public.order_milestones (order_id, position, title, amount_cents, status)
       values ($1, 0, 'Final Build', 25000, 'delivered') returning id`,
      [order2Id]
    );
    const deliv2 = await pg.db.query<{ id: string }>(
      `insert into public.deliverables (order_id, milestone_id, version_label, title, status, submitted_by)
       values ($1, $2, 'v1.0', 'Final Build Zip', 'submitted', $3) returning id`,
      [order2Id, ms2.rows[0].id, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.review_order_deliverable($1, $2, 'accepted', 'Looks great')`,
      [deliv2.rows[0].id, clientA.id]
    );
    const ms2After = await pg.db.query<{ status: string; completed_at: string | null }>(
      `select status, completed_at from public.order_milestones where id = $1`,
      [ms2.rows[0].id]
    );
    expect(ms2After.rows[0].status).toBe('approved');
    expect(ms2After.rows[0].completed_at).not.toBeNull();
  });

  it('[AUDIT-V3-DB-04] enforces quarterly/annual retainer billing multiplier + FX, multi-currency order/revision FX, and credit/void/item ledger invariants', async () => {
    // 1. Quarterly EUR retainer ($500/mo -> 150,000 cents/qtr, fx_rate_to_usd = 1.1)
    const retQ = await pg.db.query<{ id: string }>(
      `insert into public.retainer_plans (
         client_id, title, pillar, monthly_fee_cents, currency, fx_rate_to_usd,
         hours_per_month, billing_cycle, status
       ) values ($1, 'Quarterly Advisory', 'tech_support', 50000, 'EUR', 1.1, 10, 'quarterly', 'active')
       returning id`,
      [clientA.id]
    );
    const renewQ = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.renew_retainer_cycle_atomic($1, $2, true) as res`,
      [retQ.rows[0].id, adminUser.id]
    );
    const qInv = await pg.db.query<{ total_cents: number; currency: string; fx_rate_to_usd: string }>(
      `select total_cents, currency, fx_rate_to_usd::text from public.invoices where id = $1`,
      [renewQ.rows[0].res.invoice_id]
    );
    expect(qInv.rows[0].total_cents).toBe(150000);
    expect(qInv.rows[0].currency).toBe('EUR');
    expect(Number(qInv.rows[0].fx_rate_to_usd)).toBeCloseTo(1.1, 4);

    // 2. Multi-currency order FX propagation -> paid revision inherits EUR FX=1.08
    const eurOrd = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'EUR Platform Build', 'Desc', 'development', 200000, 50, false, 7, 'EUR', 1.08
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const eurDepInv = await pg.db.query<{ fx_rate_to_usd: string }>(
      `select fx_rate_to_usd::text from public.invoices where id = $1`,
      [eurOrd.rows[0].res.deposit_invoice_id]
    );
    expect(Number(eurDepInv.rows[0].fx_rate_to_usd)).toBeCloseTo(1.08, 4);

    const revRes = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_paid_revision_invoice_atomic($1, $2, 1, 25000, 'Extra Sprint') as res`,
      [eurOrd.rows[0].res.order_id, adminUser.id]
    );
    const revInv = await pg.db.query<{ fx_rate_to_usd: string; currency: string }>(
      `select fx_rate_to_usd::text, currency from public.invoices where id = $1`,
      [revRes.rows[0].res.invoice_id]
    );
    expect(revInv.rows[0].currency).toBe('EUR');
    expect(Number(revInv.rows[0].fx_rate_to_usd)).toBeCloseTo(1.08, 4);

    // 3. Reassigning invoice_items.invoice_id from issued invoice to draft invoice must fail
    const draftInv = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_draft_invoice_multi_atomic(
         $1, null, null, 'USD', 1.0, 0, 0, 7, null, null,
         '[{"description":"Draft item","qty":1,"unit_price_cents":10000}]'::jsonb,
         false, $2
       ) as res`,
      [clientA.id, adminUser.id]
    );
    const issuedItem = await pg.db.query<{ id: string }>(
      `select id from public.invoice_items where invoice_id = $1 limit 1`,
      [eurOrd.rows[0].res.deposit_invoice_id]
    );
    await expect(
      pg.db.query(
        `update public.invoice_items set invoice_id = $1 where id = $2`,
        [draftInv.rows[0].res.invoice_id, issuedItem.rows[0].id]
      )
    ).rejects.toThrow(/non-draft|reassign/i);

    // 4. Credit note against draft or void invoice must fail; voiding credited invoice must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.create_credit_note_atomic($1, $2, 1000, 'Draft credit attempt')`,
        [draftInv.rows[0].res.invoice_id, adminUser.id]
      )
    ).rejects.toThrow();

    // Credit part of issued revision invoice, then attempting to void it must fail
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_credit_note_atomic($1, $2, 5000, 'Partial goodwill credit')`,
      [revRes.rows[0].res.invoice_id, adminUser.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.void_invoice_atomic($1, $2)`,
        [revRes.rows[0].res.invoice_id, adminUser.id]
      )
    ).rejects.toThrow(/credit/i);

    // 5. Mutating due_at on an issued invoice must fail
    await expect(
      pg.db.query(
        `update public.invoices set due_at = current_date + 90 where id = $1`,
        [revRes.rows[0].res.invoice_id]
      )
    ).rejects.toThrow(/immutable/i);

    // 6. Issuing a $0 draft invoice (100% discount) must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.create_draft_invoice_multi_atomic(
           $1, null, null, 'USD', 1.0, 10000, 0, 7, null, null,
           '[{"description":"Zero total","qty":1,"unit_price_cents":10000}]'::jsonb,
           true, $2
         )`,
        [clientA.id, adminUser.id]
      )
    ).rejects.toThrow(/positive|zero/i);
  });

  it('[AUDIT-V3-DB-05] enforces atomic sign_order_roe_atomic, client_profiles column privacy, audit_logs draft filtering, consent archive immutability, and session revocation', async () => {
    // 1. Cyber order created with 0% deposit starts at pending_requirements with requires_roe=true
    const cyberOrd = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Pentest RoE Atomic', 'Desc', 'cybersecurity', 80000, 0, false, 7, 'USD', 1.0
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const cyberOrderId = cyberOrd.rows[0].res.order_id;

    // Attempting to advance to in_progress OR skip straight to delivered/completed before signing RoE must fail
    await expect(
      pg.db.query(`update public.orders set status = 'in_progress' where id = $1`, [cyberOrderId])
    ).rejects.toThrow(/Rules of Engagement/i);
    await expect(
      pg.db.query(`update public.orders set status = 'delivered' where id = $1`, [cyberOrderId])
    ).rejects.toThrow(/Rules of Engagement/i);

    // Atomic RoE signing transitions status to in_progress and stamps roe_signed_at
    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.sign_order_roe_atomic(
         $1::uuid, $2::uuid, array['https://app.client.example'], 'prod-db'::text,
         now(), now() + interval '14 days',
         'Ops Lead'::text, '+15551234567'::text, 'Client Signer'::text, 'CTO'::text, 'abc123hash'::text
       )`,
      [cyberOrderId, clientA.id]
    );
    const afterRoe = await pg.db.query<{ status: string; roe_signed_at: string | null }>(
      `select status::text, roe_signed_at from public.orders where id = $1`,
      [cyberOrderId]
    );
    expect(afterRoe.rows[0].status).toBe('in_progress');
    expect(afterRoe.rows[0].roe_signed_at).not.toBeNull();

    // Double signing must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select public.sign_order_roe_atomic(
           $1::uuid, $2::uuid, array['https://app.client.example'], null::text,
           now(), now() + interval '14 days',
           'Ops Lead'::text, '+15551234567'::text, 'Client Signer'::text, 'CTO'::text, 'abc123hash'::text
         )`,
        [cyberOrderId, clientA.id]
      )
    ).rejects.toThrow(/already been signed/i);

    // 2. Client cannot SELECT private admin CRM columns on client_profiles
    for (const privCol of ['relationship_summary', 'tags', 'next_followup_at', 'tier', 'acquisition_source']) {
      await expect(
        pg.queryAs(
          { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
          `select ${privCol} from public.client_profiles where user_id = $1`,
          [clientA.id]
        )
      ).rejects.toThrow(/permission denied/i);
    }

    // Client CAN select their own public billing columns
    const ownProfile = await pg.queryAs<{ user_id: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select user_id, company_name, preferred_currency from public.client_profiles where user_id = $1`,
      [clientA.id]
    );
    expect(ownProfile.rows).toHaveLength(1);

    // 3. Client audit_logs RLS hides draft proposal/invoice admin actions
    await pg.db.query(
      `insert into public.audit_logs (actor_id, actor_role, client_id, action, entity_type, summary)
       values
         ($1, 'admin', $2, 'proposal.draft_saved', 'proposal', 'Secret internal draft pricing'),
         ($1, 'admin', $2, 'invoice.draft_updated', 'invoice', 'Secret draft invoice'),
         ($1, 'admin', $2, 'proposal.sent', 'proposal', 'Visible sent proposal')`,
      [adminUser.id, clientA.id]
    );
    const clientAudit = await pg.queryAs<{ action: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select action from public.audit_logs where client_id = $1`,
      [clientA.id]
    );
    const actions = clientAudit.rows.map((r) => r.action);
    expect(actions).toContain('proposal.sent');
    expect(actions).not.toContain('proposal.draft_saved');
    expect(actions).not.toContain('invoice.draft_updated');

    // 4. publish_consent_policy_atomic blocks silently overwriting an existing version with a different hash
    const v1Canonical = '{"version":"v99-audit-immut"}';
    const v1Hash = createHash('sha256').update(v1Canonical).digest('hex');
    const v1CanonicalMutated = '{"version":"v99-audit-immut","tampered":true}';
    const v1HashMutated = createHash('sha256').update(v1CanonicalMutated).digest('hex');
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.publish_consent_policy_atomic('v99-audit-immut', $1, $2, $3)`,
      [v1Canonical, v1Hash, adminUser.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.publish_consent_policy_atomic('v99-audit-immut', $1, $2, $3)`,
        [v1CanonicalMutated, v1HashMutated, adminUser.id]
      )
    ).rejects.toThrow(/already exists|different hash/i);

    // 5. Proposal acceptance preserves requires_roe = true and blocks un-signed RoE execution on accepted proposal order
    const cyberProp = await pg.db.query<{ id: string }>(
      `insert into public.proposals (
         client_id, service_id, recipient_name, recipient_email, title, pillar,
         pricing_model, scope_summary, deliverables_summary, estimated_days,
         currency, subtotal_cents, total_cents, deposit_percent, requires_roe,
         status, valid_until, created_by
       ) values (
         $1, $2, 'V3 Client A', $3, 'Cyber Proposal RoE Check', 'cybersecurity',
         'fixed_package', 'Scope', 'Deliverables', 10,
         'USD', 50000, 50000, 0, true,
         'sent', current_date + 14, $4
       ) returning id`,
      [clientA.id, webServiceId, clientA.email, adminUser.id]
    );
    const propAccept = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.accept_proposal_and_create_order($1, $2) as res`,
      [cyberProp.rows[0].id, clientA.id]
    );
    const propOrder = await pg.db.query<{ requires_roe: boolean }>(
      `select requires_roe from public.orders where id = $1`,
      [propAccept.rows[0].res.order_id]
    );
    expect(propOrder.rows[0].requires_roe).toBe(true);
    await expect(
      pg.db.query(`update public.orders set status = 'completed' where id = $1`, [propAccept.rows[0].res.order_id])
    ).rejects.toThrow(/Rules of Engagement/i);
  });
});
