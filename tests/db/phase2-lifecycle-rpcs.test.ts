import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

describe('Phase 2 Full CRM & Client Portal Lifecycle RPCs', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let clientB: TestUserRecord;
  let webServiceId: string;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'p2-admin@disposable.test',
      fullName: 'Phase2 Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'p2-client-a@disposable.test',
      fullName: 'Phase2 Client A',
      role: 'client',
      isActive: true,
    });
    clientB = await pg.createTestUser({
      email: 'p2-client-b@disposable.test',
      fullName: 'Phase2 Client B',
      role: 'client',
      isActive: true,
    });
    const svcRes = await pg.db.query<{ id: string }>(
      `select id from public.services where slug = 'fullstack-web-development' limit 1`
    );
    webServiceId = svcRes.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[P2-INV-CN-MANUAL] supports multi-line draft invoices, send/void, manual payment, and atomic credit note settlement', async () => {
    // 1. Multi-line draft invoice with discount & 10% tax (1000 bps)
    const draftRes = await pg.queryAs<{ res: { invoice_id: string; total_cents: number; status: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_draft_invoice_multi_atomic(
         $1, null, null, 'USD', 1.0, 1000, 1000, 14,
         'Wire instructions', 'Multi-line draft test',
         '[{"description":"Discovery","qty":2,"unit_price_cents":5000},{"description":"Hardening","qty":1,"unit_price_cents":10000}]'::jsonb,
         false, $2
       ) as res`,
      [clientA.id, adminUser.id]
    );
    // subtotal = 2*5000 + 1*10000 = 20000; discount = 1000; taxable = 19000; tax 10% = 1900; total = 20900
    expect(draftRes.rows[0].res.total_cents).toBe(20900);
    expect(draftRes.rows[0].res.status).toBe('draft');
    const draftId = draftRes.rows[0].res.invoice_id;

    // 2. Issue draft invoice via send_draft_invoice_atomic -> freezes immutable_snapshot with 2 items
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.send_draft_invoice_atomic($1, $2)`,
      [draftId, adminUser.id]
    );
    const issuedInv = await pg.db.query<{ status: string; immutable_snapshot: { items: unknown[] } }>(
      `select status::text, immutable_snapshot from public.invoices where id = $1`,
      [draftId]
    );
    expect(issuedInv.rows[0].status).toBe('issued');
    expect(issuedInv.rows[0].immutable_snapshot.items).toHaveLength(2);

    // 3. Record manual partial payment of $100 (10000 cents) -> invoice partially_paid, LTV +10000
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'wise', 10000, 'WISE-MANUAL-001', 1.0)`,
      [draftId, adminUser.id]
    );

    // 4. Settle remaining $109 (10900 cents) via create_credit_note_atomic -> invoice paid
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_credit_note_atomic($1, $2, 10900, 'Goodwill adjustment')`,
      [draftId, adminUser.id]
    );
    const settled = await pg.db.query<{ status: string; amount_paid_cents: number; credited_cents: number }>(
      `select status::text, amount_paid_cents, credited_cents from public.invoices where id = $1`,
      [draftId]
    );
    expect(settled.rows[0]).toEqual({ status: 'paid', amount_paid_cents: 10000, credited_cents: 10900 });

    // 5. Draft invoice can be voided atomically via void_invoice_atomic
    const voidDraft = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_draft_invoice_multi_atomic(
         $1, null, null, 'USD', 1.0, 0, 0, 7, null, 'Void me',
         '[{"description":"Temp item","qty":1,"unit_price_cents":5000}]'::jsonb,
         false, $2
       ) as res`,
      [clientA.id, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.void_invoice_atomic($1, $2)`,
      [voidDraft.rows[0].res.invoice_id, adminUser.id]
    );
    const voidRow = await pg.db.query<{ status: string }>(
      `select status::text from public.invoices where id = $1`,
      [voidDraft.rows[0].res.invoice_id]
    );
    expect(voidRow.rows[0].status).toBe('void');
  });

  it('[P2-PROPOSAL-DECLINE-NDA-CANCEL-PAIDREV] supports proposal decline, explicit NDA acceptance, paid revision addendum, task progress sync, cancellation resolution, and retainer renewal', async () => {
    // 1. Proposal decline caller-bound
    const propRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.proposals (
         client_id, service_id, recipient_name, recipient_email, title, pillar,
         scope_summary, deliverables_summary, estimated_days, currency, subtotal_cents, total_cents, status
       ) values ($1, $2, 'Client A', $3, 'Declinable Proposal', 'development', 'Scope', 'App', 7, 'USD', 50000, 50000, 'sent')
       returning id`,
      [clientA.id, webServiceId, clientA.email]
    );
    const proposalId = propRes.rows[0].id;

    // Client B cannot decline Client A's proposal
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientB.id, email: clientB.email, appRole: 'client', aal: 'aal1' },
        `select public.decline_proposal_client_atomic($1, $2, 'Not ready')`,
        [proposalId, clientB.id]
      )
    ).rejects.toThrow();

    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.decline_proposal_client_atomic($1, $2, 'Scope deferred to Q3')`,
      [proposalId, clientA.id]
    );
    const declinedProp = await pg.db.query<{ status: string; decline_reason: string; declined_at: string | null }>(
      `select status::text, decline_reason, declined_at::text from public.proposals where id = $1`,
      [proposalId]
    );
    expect(declinedProp.rows[0].status).toBe('declined');
    expect(declinedProp.rows[0].decline_reason).toBe('Scope deferred to Q3');
    expect(declinedProp.rows[0].declined_at).not.toBeNull();

    // 2. Order creation + explicit NDA acceptance + Task completion syncing progress_percent
    const ordRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic($1, $2, 'NDA & Revision Test Order', 'Scope', 'development', 60000, 0, false, 10) as res`,
      [adminUser.id, clientA.id]
    );
    const orderId = ordRes.rows[0].res.order_id;
    await pg.queryAs(
      { pgRole: 'service_role' },
      `update public.orders set nda_required = true, revisions_included = 1, revisions_used = 1, status = 'in_progress' where id = $1`,
      [orderId]
    );

    // Explicit NDA acceptance
    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.accept_order_nda_atomic($1, $2)`,
      [orderId, clientA.id]
    );
    const ndaOrd = await pg.db.query<{ nda_accepted_at: string | null }>(
      `select nda_accepted_at::text from public.orders where id = $1`,
      [orderId]
    );
    expect(ndaOrd.rows[0].nda_accepted_at).not.toBeNull();

    // Task sync trigger: 1 of 2 tasks completed -> progress_percent = 50
    const t1 = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.order_tasks (order_id, title, is_client_visible, is_completed, position)
       values ($1, 'Task 1', true, true, 0), ($1, 'Task 2', true, false, 1)
       returning id`,
      [orderId]
    );
    expect(t1.rows).toHaveLength(2);
    const progRow = await pg.db.query<{ progress_percent: number }>(
      `select progress_percent from public.orders where id = $1`,
      [orderId]
    );
    expect(progRow.rows[0].progress_percent).toBe(50);

    // 3. Paid Revision Amendment A3: when revisions_used >= revisions_included, issue paid revision invoice -> pay -> increments revisions_included
    const revInv = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_paid_revision_invoice_atomic($1, $2, 2, 15000, '2 Extra Design Revisions') as res`,
      [orderId, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'manual', 15000, 'REV-ADDON-PAID-1', 1.0)`,
      [revInv.rows[0].res.invoice_id, adminUser.id]
    );
    const boostedRev = await pg.db.query<{ revisions_included: number }>(
      `select revisions_included from public.orders where id = $1`,
      [orderId]
    );
    expect(boostedRev.rows[0].revisions_included).toBe(3);

    // 4. Cancellation request & admin resolution + Retainer cycle renewal
    const cancelReq = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.cancellation_requests (order_id, requested_by, reason)
       values ($1, $2, 'Project paused internally') returning id`,
      [orderId, clientA.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.resolve_order_cancellation_atomic($1, $2, 'approved', 'Approved mutual cancellation')`,
      [cancelReq.rows[0].id, adminUser.id]
    );
    const cancelledOrd = await pg.db.query<{ status: string }>(
      `select status::text from public.orders where id = $1`,
      [orderId]
    );
    expect(cancelledOrd.rows[0].status).toBe('cancelled');

    const retIns = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.retainer_plans (client_id, title, monthly_fee_cents, hours_per_month, hours_used_current_period, billing_cycle)
       values ($1, 'Security Advisory Retainer', 35000, 15, 11.5, 'monthly') returning id`,
      [clientA.id]
    );
    const retRenewal = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.renew_retainer_cycle_atomic($1, $2) as res`,
      [retIns.rows[0].id, adminUser.id]
    );
    expect(typeof retRenewal.rows[0].res.invoice_id).toBe('string');
    const retAfter = await pg.db.query<{ hours_used_current_period: string }>(
      `select hours_used_current_period::text from public.retainer_plans where id = $1`,
      [retIns.rows[0].id]
    );
    expect(Number(retAfter.rows[0].hours_used_current_period)).toBe(0);
  });

  it('[P6-DB-REGRESSIONS] supports multi-line qty > 1, manual payment FX preservation, declined cancellations, pg_cron maintenance, and audit exclusion', async () => {
    // 1. Multi-line invoice with qty > 1 AND quantity alias on non-USD BDT invoice
    const bdtDraft = await pg.queryAs<{ res: { invoice_id: string; total_cents: number } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_draft_invoice_multi_atomic(
         $1, null, null, 'BDT', 120.5, 0, 0, 14,
         null, 'FX & qty regression',
         '[{"description":"Scope A","qty":3,"unit_price_cents":2000},{"description":"Scope B","quantity":2,"unit_price_cents":5000}]'::jsonb,
         true, $2
       ) as res`,
      [clientA.id, adminUser.id]
    );
    expect(bdtDraft.rows[0].res.total_cents).toBe(16000);
    const invId = bdtDraft.rows[0].res.invoice_id;

    // 2. Manual payment preserves explicit FX rate instead of being overwritten by invoice FX
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'manual', 16000, 'BDT-FX-121', 121.25)`,
      [invId, adminUser.id]
    );
    const payRow = await pg.db.query<{ fx_rate_to_usd: string }>(
      `select fx_rate_to_usd::text from public.payments where invoice_id = $1 and reference = 'BDT-FX-121'`,
      [invId]
    );
    expect(Number(payRow.rows[0].fx_rate_to_usd)).toBeCloseTo(121.25, 2);

    // 3. Cancellation declined leaves order in_progress and request status = 'declined'
    const ordRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic($1, $2, 'Cancellation Decline Test', 'Scope', 'development', 60000, 0, false, 10) as res`,
      [adminUser.id, clientB.id]
    );
    const ordId = ordRes.rows[0].res.order_id;
    await pg.queryAs(
      { pgRole: 'service_role' },
      `update public.orders set status = 'in_progress' where id = $1`,
      [ordId]
    );
    const cr = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: clientB.id, email: clientB.email, appRole: 'client', aal: 'aal1' },
      `insert into public.cancellation_requests (order_id, requested_by, reason) values ($1, $2, 'Checking decline path') returning id`,
      [ordId, clientB.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.resolve_order_cancellation_atomic($1, $2, 'declined', 'Scope already completed')`,
      [cr.rows[0].id, adminUser.id]
    );
    const crCheck = await pg.db.query<{ status: string }>(
      `select status::text from public.cancellation_requests where id = $1`,
      [cr.rows[0].id]
    );
    const ordCheck = await pg.db.query<{ status: string }>(
      `select status::text from public.orders where id = $1`,
      [ordId]
    );
    expect(crCheck.rows[0].status).toBe('declined');
    expect(ordCheck.rows[0].status).toBe('in_progress');

    // 4. pg_cron context (postgres / auth.role() is NULL) can execute run_daily_crm_maintenance()
    await expect(pg.db.query(`select public.run_daily_crm_maintenance()`)).resolves.toBeDefined();

    // 5. Client audit_logs RLS excludes client.crm_updated
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary)
       values ($1, 'admin', 'client.crm_updated', 'client', $2, 'Internal CRM score updated')`,
      [adminUser.id, clientA.id]
    );
    const cliLogs = await pg.queryAs<{ action: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select action from public.audit_logs where entity_id = $1`,
      [clientA.id]
    );
    expect(cliLogs.rows.map((r) => r.action)).not.toContain('client.crm_updated');
  });
});
