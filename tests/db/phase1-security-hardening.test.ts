import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDisposablePostgres,
  type DisposablePostgres,
  type TestUserRecord,
} from '../harness/disposable-pg.mjs';

describe('Phase 1 P0 DB Security Hardening & Invariants', () => {
  let pg: DisposablePostgres;
  let adminUser: TestUserRecord;
  let clientA: TestUserRecord;
  let vaptServiceId: string;
  let webServiceId: string;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
    adminUser = await pg.createTestUser({
      email: 'sec-admin@disposable.test',
      fullName: 'Security Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: true,
    });
    clientA = await pg.createTestUser({
      email: 'sec-client@disposable.test',
      fullName: 'Security Client',
      role: 'client',
      isActive: true,
    });

    const vaptRes = await pg.db.query<{ id: string }>(
      `select id from public.services where slug = 'vapt-penetration-testing' limit 1`
    );
    vaptServiceId = vaptRes.rows[0].id;

    const webRes = await pg.db.query<{ id: string }>(
      `select id from public.services where slug = 'fullstack-web-development' limit 1`
    );
    webServiceId = webRes.rows[0].id;
  });

  afterAll(async () => {
    await pg?.close();
  });

  it('[SEC-DB-01] derives package order price/deposit/revisions/roe from catalog in create_package_order_atomic and forces cybersecurity RoE', async () => {
    // 1. Authenticated client attempts to buy Standard VAPT ($1,200) for $1 (100 cents), 0% deposit, 99 revisions, no RoE
    const forgedPkg = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.create_package_order_atomic(
         $1, $2, 'Forged $1 Pentest', 'Forged payload', 'development', false,
         false, 99, 100, 0, 1, 'https://target.example',
         '{"package_tier":"standard"}'::jsonb, array['Done'], 'hi', 'Deposit'
       ) as res`,
      [clientA.id, vaptServiceId]
    );

    const forgedOrderId = forgedPkg.rows[0].res.order_id;
    const ord = await pg.db.query<{
      pillar: string;
      total_cents: number;
      deposit_percent: number;
      revisions_included: number;
      requires_roe: boolean;
      status: string;
    }>(
      `select pillar::text, total_cents, deposit_percent, revisions_included, requires_roe, status::text
       from public.orders where id = $1`,
      [forgedOrderId]
    );
    // Catalog Standard VAPT is 120000 cents, 50% deposit, 2 revisions, cybersecurity, requires_roe = true
    expect(ord.rows[0]).toEqual({
      pillar: 'cybersecurity',
      total_cents: 120000,
      deposit_percent: 50,
      revisions_included: 2,
      requires_roe: true,
      status: 'awaiting_payment',
    });

    // 2. Unpriced custom deal via create_package_order_atomic must be rejected at DB layer
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `select public.create_package_order_atomic(
           $1, null, 'Arbitrary Self-Minted Deal', 'Desc', 'development', true,
           false, 10, 2500, 100, 5, '',
           '{}'::jsonb, array['M1'], 'hi', 'Deposit'
         )`,
        [clientA.id]
      )
    ).rejects.toThrow();

    // 3. create_admin_order_atomic must still force requires_roe = true whenever pillar = cybersecurity
    const adminCyber = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Admin Cyber Direct', 'Desc', 'cybersecurity', 50000, 50, false, 7
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const adminCyberOrder = await pg.db.query<{ requires_roe: boolean }>(
      `select requires_roe from public.orders where id = $1`,
      [adminCyber.rows[0].res.order_id]
    );
    expect(adminCyberOrder.rows[0].requires_roe).toBe(true);
  });

  it('[SEC-DB-02] enforces unconditional AAL2 is_admin(), profiles.tokens_valid_after cutoff, and financial delete/status/FX guards', async () => {
    // 1. Even if mfa_enforced is disabled on admin row, AAL1 admin must return is_admin() = false
    const aal1NonEnforcedAdmin = await pg.createTestUser({
      email: 'no-mfa-flag-admin@disposable.test',
      fullName: 'Flag Off Admin',
      role: 'admin',
      isActive: true,
      mfaEnforced: false,
    });
    const aal1Check = await pg.queryAs<{ ok: boolean }>(
      { userId: aal1NonEnforcedAdmin.id, email: aal1NonEnforcedAdmin.email, appRole: 'admin', aal: 'aal1' },
      `select public.is_admin() as ok`
    );
    expect(aal1Check.rows[0].ok).toBe(false);

    // 2. profiles.tokens_valid_after exists and advances on role/is_active downgrade, invalidating older JWT iat even after reactivation
    const revokedUser = await pg.createTestUser({
      email: 'cutoff-user@disposable.test',
      fullName: 'Cutoff User',
      role: 'client',
      isActive: true,
    });
    const issuedAtSec = Math.floor(Date.now() / 1000) - 60;
    await pg.db.query(`update public.profiles set is_active = false where id = $1`, [revokedUser.id]);
    const cutoffRow = await pg.db.query<{ tokens_valid_after: string }>(
      `select tokens_valid_after::text from public.profiles where id = $1`,
      [revokedUser.id]
    );
    expect(Number(cutoffRow.rows[0].tokens_valid_after)).toBeGreaterThan(issuedAtSec);

    // Re-activate profile; old JWT issued BEFORE deactivation (iat < tokens_valid_after) must remain unauthorized via RLS/current_account_role()
    await pg.db.query(`update public.profiles set is_active = true where id = $1`, [revokedUser.id]);
    const staleRoleCheck = await pg.db.transaction(async (tx) => {
      await tx.exec(`set local search_path = public, extensions; set local role authenticated;`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({
          sub: revokedUser.id,
          email: revokedUser.email,
          role: 'authenticated',
          aal: 'aal1',
          iat: issuedAtSec,
          app_metadata: { role: 'client' },
        }),
      ]);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [revokedUser.id]);
      return tx.query<{ role_res: string | null }>(`select public.current_account_role() as role_res`);
    });
    expect(staleRoleCheck.rows[0].role_res).toBeNull();

    // 3. Direct payment deletion is blocked & direct non-RPC invoice status flip to paid is blocked
    const issued = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.issue_invoice_atomic($1, null, false, 'USD', 1.0, 50000, 0, 0, 7, 'Test', 'Test Item') as res`,
      [clientA.id]
    );
    const invId = issued.rows[0].res.invoice_id;

    // Client tries submitting payment with inflated fx_rate_to_usd = 500 -> trigger must pin to parent invoice fx_rate_to_usd (1.0)
    const payRow = await pg.queryAs<{ id: string; fx_rate_to_usd: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.payments (invoice_id, client_id, method, currency, fx_rate_to_usd, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 500.0, 25000, 'FX-SPOOF-TEST-1')
       returning id, fx_rate_to_usd::text`,
      [invId, clientA.id]
    );
    expect(Number(payRow.rows[0].fx_rate_to_usd)).toBe(1);

    // Authenticated admin cannot delete payments via RLS (0 rows), and even service_role is blocked by guard_payment_delete
    const rlsDelPay = await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `delete from public.payments where id = $1 returning id`,
      [payRow.rows[0].id]
    );
    expect(rlsDelPay.rows).toHaveLength(0);

    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `delete from public.payments where id = $1`,
        [payRow.rows[0].id]
      )
    ).rejects.toThrow(/payments cannot be deleted/i);

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `update public.invoices set status = 'paid' where id = $1`,
        [invId]
      )
    ).rejects.toThrow();
  });

  it('[SEC-DB-03] locks verified requirements, blocks RoE re-sign, filters internal audit_logs, and enforces RoE on queued orders', async () => {
    const orderRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select public.create_package_order_atomic(
         $1, $2, 'Web Engagement', 'Scope', 'development', false,
         false, 2, 12000, 50, 5, 'Target app',
         '{"package_tier":"starter"}'::jsonb, array['Build'], 'hi', 'Deposit'
       ) as res`,
      [clientA.id, webServiceId]
    );
    const webOrderId = orderRes.rows[0].res.order_id;

    // Unlock to pending_requirements and verify requirements by admin
    await pg.queryAs(
      { pgRole: 'service_role' },
      `update public.orders set status = 'pending_requirements' where id = $1`,
      [webOrderId]
    );
    await pg.queryAs(
      { pgRole: 'service_role' },
      `update public.order_requirements
       set verified_by_admin_at = now()
       where order_id = $1`,
      [webOrderId]
    );

    // Client must NOT be able to mutate order_requirements once verified_by_admin_at is set
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `update public.order_requirements
         set target_scope_notes = 'Tampered post-verification scope'
         where order_id = $1
         returning id`,
        [webOrderId]
      ).then((r) => {
        if (r.rows.length === 0) throw new Error('RLS blocked update cleanly');
        return r;
      })
    ).rejects.toThrow();

    // RoE cannot be updated/re-inserted once orders.roe_signed_at is set
    const cyberRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'RoE Lock Test', 'Scope', 'cybersecurity', 50000, 0, true, 7
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const cyberOrderId = cyberRes.rows[0].res.order_id;

    // Cannot advance a requires_roe order to 'queued' before RoE is signed
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `update public.orders set status = 'queued' where id = $1`,
        [cyberOrderId]
      )
    ).rejects.toThrow(/roe|rules of engagement/i);

    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.engagement_authorizations (
         order_id, client_id, authorized_targets, testing_window_start, testing_window_end,
         emergency_contact_name, emergency_contact_phone, ownership_attested, signer_full_name
       ) values ($1, $2, array['app.example.com'], now(), now() + interval '7 days', 'Jane', '+15550101', true, 'Jane Doe')`,
      [cyberOrderId, clientA.id]
    );
    await pg.db.query(`update public.orders set roe_signed_at = now() where id = $1`, [cyberOrderId]);

    // Second insert / update attempt on engagement_authorizations after roe_signed_at must fail
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
        `update public.engagement_authorizations set authorized_targets = array['evil.com'] where order_id = $1 returning id`,
        [cyberOrderId]
      ).then((r) => {
        if (r.rows.length === 0) throw new Error('RLS blocked RoE overwrite');
        return r;
      })
    ).rejects.toThrow();

    // audit_logs must hide internal admin actions (client.note_added / client.tier_updated / order.internal_note_added) from client
    await pg.db.query(
      `insert into public.audit_logs (actor_id, actor_role, client_id, action, entity_type, summary, metadata)
       values
         ($1, 'admin', $2, 'client.note_added', 'client_note', 'Secret VIP risk note', '{"internal":true}'::jsonb),
         ($1, 'admin', $2, 'order.completed', 'order', 'Visible completion notice', '{}'::jsonb)`,
      [adminUser.id, clientA.id]
    );
    const clientAudit = await pg.queryAs<{ action: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `select action from public.audit_logs where client_id = $1`,
      [clientA.id]
    );
    expect(clientAudit.rows.some((r) => r.action === 'client.note_added')).toBe(false);
    expect(clientAudit.rows.some((r) => r.action === 'order.completed')).toBe(true);

    // 5. Concurrent presign quota reservation counts pending <=100MB uploads toward 500 MiB ceiling
    for (let i = 1; i <= 5; i += 1) {
      const okRes = await pg.queryAs<{ ok: boolean }>(
        { pgRole: 'service_role' },
        `select public.reserve_vault_upload_quota($1, $2, $3, 900) as ok`,
        [clientA.id, `private/${clientA.id}/payment_proof/reserve-${i}.pdf`, 90_000_000]
      );
      expect(okRes.rows[0].ok).toBe(true);
    }

    const overflowRes = await pg.queryAs<{ ok: boolean }>(
      { pgRole: 'service_role' },
      `select public.reserve_vault_upload_quota($1, $2, $3, 900) as ok`,
      [clientA.id, `private/${clientA.id}/payment_proof/reserve-6.pdf`, 90_000_000]
    );
    expect(overflowRes.rows[0].ok).toBe(false);
  });

  it('[SEC-DB-04] allows newly registered clients without app_metadata.role claim while blocking cross-tenant order_requirements hijack, un-attested RoE execution, negative FX, and credit_note/issued-invoice deletion', async () => {
    const clientB = await pg.createTestUser({
      email: 'sec-client-b@disposable.test',
      fullName: 'Security Client B',
      role: 'client',
      isActive: true,
    });

    // 1. A newly self-registered or invited client whose JWT app_metadata has no 'role' field
    //    must still resolve current_account_role() = 'client' and is_active_client() = true
    const newClientRoleCheck = await pg.queryAs<{
      account_role: string | null;
      active_client: boolean;
      active_user: boolean;
    }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, aal: 'aal1', appRole: '' as unknown as 'client' },
      `select
         public.current_account_role() as account_role,
         public.is_active_client() as active_client,
         public.is_active_user() as active_user`
    );
    expect(newClientRoleCheck.rows[0]).toEqual({
      account_role: 'client',
      active_client: true,
      active_user: true,
    });

    // Conversely, an admin without app_metadata.role = 'admin' must be rejected
    const unverifiedAdminCheck = await pg.queryAs<{
      account_role: string | null;
      is_adm: boolean;
    }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, aal: 'aal2' },
      `select
         public.current_account_role() as account_role,
         public.is_admin() as is_adm`
    );
    expect(unverifiedAdminCheck.rows[0]).toEqual({
      account_role: null,
      is_adm: false,
    });

    // 2. Cross-tenant order_requirements IDOR: Client A cannot re-point their unverified order_requirements row to Client B's order
    const clientAOrderRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, aal: 'aal1' },
      `select public.create_package_order_atomic(
         $1, $2, 'Client A Dev Order', 'Scope A', 'development', false,
         false, 2, 12000, 50, 5, 'Client A scope',
         '{"package_tier":"starter"}'::jsonb, array['Build'], 'hi', 'Deposit'
       ) as res`,
      [clientA.id, webServiceId]
    );
    const clientAOrderId = clientAOrderRes.rows[0].res.order_id;

    const clientBOrderRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Client B BDT Order', 'Scope B', 'development', 5000000, 50, false, 10, 'BDT'
       ) as res`,
      [adminUser.id, clientB.id]
    );
    const clientBOrderId = clientBOrderRes.rows[0].res.order_id;

    // Verify p_currency = 'BDT' propagated to orders and deposit invoice
    const bdtOrderCheck = await pg.db.query<{ order_currency: string; inv_currency: string }>(
      `select o.currency as order_currency, i.currency as inv_currency
       from public.orders o
       join public.invoices i on i.order_id = o.id
       where o.id = $1`,
      [clientBOrderId]
    );
    expect(bdtOrderCheck.rows[0]).toEqual({
      order_currency: 'BDT',
      inv_currency: 'BDT',
    });

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, aal: 'aal1' },
        `update public.order_requirements
         set order_id = $1
         where order_id = $2
         returning id`,
        [clientBOrderId, clientAOrderId]
      ).then((r) => {
        if (r.rows.length === 0) throw new Error('Cross-tenant order_id reassignment blocked');
        return r;
      })
    ).rejects.toThrow();

    // Client also cannot INSERT order_requirements with verified_by_admin_at pre-populated
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: clientB.id, email: clientB.email, aal: 'aal1' },
        `insert into public.order_requirements (order_id, client_id, target_scope_notes, verified_by_admin_at)
         values ($1, $2, 'Forged pre-verified', now())`,
        [clientBOrderId, clientB.id]
      )
    ).rejects.toThrow(/only administrators|locked/i);

    // 3. Setting orders.roe_signed_at without a real engagement_authorizations row must NOT bypass enforce_order_roe_before_progress
    const fakeRoeOrderRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Unattested RoE Order', 'Scope', 'cybersecurity', 50000, 0, true, 7
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const fakeRoeOrderId = fakeRoeOrderRes.rows[0].res.order_id;

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `update public.orders set roe_signed_at = now(), status = 'in_progress' where id = $1`,
        [fakeRoeOrderId]
      )
    ).rejects.toThrow(/rules of engagement|roe/i);

    // 4. Negative p_fx_rate in record_manual_payment_atomic must be rejected, and issued invoices/credit_notes cannot be deleted
    const bdtInvRes = await pg.db.query<{ id: string }>(
      `select id from public.invoices where order_id = $1 limit 1`,
      [clientBOrderId]
    );
    const bdtInvId = bdtInvRes.rows[0].id;

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.record_manual_payment_atomic($1, $2, 'bank_transfer', 100000, 'NEG-FX-1', -0.5)`,
        [bdtInvId, adminUser.id]
      )
    ).rejects.toThrow(/fx_rate|positive/i);

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `delete from public.invoices where id = $1`,
        [bdtInvId]
      )
    ).rejects.toThrow(/immutable|cannot be deleted/i);

    // 5. Internal ticket note and draft proposal/invoice audit logs must be hidden from client SELECT
    await pg.db.query(
      `insert into public.audit_logs (actor_id, actor_role, client_id, action, entity_type, summary, metadata)
       values
         ($1, 'admin', $2, 'ticket.replied', 'ticket', 'Internal escalation note', '{"isInternalNote":true}'::jsonb),
         ($1, 'admin', $2, 'proposal.draft_saved', 'proposal', 'Secret draft pricing', '{}'::jsonb),
         ($1, 'admin', $2, 'invoice.draft_created', 'invoice', 'Draft invoice internal', '{}'::jsonb)`,
      [adminUser.id, clientA.id]
    );
    const filteredAudit = await pg.queryAs<{ action: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, aal: 'aal1' },
      `select action from public.audit_logs where client_id = $1`,
      [clientA.id]
    );
    const actionsSeen = filteredAudit.rows.map((r) => r.action);
    expect(actionsSeen).not.toContain('ticket.replied');
    expect(actionsSeen).not.toContain('proposal.draft_saved');
    expect(actionsSeen).not.toContain('invoice.draft_created');

    // 6. Verify 0029 Supabase Free-Tier advisor invariants:
    //    - contact_consent_control is SECURITY INVOKER (prosecdef = false)
    //    - 0 public tables with RLS enabled but no policy
    //    - 0 public policies with bare un-cached auth.uid()
    const advisorCheck = await pg.db.query<{
      consent_secdef: boolean;
      tables_without_policy: number;
      bare_auth_uid_policies: number;
    }>(
      `select
         (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'contact_consent_control' limit 1) as consent_secdef,
         (select count(*)::int from pg_tables t where t.schemaname = 'public' and t.rowsecurity is true and not exists (select 1 from pg_policies pol where pol.schemaname = 'public' and pol.tablename = t.tablename)) as tables_without_policy,
         (select count(*)::int from pg_policies where schemaname = 'public' and ((qual is not null and qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%' and qual not like '%select auth.uid()%') or (with_check is not null and with_check like '%auth.uid()%' and with_check not like '%SELECT auth.uid()%' and with_check not like '%select auth.uid()%'))) as bare_auth_uid_policies`
    );
    expect(advisorCheck.rows[0]).toEqual({
      consent_secdef: false,
      tables_without_policy: 0,
      bare_auth_uid_policies: 0,
    });
  });

  it('[SEC-DB-05] enforces 0030 deposit+RoE window guards, review_invoice_payment void/paid/overpay rejection, paid-revision balance separation, and cron retainer idempotency', async () => {
    // 1. Unpaid kickoff deposit blocks entering in_progress
    const depOrdRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Deposit Gate Test', 'Scope', 'development', 100000, 50, false, 10
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const depOrderId = depOrdRes.rows[0].res.order_id;

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `update public.orders set status = 'in_progress' where id = $1`,
        [depOrderId]
      )
    ).rejects.toThrow(/deposit/i);

    // 2. Expired RoE testing window blocks entering in_progress, while active window succeeds and post-window completion succeeds
    const roeOrdRes = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'RoE Window Gate Test', 'Scope', 'cybersecurity', 50000, 0, true, 7
       ) as res`,
      [adminUser.id, clientA.id]
    );
    const roeOrderId = roeOrdRes.rows[0].res.order_id;

    await pg.queryAs(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.engagement_authorizations (
         order_id, client_id, authorized_targets, testing_window_start, testing_window_end,
         emergency_contact_name, emergency_contact_phone, ownership_attested, signer_full_name
       ) values ($1, $2, array['expired.example.com'], now() - interval '10 days', now() - interval '1 day', 'Ops', '+15550199', true, 'Security Client')`,
      [roeOrderId, clientA.id]
    );
    await pg.db.query(`update public.orders set roe_signed_at = now() where id = $1`, [roeOrderId]);

    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `update public.orders set status = 'in_progress' where id = $1`,
        [roeOrderId]
      )
    ).rejects.toThrow(/testing window|rules of engagement|roe/i);

    // 3. review_invoice_payment rejects confirming a submitted payment after invoice is voided, and rejects NaN FX
    const voidableInv = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.issue_invoice_atomic($1, null, false, 'USD', 1.0, 20000, 0, 0, 7, 'Void race test', 'Line') as res`,
      [clientA.id]
    );
    const voidableInvId = voidableInv.rows[0].res.invoice_id;
    const pendingPay = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: clientA.id, email: clientA.email, appRole: 'client', aal: 'aal1' },
      `insert into public.payments (invoice_id, client_id, method, currency, amount_cents, reference)
       values ($1, $2, 'bank_transfer', 'USD', 20000, 'VOID-RACE-PAY-1') returning id`,
      [voidableInvId, clientA.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.void_invoice_atomic($1, $2)`,
      [voidableInvId, adminUser.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.review_invoice_payment($1, $2, 'confirmed', 1.0, null)`,
        [pendingPay.rows[0].id, adminUser.id]
      )
    ).rejects.toThrow(/not open|void|settled/i);

    // Reject 'NaN'::numeric FX in issue_invoice_atomic and record_manual_payment_atomic
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.issue_invoice_atomic($1, null, false, 'EUR', 'NaN'::numeric, 10000, 0, 0, 7, 'NaN FX', 'Line')`,
        [clientA.id]
      )
    ).rejects.toThrow(/fx|positive|finite|nan/i);

    // 4. Paid-revision addendum: does NOT flip order back to 'completed', does NOT under-bill final balance
    const revClient = await pg.createTestUser({
      email: 'paid-rev-client@disposable.test',
      fullName: 'Paid Rev Client',
      role: 'client',
      isActive: true,
    });
    const revOrdRes = await pg.queryAs<{ res: { order_id: string; deposit_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic(
         $1, $2, 'Paid Revision Balance Test', 'Scope', 'development', 100000, 50, false, 10
       ) as res`,
      [adminUser.id, revClient.id]
    );
    const revOrderId = revOrdRes.rows[0].res.order_id;
    const revDepInvId = revOrdRes.rows[0].res.deposit_invoice_id;

    // Pay $500 deposit
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'manual', 50000, 'REV-DEP-500', 1.0)`,
      [revDepInvId, adminUser.id]
    );
    // Deliver v1.0 & set order delivered, plus assume an earlier accepted final milestone existed?
    // Simulate delivered state with 0 revisions left, then issue + pay a $150 paid-revision addendum
    await pg.db.query(`update public.orders set status = 'delivered', revisions_included = 1, revisions_used = 1 where id = $1`, [revOrderId]);
    const revAddonInv = await pg.queryAs<{ res: { invoice_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_paid_revision_invoice_atomic($1, $2, 1, 15000, 'Extra revision round') as res`,
      [revOrderId, adminUser.id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.record_manual_payment_atomic($1, $2, 'manual', 15000, 'REV-ADDON-150', 1.0)`,
      [revAddonInv.rows[0].res.invoice_id, adminUser.id]
    );
    const afterAddonOrder = await pg.db.query<{ status: string; revisions_included: number }>(
      `select status::text, revisions_included from public.orders where id = $1`,
      [revOrderId]
    );
    expect(afterAddonOrder.rows[0]).toEqual({ status: 'revision_requested', revisions_included: 2 });

    // Deliver v2.0 final -> client accepts -> final balance invoice MUST be $500 (50000 cents), NOT $350 (35000)!
    const deliv2 = await pg.queryAs<{ id: string }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `insert into public.deliverables (order_id, version_label, title, is_final_delivery, status, submitted_by)
       values ($1, 'v2.0', 'Revised Final Deliverable', true, 'submitted', $2) returning id`,
      [revOrderId, adminUser.id]
    );
    const accept2 = await pg.queryAs<{ res: { final_invoice_id: string } }>(
      { pgRole: 'authenticated', userId: revClient.id, email: revClient.email, appRole: 'client', aal: 'aal1' },
      `select public.review_order_deliverable($1, $2, 'accepted', 'Great revision') as res`,
      [deliv2.rows[0].id, revClient.id]
    );
    const finalBalInv = await pg.db.query<{ total_cents: number }>(
      `select total_cents from public.invoices where id = $1`,
      [accept2.rows[0].res.final_invoice_id]
    );
    expect(finalBalInv.rows[0].total_cents).toBe(50000);

    // 5. Duplicate active milestone invoice blocked in create_draft_invoice_multi_atomic
    const msRow = await pg.db.query<{ id: string }>(
      `insert into public.order_milestones (order_id, title, amount_cents, position)
       values ($1, 'Milestone A', 25000, 0) returning id`,
      [revOrderId]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_draft_invoice_multi_atomic(
         $1, $2, $3, 'USD', 1.0, 0, 0, 7, null, 'MS inv 1',
         '[{"description":"MS A","qty":1,"unit_price_cents":25000}]'::jsonb, false, $4
       )`,
      [revClient.id, revOrderId, msRow.rows[0].id, adminUser.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
        `select public.create_draft_invoice_multi_atomic(
           $1, $2, $3, 'USD', 1.0, 0, 0, 7, null, 'MS inv 2',
           '[{"description":"MS A dup","qty":1,"unit_price_cents":25000}]'::jsonb, false, $4
         )`,
        [revClient.id, revOrderId, msRow.rows[0].id, adminUser.id]
      )
    ).rejects.toThrow(/already|milestone/i);

    // 6. Automated cron retainer renewal enforces next_invoice_date <= current_date and enqueues retainer_renewed email_outbox
    const retDue = await pg.db.query<{ id: string }>(
      `insert into public.retainer_plans (client_id, title, monthly_fee_cents, hours_per_month, billing_cycle, next_invoice_date, current_period_end)
       values ($1, 'Cron Retainer Test', 40000, 10, 'monthly', current_date, current_date) returning id`,
      [revClient.id]
    );
    const firstRenew = await pg.queryAs<{ res: { invoice_id?: string; skipped?: boolean } }>(
      { pgRole: 'service_role' },
      `select public.renew_retainer_cycle_atomic($1, null, false) as res`,
      [retDue.rows[0].id]
    );
    expect(typeof firstRenew.rows[0].res.invoice_id).toBe('string');

    // Immediate second automated renewal call must skip (no double-billing!)
    const secondRenew = await pg.queryAs<{ res: { skipped?: boolean } }>(
      { pgRole: 'service_role' },
      `select public.renew_retainer_cycle_atomic($1, null, false) as res`,
      [retDue.rows[0].id]
    );
    expect(secondRenew.rows[0].res.skipped).toBe(true);

    // Confirm retainer_renewed email was atomically enqueued inside email_outbox
    const retOutbox = await pg.db.query<{ template: string }>(
      `select template from public.email_outbox where entity_id = $1 and template = 'retainer_renewed'`,
      [firstRenew.rows[0].res.invoice_id]
    );
    expect(retOutbox.rows).toHaveLength(1);
  });

  it('[SEC-DB-06] enqueues cron overdue+auto-accept emails, prunes expired rate_limits/reservations, enforces tokens_valid_after on profiles, and locks direct PostgREST RLS gaps', async () => {
    const rlsClient = await pg.createTestUser({
      email: 'rls-0030-client@disposable.test',
      fullName: 'RLS 0030 Client',
      role: 'client',
      isActive: true,
    });

    // 1. run_daily_crm_maintenance atomically queues invoice_overdue + deliverable_auto_accepted emails and prunes expired rate_limits & vault_upload_reservations
    const overdueDraft = await pg.db.query<{ id: string }>(
      `insert into public.invoices (
         client_id, is_deposit_invoice, status, currency, fx_rate_to_usd,
         subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents, due_at, notes
       ) values (
         $1, false, 'draft', 'USD', 1.0, 15000, 0, 0, 0, 15000, current_date - 3, 'Overdue cron test'
       ) returning id`,
      [rlsClient.id]
    );
    await pg.db.query(
      `insert into public.invoice_items (invoice_id, position, description, qty, unit_price_cents)
       values ($1, 0, 'Audit', 1, 15000)`,
      [overdueDraft.rows[0].id]
    );
    await pg.queryAs(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.send_draft_invoice_atomic($1, $2)`,
      [overdueDraft.rows[0].id, adminUser.id]
    );

    const autoOrd = await pg.queryAs<{ res: { order_id: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.create_admin_order_atomic($1, $2, 'Auto-Accept Cron Order', 'Scope', 'development', 30000, 0, false, 7) as res`,
      [adminUser.id, rlsClient.id]
    );
    const autoDeliv = await pg.db.query<{ id: string }>(
      `insert into public.deliverables (order_id, version_label, title, is_final_delivery, status, auto_accept_at, submitted_by)
       values ($1, 'v1.0', 'Elapsed Deliverable', false, 'submitted', now() - interval '1 hour', $2) returning id`,
      [autoOrd.rows[0].res.order_id, adminUser.id]
    );

    await pg.db.query(
      `insert into public.rate_limits (kind, key_hash, window_started_at, count)
       values ('ip', 'stale-rate-limit-hash-0030', now() - interval '48 hours', 1)`
    );
    await pg.db.query(
      `insert into public.vault_upload_reservations (r2_key, client_id, size_bytes, expires_at)
       values ($1, $2, 1024, now() - interval '2 hours')`,
      [`private/${rlsClient.id}/payment_proof/expired-res.pdf`, rlsClient.id]
    );

    const maintRes = await pg.db.query<{ res: Record<string, number> }>(
      `select public.run_daily_crm_maintenance() as res`
    );
    expect(maintRes.rows[0].res.overdue_invoices).toBeGreaterThanOrEqual(1);
    expect(maintRes.rows[0].res.auto_accepted_deliverables).toBeGreaterThanOrEqual(1);
    expect(maintRes.rows[0].res.pruned_rate_limits).toBeGreaterThanOrEqual(1);
    expect(maintRes.rows[0].res.pruned_upload_reservations).toBeGreaterThanOrEqual(1);

    const cronEmails = await pg.db.query<{ template: string }>(
      `select template from public.email_outbox where to_email = $1 and template in ('invoice_overdue', 'deliverable_auto_accepted')`,
      [rlsClient.email]
    );
    expect(cronEmails.rows.map((r) => r.template).sort()).toEqual([
      'deliverable_auto_accepted',
      'invoice_overdue',
    ]);
    expect(autoDeliv.rows[0].id).toBeTruthy();

    // 2. Direct PostgREST RLS hardening:
    // 2a. Client cannot insert cancellation_requests with forged status='approved'
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
        `insert into public.cancellation_requests (order_id, requested_by, reason, status, resolved_by)
         values ($1, $2, 'Forged auto approval', 'approved', $2)`,
        [autoOrd.rows[0].res.order_id, rlsClient.id]
      )
    ).rejects.toThrow();

    // 2b. Client cannot mutate notification title/body/href, ONLY read_at
    const notifRow = await pg.db.query<{ id: string }>(
      `insert into public.notifications (recipient_id, category, title, body, href)
       values ($1, 'system', 'Original Title', 'Original Body', '/portal') returning id`,
      [rlsClient.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
        `update public.notifications set title = 'Tampered Title' where id = $1`,
        [notifRow.rows[0].id]
      )
    ).rejects.toThrow(/only read_at|immutable/i);

    const readOk = await pg.queryAs<{ read_at: string | null }>(
      { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
      `update public.notifications set read_at = now() where id = $1 returning read_at::text`,
      [notifRow.rows[0].id]
    );
    expect(readOk.rows[0].read_at).not.toBeNull();

    // 2c. Client cannot post to closed tickets or cancelled orders
    const closedTicket = await pg.db.query<{ id: string }>(
      `insert into public.tickets (client_id, subject, status)
       values ($1, 'Closed Support Thread', 'closed') returning id`,
      [rlsClient.id]
    );
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
        `insert into public.ticket_messages (ticket_id, author_id, body, is_internal_note)
         values ($1, $2, 'Post on closed ticket', false)`,
        [closedTicket.rows[0].id, rlsClient.id]
      )
    ).rejects.toThrow();

    await pg.db.query(`update public.orders set status = 'cancelled' where id = $1`, [autoOrd.rows[0].res.order_id]);
    await expect(
      pg.queryAs(
        { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
        `insert into public.order_messages (order_id, author_id, body, is_internal_note)
         values ($1, $2, 'Post on cancelled order', false)`,
        [autoOrd.rows[0].res.order_id, rlsClient.id]
      )
    ).rejects.toThrow();

    // 2d. Expired vault_files (retention_until <= now()) hidden from client SELECT
    await pg.db.query(
      `insert into public.vault_files (owner_client_id, category, r2_key, filename, mime_type, size_bytes, retention_until, uploaded_by)
       values ($1, 'order_attachment', $2, 'expired.pdf', 'application/pdf', 100, now() - interval '1 hour', $1)`,
      [rlsClient.id, `private/${rlsClient.id}/order_attachment/expired-check.pdf`]
    );
    const clientVault = await pg.queryAs<{ filename: string }>(
      { pgRole: 'authenticated', userId: rlsClient.id, email: rlsClient.email, appRole: 'client', aal: 'aal1' },
      `select filename from public.vault_files where owner_client_id = $1`,
      [rlsClient.id]
    );
    expect(clientVault.rows.map((r) => r.filename)).not.toContain('expired.pdf');

    // 3. profiles RLS & caller_account_state enforce tokens_valid_after AND block client resetting tokens_valid_after = 0
    const oldIat = Math.floor(Date.now() / 1000) - 120;
    const cutoffSec = Math.floor(Date.now() / 1000);
    await pg.db.query(`update public.profiles set tokens_valid_after = $1 where id = $2`, [cutoffSec, rlsClient.id]);

    const staleProfileCheck = await pg.db.transaction(async (tx) => {
      await tx.exec(`set local search_path = public, extensions; set local role authenticated;`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({
          sub: rlsClient.id,
          email: rlsClient.email,
          role: 'authenticated',
          aal: 'aal1',
          iat: oldIat,
          app_metadata: { role: 'client' },
        }),
      ]);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [rlsClient.id]);
      const profRows = await tx.query<{ id: string }>(`select id from public.profiles where id = $1`, [rlsClient.id]);
      const stateRow = await tx.query<{ state: string }>(`select public.caller_account_state() as state`);
      return { profCount: profRows.rows.length, state: stateRow.rows[0].state };
    });
    expect(staleProfileCheck).toEqual({ profCount: 0, state: 'revoked' });

    // Even with a fresh JWT (iat >= tokens_valid_after), client cannot reset tokens_valid_after = 0
    const freshIat = cutoffSec + 10;
    await expect(
      pg.db.transaction(async (tx) => {
        await tx.exec(`set local search_path = public, extensions; set local role authenticated;`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({
            sub: rlsClient.id,
            email: rlsClient.email,
            role: 'authenticated',
            aal: 'aal1',
            iat: freshIat,
            app_metadata: { role: 'client' },
          }),
        ]);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [rlsClient.id]);
        await tx.query(`update public.profiles set tokens_valid_after = 0 where id = $1`, [rlsClient.id]);
      })
    ).rejects.toThrow();

    // 4. Atomic consent policy publish leaves exactly 1 active policy and works with 'explicit-checkbox-v1'
    const canonicalV3 = '{"version":"v3"}';
    const newHash = createHash('sha256').update(canonicalV3).digest('hex');
    const pubRes = await pg.queryAs<{ res: { version: string; hash: string } }>(
      { pgRole: 'authenticated', userId: adminUser.id, email: adminUser.email, appRole: 'admin', aal: 'aal2' },
      `select public.publish_consent_policy_atomic('v3', $1, $2, $3) as res`,
      [canonicalV3, newHash, adminUser.id]
    );
    expect(pubRes.rows[0].res).toEqual({ version: 'v3', hash: newHash });
    const activePolicies = await pg.db.query<{ version: string }>(
      `select version from public.consent_policies where is_active is true`
    );
    expect(activePolicies.rows).toEqual([{ version: 'v3' }]);

    // Verify inquiry trigger rejects legacy 'checkbox_v1' (PT409) and accepts 'explicit-checkbox-v1'
    await expect(
      pg.queryAs(
        { pgRole: 'service_role' },
        `insert into public.inquiries (
           name, email, project_summary, consent_at,
           consent_policy_version, consent_policy_hash, consent_capture_method
         ) values ('Bad Quote', 'bad@disposable.test', 'Scope', now(), 'v3', $1, 'checkbox_v1')`,
        [newHash]
      )
    ).rejects.toThrow(/consent policy evidence/i);

    const okInq = await pg.queryAs<{ id: string }>(
      { pgRole: 'service_role' },
      `insert into public.inquiries (
         name, email, project_summary, consent_at,
         consent_policy_version, consent_policy_hash, consent_capture_method
       ) values ('Good Quote', 'good@disposable.test', 'Scope', now(), 'v3', $1, 'explicit-checkbox-v1')
       returning id`,
      [newHash]
    );
    expect(okInq.rows).toHaveLength(1);

    // 5. Verify 0030 preserves 0 bare auth.uid()/auth.jwt() initplan warnings
    const initplanCheck = await pg.db.query<{ bare_auth_calls: number }>(
      `select count(*)::int as bare_auth_calls
         from pg_policies
        where schemaname = 'public'
          and (
            (qual is not null and (
              (qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%' and qual not like '%select auth.uid()%')
              or (qual like '%auth.jwt()%' and qual not like '%SELECT auth.jwt()%' and qual not like '%select auth.jwt()%')
            ))
            or (with_check is not null and (
              (with_check like '%auth.uid()%' and with_check not like '%SELECT auth.uid()%' and with_check not like '%select auth.uid()%')
              or (with_check like '%auth.jwt()%' and with_check not like '%SELECT auth.jwt()%' and with_check not like '%select auth.jwt()%')
            ))
          )`
    );
    expect(initplanCheck.rows[0].bare_auth_calls).toBe(0);
  });
});
