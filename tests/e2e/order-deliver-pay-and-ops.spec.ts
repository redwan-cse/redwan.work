import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  INITIAL_RECOVERY_TOKEN_HASH,
  LOOPBACK_SECRETS,
  SEEDED_USERS,
} from '../harness/loopback-services.mjs';

const SUPABASE_CONTROL_URL = process.env.LOOPBACK_SUPABASE_URL || 'http://127.0.0.1:24391';
const R2_CONTROL_URL = process.env.LOOPBACK_R2_URL || 'http://127.0.0.1:24392';
const RESEND_CONTROL_URL = process.env.LOOPBACK_RESEND_URL || 'http://127.0.0.1:24393';

async function runFixtureOp<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_CONTROL_URL}/__test/fixture-op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...payload }),
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { rows: T[] };
  return body.rows;
}

async function signInClient(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/portal**');
}

async function signInAdminWithAal2(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').first().fill(SEEDED_USERS.admin.email);
  await page.locator('input[name="password"]').fill(SEEDED_USERS.admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/mfa**');
  await page.locator('#totp-code').fill(LOOPBACK_SECRETS.totpValidCode);
  await page.waitForURL('**/admin**');
}

test.describe('End-to-End Business Journeys, Auth Recovery, Vault Storage & Outbox', () => {
  test('[R1-ORDER-DELIVER-PAY] completes client order -> deposit -> RoE -> deliverable -> acceptance -> balance payment -> completed & review', async ({
    browser,
  }) => {
    const clientCtx: BrowserContext = await browser.newContext();
    const adminCtx: BrowserContext = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    const adminPage = await adminCtx.newPage();

    try {
      // 1. Client signs in and places a 50%-deposit VAPT package order ($1,150 total, $575 deposit)
      await signInClient(clientPage, SEEDED_USERS.client.email, SEEDED_USERS.client.password);
      await clientPage.goto('/portal/orders/new');
      await clientPage.locator('select[name="service_slug"]').selectOption('vapt-penetration-testing');
      await clientPage.locator('select[name="tier"]').selectOption('standard');
      await clientPage.locator('input[name="title"]').fill('Production API & Web VAPT Engagement');
      await clientPage
        .locator('textarea[name="target_scope_notes"]')
        .fill('https://api.client-fixture.local');
      await clientPage.getByRole('button', { name: /Launch Contract/i }).click();

      await clientPage.waitForURL(/\/portal\/orders\/[0-9a-f-]{36}$/);
      const orderUrl = clientPage.url();
      const orderId = orderUrl.split('/').pop()!;
      await expect(
        clientPage.getByRole('heading', { level: 1, name: 'Production API & Web VAPT Engagement' })
      ).toBeVisible();
      await expect(clientPage.getByText(/awaiting payment/i).first()).toBeVisible();

      // 2. Client submits 50% kickoff deposit payment proof ($600 on $1,200 package)
      await clientPage.goto('/portal/invoices');
      const depositLink = clientPage.getByRole('link', { name: /Pay \/ Submit Proof/i }).first();
      await expect(depositLink).toBeVisible();
      await depositLink.click();
      await clientPage.waitForURL(/\/portal\/invoices\/[0-9a-f-]{36}$/);

      await expect(clientPage.getByText('Balance Due: USD 600')).toBeVisible();
      await clientPage.locator('input[name="reference"]').fill('SWIFT-DEP-001');
      await clientPage.getByRole('button', { name: 'Submit Payment for Verification' }).click();
      await expect(clientPage.getByText(/SWIFT-DEP-001/)).toBeVisible();

      // 3. Admin signs in with MFA (AAL2) and confirms kickoff deposit
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/invoices');
      await expect(adminPage.getByText('SWIFT-DEP-001')).toBeVisible();
      await adminPage.getByRole('button', { name: 'Confirm Payment' }).first().click();
      await expect(adminPage.getByText('SWIFT-DEP-001')).toHaveCount(0);

      // 4. Client digitally signs Rules of Engagement (RoE) and saves requirements
      await clientPage.goto(`/portal/orders/${orderId}`);
      await clientPage
        .locator('textarea[name="authorized_targets"]')
        .fill('api.client-fixture.local\napp.client-fixture.local');
      await clientPage.locator('input[name="emergency_contact_name"]').fill('Elena Vance');
      await clientPage.locator('input[name="emergency_contact_phone"]').fill('+15550109988');
      await clientPage.locator('input[name="signer_full_name"]').fill('Elena Vance');
      await clientPage.locator('input[name="ownership_attested"]').check();
      await clientPage.getByRole('button', { name: /Digitally Sign Rules of Engagement/i }).click();

      await expect(clientPage.getByText('Authorized Targets')).toBeVisible();
      await expect(clientPage.getByText(/in progress/i).first()).toBeVisible();

      await clientPage
        .locator('textarea[name="access_instructions"]')
        .fill('Staging account credentials shared via encrypted vault.');
      await clientPage.getByRole('button', { name: 'Save Project Requirements' }).click();

      // 5. Admin uploads a real PDF deliverable to loopback R2 and publishes final delivery
      await adminPage.goto(`/admin/orders/${orderId}`);
      await expect(adminPage.getByText('SIGNED & VERIFIED')).toBeVisible();

      const pdfBuffer = Buffer.from('%PDF-1.4\nVerified VAPT Technical & Executive Report\n%%EOF');
      await adminPage.locator('input[type="file"]').setInputFiles({
        name: 'vapt-final-report.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });
      await expect(adminPage.getByText(/Uploaded: vapt-final-report\.pdf/)).toBeVisible();

      await adminPage
        .locator('input[name="title"]')
        .first()
        .fill('Final VAPT Technical & Executive Report');
      await adminPage
        .locator('textarea[name="release_notes"]')
        .fill('Complete OWASP ASVS & PTES findings with remediation verification.');
      await adminPage.getByRole('button', { name: 'Publish Deliverable to Client Portal' }).click();
      await expect(
        adminPage.getByText('Final VAPT Technical & Executive Report').first()
      ).toBeVisible();

      // 6. Client accepts deliverable -> auto-issues final 50% balance invoice ($600); order stays 'delivered' until paid
      await clientPage.goto(`/portal/orders/${orderId}`);
      await expect(
        clientPage.getByText('Final VAPT Technical & Executive Report').first()
      ).toBeVisible();
      await expect(clientPage.getByRole('link', { name: /Download/i }).first()).toBeVisible();

      await clientPage.getByRole('button', { name: /Accept Deliverable & Sign Off/i }).click();
      await expect(clientPage.getByText(/^accepted$/i).first()).toBeVisible();

      const [orderAfterAccept] = await runFixtureOp<{ status: string }>('getOrderStatus', {
        orderId,
      });
      expect(orderAfterAccept.status).toBe('delivered');

      // 7. Client pays final 50% balance invoice ($600) and Admin confirms settlement
      await clientPage.goto('/portal/invoices');
      const balanceLink = clientPage.getByRole('link', { name: /Pay \/ Submit Proof/i }).first();
      await expect(balanceLink).toBeVisible();
      await balanceLink.click();
      await clientPage.waitForURL(/\/portal\/invoices\/[0-9a-f-]{36}$/);

      await expect(clientPage.getByText('Balance Due: USD 600')).toBeVisible();
      await clientPage.locator('input[name="reference"]').fill('SWIFT-BAL-002');
      await clientPage.getByRole('button', { name: 'Submit Payment for Verification' }).click();
      await expect(clientPage.getByText(/SWIFT-BAL-002/)).toBeVisible();

      await adminPage.goto('/admin/invoices');
      await expect(adminPage.getByText('SWIFT-BAL-002')).toBeVisible();
      await adminPage.getByRole('button', { name: 'Confirm Payment' }).first().click();
      await expect(adminPage.getByText('SWIFT-BAL-002')).toHaveCount(0);

      // 8. Order automatically settles to 'completed' (100%) and client submits engagement review
      await clientPage.goto(`/portal/orders/${orderId}`);
      await expect(clientPage.getByText('Progress: 100%')).toBeVisible();
      await expect(clientPage.getByText(/^completed$/i).first()).toBeVisible();

      await clientPage.locator('input[name="headline"]').fill('Rigorous VAPT & clear remediation');
      await clientPage
        .locator('textarea[name="review_text"]')
        .fill('Thorough security assessment with reproducible proof-of-concept evidence.');
      await clientPage.getByRole('button', { name: 'Submit Engagement Review' }).click();
      await expect(clientPage.getByRole('button', { name: 'Update Review' })).toBeVisible();
    } finally {
      await clientCtx.close();
      await adminCtx.close();
    }
  });

  test('[AUTH-RECOVERY] enforces single-use recovery tokens, blocks deactivated sessions, and gates admin routes on AAL2', async ({
    browser,
  }) => {
    // 1. Admin without AAL2 cannot bypass /mfa to reach /admin
    const aal1AdminCtx = await browser.newContext();
    const aal1AdminPage = await aal1AdminCtx.newPage();
    try {
      await aal1AdminPage.goto('/login');
      await aal1AdminPage.locator('input[name="email"]').first().fill(SEEDED_USERS.admin.email);
      await aal1AdminPage.locator('input[name="password"]').fill(SEEDED_USERS.admin.password);
      await aal1AdminPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await aal1AdminPage.waitForURL('**/mfa**');

      await aal1AdminPage.goto('/admin/orders');
      await aal1AdminPage.waitForURL('**/mfa?next=%2Fadmin%2Forders');

      await aal1AdminPage.locator('#totp-code').fill('000000');
      await aal1AdminPage.getByRole('button', { name: 'Verify & Continue' }).click();
      await expect(aal1AdminPage.getByText(/Invalid verification code/i)).toBeVisible();
    } finally {
      await aal1AdminCtx.close();
    }

    // 2. Deactivated user attempting to sign in is immediately signed out and blocked on /login
    const disabledCtx = await browser.newContext();
    const disabledPage = await disabledCtx.newPage();
    try {
      await disabledPage.goto('/login');
      await disabledPage.locator('input[name="email"]').first().fill(SEEDED_USERS.disabled.email);
      await disabledPage.locator('input[name="password"]').fill(SEEDED_USERS.disabled.password);
      await disabledPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(
        disabledPage.getByText('Your account has been deactivated. Contact the administrator.')
      ).toBeVisible();
      await disabledPage.goto('/portal');
      await disabledPage.waitForURL('**/login?next=%2Fportal');
    } finally {
      await disabledCtx.close();
    }

    // 3. Single-use password recovery token succeeds once and rejects replay
    const recoveryCtx = await browser.newContext();
    const recoveryPage = await recoveryCtx.newPage();
    const nextResetValue = `test-reset-${'1'.repeat(12)}`;
    try {
      await recoveryPage.goto(`/reset-password?token_hash=${INITIAL_RECOVERY_TOKEN_HASH}`);
      await recoveryPage.locator('#password').fill(nextResetValue);
      await recoveryPage.locator('#confirm').fill(nextResetValue);
      await recoveryPage.getByRole('button', { name: 'Save new password' }).click();
      await recoveryPage.waitForURL('**/portal**');

      // Mid-session account deactivation forces bounce to /login?reason=deactivated
      await runFixtureOp('setProfileActive', {
        userId: SEEDED_USERS.recovery.id,
        isActive: false,
      });
      await recoveryPage.goto('/portal/orders');
      await recoveryPage.waitForURL('**/login?reason=deactivated');
      await expect(
        recoveryPage.getByText('Your account has been deactivated. Contact the administrator.')
      ).toBeVisible();
      await runFixtureOp('setProfileActive', {
        userId: SEEDED_USERS.recovery.id,
        isActive: true,
      });
    } finally {
      await recoveryCtx.close();
    }

    // Replay the already-consumed recovery token -> must fail
    const replayCtx = await browser.newContext();
    const replayPage = await replayCtx.newPage();
    const replayResetValue = `test-replay-${'2'.repeat(12)}`;
    try {
      await replayPage.goto(`/reset-password?token_hash=${INITIAL_RECOVERY_TOKEN_HASH}`);
      await replayPage.locator('#password').fill(replayResetValue);
      await replayPage.locator('#confirm').fill(replayResetValue);
      await replayPage.getByRole('button', { name: 'Save new password' }).click();
      await expect(replayPage.getByText(/invalid or has expired/i)).toBeVisible();
    } finally {
      await replayCtx.close();
    }
  });

  test('[UPLOAD-FINALIZE-DOWNLOAD] verifies R2 object byte size, blocks cross-tenant downloads, and purges expired retention files', async ({
    browser,
  }) => {
    const clientCtx = await browser.newContext();
    const otherCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    const otherPage = await otherCtx.newPage();

    try {
      await signInClient(clientPage, SEEDED_USERS.client.email, SEEDED_USERS.client.password);
      await signInClient(
        otherPage,
        SEEDED_USERS.otherClient.email,
        SEEDED_USERS.otherClient.password
      );

      // 1. Presign portal payment_proof upload
      const pageOrigin = new URL(clientPage.url()).origin;
      const payloadBytes = Buffer.from('%PDF-1.4\nWire transfer proof receipt payload\n%%EOF');
      const presignRes = await clientPage.request.post('/api/uploads/portal-presign', {
        headers: { origin: pageOrigin },
        data: {
          filename: 'wire-proof.pdf',
          mime: 'application/pdf',
          size: payloadBytes.length,
          category: 'payment_proof',
        },
      });
      expect(presignRes.status()).toBe(200);
      const { key: r2Key, uploadUrl } = (await presignRes.json()) as {
        key: string;
        uploadUrl: string;
      };
      expect(r2Key.startsWith(`private/${SEEDED_USERS.client.id}/payment_proof/`)).toBe(true);

      // 2. Client cannot presign a deliverable package (admin-only category)
      const forbiddenDeliverablePresign = await clientPage.request.post(
        '/api/uploads/portal-presign',
        {
          headers: { origin: pageOrigin },
          data: {
            filename: 'report.pdf',
            mime: 'application/pdf',
            size: 32,
            category: 'deliverable',
          },
        }
      );
      expect(forbiddenDeliverablePresign.status()).toBe(403);
      expect(await forbiddenDeliverablePresign.json()).toEqual({
        error: 'Only administrators can upload deliverable packages.',
      });

      // 3. Upload exact bytes to loopback R2 presigned URL
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: payloadBytes,
      });
      expect(putRes.status).toBe(200);

      // 4. Create an open invoice for client and finalize payment proof via browser UI
      await clientPage.goto('/portal/orders/new');
      await clientPage.locator('select[name="service_slug"]').selectOption('siem-security-monitoring');
      await clientPage.locator('select[name="tier"]').selectOption('standard');
      await clientPage.locator('input[name="title"]').fill('Vault Storage Verification Order');
      await clientPage.getByRole('button', { name: /Launch Contract/i }).click();
      await clientPage.waitForURL(/\/portal\/orders\/[0-9a-f-]{36}$/);

      await clientPage.goto('/portal/invoices');
      await clientPage.getByRole('link', { name: /Pay \/ Submit Proof/i }).first().click();
      await clientPage.waitForURL(/\/portal\/invoices\/[0-9a-f-]{36}$/);

      await clientPage.locator('input[type="file"]').setInputFiles({
        name: 'wire-proof-ui.pdf',
        mimeType: 'application/pdf',
        buffer: payloadBytes,
      });
      await expect(clientPage.getByText(/Uploaded: wire-proof-ui\.pdf/)).toBeVisible();
      await clientPage.locator('input[name="reference"]').fill('WIRE-VAULT-777');
      await clientPage.getByRole('button', { name: 'Submit Payment for Verification' }).click();
      await expect(clientPage.getByText(/WIRE-VAULT-777/)).toBeVisible();

      const [vaultFile] = await runFixtureOp<{
        id: string;
        r2_key: string;
        download_count: number;
      }>('getLatestVaultFileForClient', {
        clientId: SEEDED_USERS.client.id,
        filename: 'wire-proof-ui.pdf',
      });
      expect(vaultFile).toBeTruthy();

      // 5. Authorized owner download returns 302 to signed R2 GET URL, increments download_count, and logs audit
      const ownerDownload = await clientPage.request.get(`/api/files/${vaultFile.id}/download`, {
        maxRedirects: 0,
      });
      expect(ownerDownload.status()).toBe(302);
      const signedGetUrl = ownerDownload.headers()['location'];
      expect(signedGetUrl).toContain(LOOPBACK_SECRETS.r2PrivateBucket);

      const downloadedBody = Buffer.from(await (await fetch(signedGetUrl)).arrayBuffer());
      expect(downloadedBody.equals(payloadBytes)).toBe(true);

      const [afterDownload] = await runFixtureOp<{ download_count: number }>('getVaultFileState', {
        fileId: vaultFile.id,
      });
      expect(afterDownload.download_count).toBe(1);

      const auditRows = await runFixtureOp<{ action: string }>('getDownloadAuditRows', {
        fileId: vaultFile.id,
      });
      expect(auditRows.length).toBe(1);

      // 6. Cross-tenant client download is blocked with 403 Forbidden
      const crossTenantRes = await otherPage.request.get(`/api/files/${vaultFile.id}/download`, {
        maxRedirects: 0,
      });
      expect(crossTenantRes.status()).toBe(403);

      // 7. Expired retention_until returns 410 Gone immediately, and r2-retention cron purges & archives it
      await runFixtureOp('expireVaultFileRetention', {
        fileId: vaultFile.id,
      });

      const expiredRes = await clientPage.request.get(`/api/files/${vaultFile.id}/download`, {
        maxRedirects: 0,
      });
      expect(expiredRes.status()).toBe(410);

      const cronRes = await clientPage.request.post('/api/cron/r2-retention', {
        headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
      });
      expect(cronRes.status()).toBe(200);
      const cronBody = (await cronRes.json()) as { ok: boolean; deletedVaultFiles: number };
      expect(cronBody.ok).toBe(true);
      expect(cronBody.deletedVaultFiles).toBeGreaterThanOrEqual(1);

      const [archivedRow] = await runFixtureOp<{ archived_at: string | null }>('getVaultFileState', {
        fileId: vaultFile.id,
      });
      expect(archivedRow.archived_at).not.toBeNull();

      const r2ObjectsResp = (await (await fetch(`${R2_CONTROL_URL}/__test/objects`)).json()) as {
        objects: Array<{ key: string }>;
      };
      expect(r2ObjectsResp.objects.some((o) => o.key === vaultFile.r2_key)).toBe(false);
    } finally {
      await clientCtx.close();
      await otherCtx.close();
    }
  });

  test('[OUTBOX-RETRY] retries transient 503 Resend failures with backoff and delivers once with Idempotency-Key', async ({
    browser,
    request,
  }) => {
    await fetch(`${RESEND_CONTROL_URL}/__test/deliveries`, { method: 'DELETE' });
    await runFixtureOp('clearPendingEmailOutbox');

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    try {
      // Queue a real transactional proposal email from the Admin UI
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/proposals');
      await adminPage.locator('input[name="recipient_name"]').fill('Elena Vance');
      await adminPage.locator('input[name="recipient_email"]').fill(SEEDED_USERS.client.email);
      await adminPage.locator('input[name="title"]').fill('Cloud Security Hardening Retainer');
      await adminPage
        .locator('textarea[name="executive_summary"]')
        .fill('Comprehensive cloud posture hardening and IAM least-privilege review.');
      await adminPage.locator('input[name="total_usd"]').fill('1450');
      await adminPage.getByRole('button', { name: /Send Proposal/i }).click();
      await expect(adminPage.getByText('Cloud Security Hardening Retainer')).toBeVisible();

      const [queuedRow] = await runFixtureOp<{ id: string; status: string; attempts: number }>(
        'getLatestEmailOutboxForRecipient',
        { toEmail: SEEDED_USERS.client.email }
      );
      expect(queuedRow).toBeTruthy();
      expect(queuedRow.status).toBe('pending');

      // 1. Inject 1 transient 503 upstream failure on Resend
      await fetch(`${RESEND_CONTROL_URL}/__test/fail-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1 }),
      });

      const firstDrain = await request.post('/api/cron/email-outbox', {
        headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
      });
      expect(firstDrain.status()).toBe(200);
      const firstBody = (await firstDrain.json()) as {
        accepted: number;
        deferred: number;
        failed: number;
      };
      expect(firstBody.accepted).toBe(0);
      expect(firstBody.deferred).toBe(1);

      const [afterFail] = await runFixtureOp<{
        status: string;
        attempts: number;
        last_error: string | null;
      }>('getEmailOutboxById', {
        id: queuedRow.id,
      });
      expect(afterFail.status).toBe('pending');
      expect(afterFail.attempts).toBe(1);
      expect(afterFail.last_error).toContain('503');

      // 2. Wait past the 50ms backoff window, then next cron run succeeds and records sent status + Resend Idempotency-Key
      await new Promise((r) => setTimeout(r, 120));
      const secondDrain = await request.post('/api/cron/email-outbox', {
        headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
      });
      expect(secondDrain.status()).toBe(200);
      const secondBody = (await secondDrain.json()) as { accepted: number; deferred: number };
      expect(secondBody.accepted).toBe(1);
      expect(secondBody.deferred).toBe(0);

      // 3. Subsequent cron trigger is a no-op (zero duplicate deliveries)
      const thirdDrain = await request.post('/api/cron/email-outbox', {
        headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
      });
      expect(thirdDrain.status()).toBe(200);
      const thirdBody = (await thirdDrain.json()) as { accepted: number };
      expect(thirdBody.accepted).toBe(0);

      const deliveriesResp = (await (
        await fetch(`${RESEND_CONTROL_URL}/__test/deliveries`)
      ).json()) as {
        deliveries: Array<{ idempotencyKey: string; to: string[]; subject: string }>;
      };
      expect(deliveriesResp.deliveries).toHaveLength(1);
      expect(deliveriesResp.deliveries[0].idempotencyKey).toBe(`outbox-${queuedRow.id}`);
    } finally {
      await adminCtx.close();
    }
  });
});
