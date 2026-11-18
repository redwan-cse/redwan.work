import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

describe('Phase 4 Complete Table RLS Matrix & Concurrency Invariants', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let clientB: TestUserRecord;
  let serviceId: string;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'p4-admin@disposable.test',
      fullName: 'Phase4 Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'p4-client-a@disposable.test',
      fullName: 'Phase4 Client A',
      role: 'client',
      isActive: true,
    });
    clientB = await pg.createTestUser({
      email: 'p4-client-b@disposable.test',
      fullName: 'Phase4 Client B',
      role: 'client',
      isActive: true,
    });
    const svcRes = await pg.db.query<{ id: string }>(
      `select id from public.services where is_public = true order by sort_order asc limit 1`
    );
    serviceId = svcRes.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[TENANT-ISOLATION] isolates credit_notes, retainer_plans, cancellations, milestones, tasks, messages, ticket_messages, vault_files, and consent_policies across tenants', async () => {
    // Seed full Client A and Client B records as service_role
    const orderARes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.orders (
         client_id, service_id, title, status, priority, currency, subtotal_cents, total_cents, deposit_percent
       ) values ($1, $2, 'Tenant A Order', 'in_progress', 'standard', 'USD', 100000, 100000, 50)
       returning id`,
      [clientA.id, serviceId]
    );
    const orderAId = orderARes.rows[0].id;

    const orderBRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.orders (
         client_id, service_id, title, status, priority, currency, subtotal_cents, total_cents, deposit_percent
       ) values ($1, $2, 'Tenant B Secret Order', 'in_progress', 'standard', 'USD', 100000, 100000, 50)
       returning id`,
      [clientB.id, serviceId]
    );
    const orderBId = orderBRes.rows[0].id;

    // Invoices & Credit Notes for Client B
    const invBRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.invoices (
         order_id, client_id, is_deposit_invoice, status, currency, subtotal_cents, total_cents, fx_rate_to_usd, due_at, issued_at
       ) values ($1, $2, false, 'issued', 'USD', 50000, 50000, 1.0, now() + interval '7 days', now())
       returning id`,
      [orderBId, clientB.id]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.credit_notes (invoice_id, client_id, amount_cents, currency, reason, issued_by)
       values ($1, $2, 5000, 'USD', 'Private Client B Credit', $3)`,
      [invBRes.rows[0].id, clientB.id, adminUser.id]
    );

    // Retainer plans & Cancellation requests for Client B
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.retainer_plans (client_id, title, hours_per_month, monthly_fee_cents, currency, status)
       values ($1, 'Secret SOC Retainer B', 20, 300000, 'USD', 'active')`,
      [clientB.id]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.cancellation_requests (order_id, requested_by, reason, status)
       values ($1, $2, 'Private cancellation reason B', 'pending')`,
      [orderBId, clientB.id]
    );

    // Order milestones & tasks (hidden task on A + visible task on B)
    const milestoneB = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.order_milestones (order_id, title, position)
       values ($1, 'Confidential Milestone B', 1) returning id`,
      [orderBId]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.order_tasks (order_id, milestone_id, title, is_client_visible)
       values
         ($1, null, 'Internal Admin Checklist Task A', false),
         ($2, $3, 'Confidential Task B', true)`,
      [orderAId, orderBId, milestoneB.rows[0].id]
    );

    // Order messages: 1 public Client A, 1 internal Admin note on Client A's order, 1 public Client B
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.order_messages (order_id, author_id, body, is_internal_note)
       values
         ($1, $2, 'Public Client A Message', false),
         ($1, $3, 'TOP SECRET ADMIN INTERNAL NOTE A', true),
         ($4, $5, 'Private Client B Message', false)`,
      [orderAId, clientA.id, adminUser.id, orderBId, clientB.id]
    );

    // Tickets & Ticket messages: Client A internal vs public + Client B private
    const ticketARes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.tickets (client_id, order_id, subject, category)
       values ($1, $2, 'Client A Support', 'general') returning id`,
      [clientA.id, orderAId]
    );
    const ticketBRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.tickets (client_id, order_id, subject, category)
       values ($1, $2, 'Client B Confidential Ticket', 'general') returning id`,
      [clientB.id, orderBId]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.ticket_messages (ticket_id, author_id, body, is_internal_note)
       values
         ($1, $2, 'Visible Ticket Reply A', false),
         ($1, $3, 'INTERNAL TRIAGE NOTE A', true),
         ($4, $5, 'Private Ticket Reply B', false)`,
      [ticketARes.rows[0].id, clientA.id, adminUser.id, ticketBRes.rows[0].id, clientB.id]
    );

    // Vault file owned by Client B
    await pg.queryAs(
      { pgRole: 'service_role' },
      `insert into public.vault_files (
         bucket, r2_key, category, owner_client_id, uploaded_by, filename, mime_type, size_bytes, order_id
       ) values ('private', $1, 'deliverable', $2, $3, 'b-secret.pdf', 'application/pdf', 2048, $4)`,
      [`private/${clientB.id}/deliverable/b-secret.pdf`, clientB.id, adminUser.id, orderBId]
    );

    const clientASession = {
      pgRole: 'authenticated' as const,
      userId: clientA.id,
      email: clientA.email,
      appRole: 'client' as const,
      aal: 'aal1' as const,
    };

    // Assert Client A sees zero Client B rows and zero internal admin notes
    expect((await pg.queryAs(clientASession, `select id from public.credit_notes`)).rows).toEqual([]);
    expect((await pg.queryAs(clientASession, `select id from public.retainer_plans`)).rows).toEqual([]);
    expect(
      (await pg.queryAs(clientASession, `select id from public.cancellation_requests`)).rows
    ).toEqual([]);
    expect(
      (await pg.queryAs(clientASession, `select id from public.order_milestones`)).rows
    ).toEqual([]);
    expect((await pg.queryAs(clientASession, `select id from public.order_tasks`)).rows).toEqual([]);
    expect((await pg.queryAs(clientASession, `select id from public.vault_files`)).rows).toEqual([]);

    const visibleOrderMsgs = await pg.queryAs<{ body: string }>(
      clientASession,
      `select body from public.order_messages`
    );
    expect(visibleOrderMsgs.rows.map((r) => r.body)).toEqual(['Public Client A Message']);

    const visibleTicketMsgs = await pg.queryAs<{ body: string }>(
      clientASession,
      `select body from public.ticket_messages`
    );
    expect(visibleTicketMsgs.rows.map((r) => r.body)).toEqual(['Visible Ticket Reply A']);

    // Assert Client A cannot mutate consent_policies or file cancellation request on Client B's order
    await expect(
      pg.queryAs(
        clientASession,
        `insert into public.consent_policies (version, canonical, hash, is_active)
         values ('spoof-v99', 'Fake policy content overriding consent rules.', repeat('a', 64), true)`
      )
    ).rejects.toThrow();

    await expect(
      pg.queryAs(
        clientASession,
        `insert into public.cancellation_requests (order_id, requested_by, reason)
         values ($1, $2, 'Malicious cross-tenant cancel')`,
        [orderBId, clientA.id]
      )
    ).rejects.toThrow();
  });

  it('[PAYMENT-IDEMPOTENCY] serializes duplicate proposal acceptance, concurrent over-credit attempts, and over-quota vault reservations', async () => {
    const propRes = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, aal: 'aal2', appRole: 'admin' },
      `insert into public.proposals (
         client_id, service_id, recipient_name, recipient_email, title, pillar,
         pricing_model, scope_summary, deliverables_summary, estimated_days,
         currency, subtotal_cents, discount_cents, tax_cents, total_cents,
         deposit_percent, status, valid_until, created_by
       ) values (
         $1, $2, 'Phase4 Client A', $3, 'Concurrency Lock Verification Proposal', 'cybersecurity',
         'fixed_package', 'Concurrent accept safety test', 'Summary PDF', 7,
         'USD', 100000, 0, 0, 100000,
         50, 'sent', current_date + 7, $4
       ) returning id`,
      [clientA.id, serviceId, clientA.email, adminUser.id]
    );
    const proposalId = propRes.rows[0].id;

    // 1. Concurrent/double proposal acceptance -> idempotent lock returns same order_id with already_accepted=true and creates strictly 1 order
    const clientASession = {
      pgRole: 'authenticated' as const,
      userId: clientA.id,
      email: clientA.email,
      aal: 'aal1' as const,
      appRole: 'client' as const,
    };
    const [accept1, accept2] = await Promise.all([
      pg.queryAs<{
        res: { order_id: string; deposit_invoice_id: string; already_accepted?: boolean };
      }>(
        clientASession,
        `select public.accept_proposal_and_create_order($1, $2) as res`,
        [proposalId, clientA.id]
      ),
      pg.queryAs<{
        res: { order_id: string; deposit_invoice_id: string; already_accepted?: boolean };
      }>(
        clientASession,
        `select public.accept_proposal_and_create_order($1, $2) as res`,
        [proposalId, clientA.id]
      ),
    ]);
    const res1Accept = accept1.rows[0].res;
    const res2Accept = accept2.rows[0].res;
    expect(res1Accept.order_id).toBe(res2Accept.order_id);
    expect(res1Accept.deposit_invoice_id).toBe(res2Accept.deposit_invoice_id);
    expect([Boolean(res1Accept.already_accepted), Boolean(res2Accept.already_accepted)].sort()).toEqual([
      false,
      true,
    ]);

    const createdOrders = await pg.db.query<{ id: string }>(
      `select id from public.orders where proposal_id = $1`,
      [proposalId]
    );
    expect(createdOrders.rows).toHaveLength(1);

    // 2. Concurrent double credit note (60% + 60% against $500 invoice = $300 + $300) -> only 1 succeeds
    const depositInvoiceId = res1Accept.deposit_invoice_id;
    const adminSession = {
      pgRole: 'authenticated' as const,
      userId: adminUser.id,
      email: adminUser.email,
      aal: 'aal2' as const,
      appRole: 'admin' as const,
    };
    const [cn1, cn2] = await Promise.allSettled([
      pg.queryAs(
        adminSession,
        `select public.create_credit_note_atomic($1, $2, 30000, 'Concurrent CN #1')`,
        [depositInvoiceId, adminUser.id]
      ),
      pg.queryAs(
        adminSession,
        `select public.create_credit_note_atomic($1, $2, 30000, 'Concurrent CN #2')`,
        [depositInvoiceId, adminUser.id]
      ),
    ]);
    expect([cn1, cn2].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect([cn1, cn2].filter((r) => r.status === 'rejected')).toHaveLength(1);

    const invAfter = await pg.db.query<{ credited_cents: number; status: string }>(
      `select credited_cents, status::text from public.invoices where id = $1`,
      [depositInvoiceId]
    );
    expect(invAfter.rows[0]).toEqual({ credited_cents: 30000, status: 'issued' });

    // 3. Over-quota parallel R2 upload reservations (6 × 95 MB = 570 MB > 500 MiB quota, 100 MiB per-file limit)
    const reservationResults = await Promise.all(
      Array.from({ length: 6 }, (_, idx) =>
        pg.queryAs<{ ok: boolean }>(
          { pgRole: 'service_role' },
          `select public.reserve_vault_upload_quota($1, $2, 95000000, 900) as ok`,
          [clientA.id, `private/${clientA.id}/payment_proof/reserve-${idx}.pdf`]
        )
      )
    );
    const okCount = reservationResults.filter((r) => r.rows[0].ok === true).length;
    const rejectedCount = reservationResults.filter((r) => r.rows[0].ok === false).length;
    expect(okCount).toBe(5);
    expect(rejectedCount).toBe(1);
  });
});
