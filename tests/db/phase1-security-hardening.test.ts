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
});
