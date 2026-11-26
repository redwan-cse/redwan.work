import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  LOOPBACK_SECRETS,
  SEEDED_USERS,
} from '../harness/loopback-services.mjs';

const SUPABASE_CONTROL_URL = process.env.LOOPBACK_SUPABASE_URL || 'http://127.0.0.1:24391';
const R2_CONTROL_URL = process.env.LOOPBACK_R2_URL || 'http://127.0.0.1:24392';
const RESEND_CONTROL_URL = process.env.LOOPBACK_RESEND_URL || 'http://127.0.0.1:24393';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

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

async function expectNotFoundPage(page: Page, url: string, forbiddenText?: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
  if (forbiddenText) {
    await expect(page.getByText(forbiddenText)).toHaveCount(0);
  }
}

test.use({ actionTimeout: 15000 });

test.describe.serial('RBAC & Full-Module Functional Verification (Audit v7)', () => {
  let adminState: StorageState;
  let clientState: StorageState;
  let otherClientState: StorageState;

  test.beforeAll(async ({ browser }) => {
    // Isolate rate-limit bucket from earlier E2E spec files sharing localhost 127.0.0.1
    await runFixtureOp('clearRateLimits');

    const adminCtx = await browser.newContext();
    const clientCtx = await browser.newContext();
    const otherCtx = await browser.newContext();
    try {
      const adminPage = await adminCtx.newPage();
      await signInAdminWithAal2(adminPage);
      adminState = await adminCtx.storageState();

      const clientPage = await clientCtx.newPage();
      await signInClient(clientPage, SEEDED_USERS.client.email, SEEDED_USERS.client.password);
      clientState = await clientCtx.storageState();

      const otherPage = await otherCtx.newPage();
      await signInClient(
        otherPage,
        SEEDED_USERS.otherClient.email,
        SEEDED_USERS.otherClient.password
      );
      otherClientState = await otherCtx.storageState();
    } finally {
      await adminCtx.close();
      await clientCtx.close();
      await otherCtx.close();
    }
  });

  test('[RBAC-V7-RECOVERY] proves R2 Vault Recovery end-to-end: quota, +90d extension, Pin forever, binary ZIP export, RBAC 403, and orphan purge', async ({
    browser,
    request,
  }) => {
    const clientCtx = await browser.newContext({ storageState: clientState });
    const adminCtx = await browser.newContext({ storageState: adminState });
    const clientPage = await clientCtx.newPage();
    const adminPage = await adminCtx.newPage();
    const orphanKey = `private/${SEEDED_USERS.client.id}/deliverable/orphan-v7-e2e.pdf`;

    try {
      // 1. Client launches an order so we have a real order + owner for vault recovery
      await clientPage.goto('/portal/orders/new');
      await clientPage.locator('select[name="service_slug"]').selectOption('api-backend-engineering');
      await clientPage.locator('select[name="tier"]').selectOption('standard');
      await clientPage.locator('input[name="title"]').fill('R2 Vault Recovery E2E Order');
      await clientPage.getByRole('button', { name: /Launch Contract/i }).click();
      await clientPage.waitForURL(/\/portal\/orders\/[0-9a-f-]{36}$/);
      const orderId = clientPage.url().split('/').pop()!;

      // 2. Admin settles the kickoff deposit invoice so delivery transitions are unlocked
      await adminPage.goto(`/admin/orders/${orderId}`);
      await adminPage.locator('a[href^="/admin/invoices/"]').first().click();
      await adminPage.waitForURL(/\/admin\/invoices\/[0-9a-f-]{36}$/);
      await adminPage.locator('#manual-pay-ref').fill('MANUAL-DEP-V7');
      await adminPage.getByRole('button', { name: 'Record Verified Payment' }).click();
      await expect(adminPage.getByText('MANUAL-DEP-V7')).toBeVisible();

      // 3. Admin uploads a real PDF deliverable to R2 and publishes it
      await adminPage.goto(`/admin/orders/${orderId}`, { waitUntil: 'networkidle' });
      await expect(adminPage.getByText(/pending requirements/i)).toBeVisible();
      const pdfBytes = Buffer.from('%PDF-1.4\nR2 Vault Recovery ZIP Verification Payload\n%%EOF');
      await adminPage.locator('input[type="file"]').setInputFiles({
        name: 'recovery-audit-report.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBytes,
      });
      await expect(adminPage.getByText(/Uploaded: recovery-audit-report\.pdf/)).toBeVisible();
      await adminPage.locator('#dlv-title').fill('Recovery Vault Report v1');
      await adminPage.getByRole('button', { name: 'Publish Deliverable to Client Portal' }).click();
      await expect(adminPage.getByText('Recovery Vault Report v1').first()).toBeVisible();

      // 3. Inject an untracked orphan object directly into private R2 bucket
      const seedOrphanRes = await fetch(`${R2_CONTROL_URL}/__test/put-stale-object`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: LOOPBACK_SECRETS.r2PrivateBucket,
          key: orphanKey,
          content: '%PDF-1.4\nUntracked orphan object\n%%EOF',
          lastModified: new Date(Date.now() - 3600_000).toISOString(),
        }),
      });
      expect(seedOrphanRes.ok).toBe(true);

      // 4. Inspect /admin/recovery: quota bar, order ZIP list, vault file +90d -> Pin forever, orphan inventory
      await adminPage.goto('/admin/recovery');
      await expect(
        adminPage.getByRole('heading', { level: 1, name: /Vault Quotas, Retention Controls/i })
      ).toBeVisible();
      await expect(adminPage.getByText('R2 Vault Recovery E2E Order')).toBeVisible();
      await expect(
        adminPage.locator(`a[href="/api/admin/recovery/export?order_id=${orderId}"]`)
      ).toBeVisible();

      const fileRow = adminPage.locator('tr', { hasText: 'recovery-audit-report.pdf' }).first();
      await expect(fileRow).toBeVisible();

      // Extend retention +90d
      await fileRow.getByRole('button', { name: '+90d' }).click();
      await expect(fileRow.getByText('Retention extended +90 days.')).toBeVisible();

      // Pin forever -> PINNED badge appears and +90d / Pin controls hide (RBAC-H4)
      await fileRow.getByRole('button', { name: 'Pin' }).click();
      await expect(fileRow.getByText('PINNED')).toBeVisible();
      await expect(fileRow.getByRole('button', { name: '+90d' })).toHaveCount(0);

      // 5. Binary ZIP export verification (Admin 200 PK\x03\x04; Client & Anonymous 403)
      const adminZipRes = await adminPage.request.get(
        `/api/admin/recovery/export?order_id=${orderId}`
      );
      expect(adminZipRes.status()).toBe(200);
      expect(adminZipRes.headers()['content-type']).toContain('application/zip');
      const zipBody = Buffer.from(await adminZipRes.body());
      expect(zipBody.byteLength).toBeGreaterThan(60);
      expect(zipBody[0]).toBe(0x50);
      expect(zipBody[1]).toBe(0x4b);
      expect(zipBody[2]).toBe(0x03);
      expect(zipBody[3]).toBe(0x04);
      expect(zipBody.toString('latin1')).toContain('deliverable/recovery-audit-report.pdf');

      const clientZipRes = await clientPage.request.get(
        `/api/admin/recovery/export?order_id=${orderId}`
      );
      expect(clientZipRes.status()).toBe(403);

      const anonZipRes = await request.get(`/api/admin/recovery/export?order_id=${orderId}`);
      expect(anonZipRes.status()).toBe(403);

      // 6. Orphan R2 inventory detection & confirmed purge (RBAC-H5)
      await expect(adminPage.getByText(orphanKey)).toBeVisible();
      const orphanRow = adminPage
        .locator('div', { hasText: orphanKey })
        .filter({
          has: adminPage.getByRole('button', { name: 'Purge Orphan' }),
        })
        .last();
      await orphanRow.getByRole('button', { name: 'Purge Orphan' }).click();
      await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(adminPage.getByText(orphanKey)).toHaveCount(0);

      const r2After = (await (await fetch(`${R2_CONTROL_URL}/__test/objects`)).json()) as {
        objects: Array<{ key: string }>;
      };
      expect(r2After.objects.some((o) => o.key === orphanKey)).toBe(false);
    } finally {
      await clientCtx.close();
      await adminCtx.close();
    }
  });

  test('[RBAC-V7-OUTBOX] keeps Outbox Queue (0) free of sent Delivery History rows and proves failed -> Retry All Failed -> sent with bumped Idempotency-Key', async ({
    browser,
    request,
  }) => {
    await fetch(`${RESEND_CONTROL_URL}/__test/deliveries`, { method: 'DELETE' });
    await runFixtureOp('clearPendingEmailOutbox');

    const adminCtx = await browser.newContext({ storageState: adminState });
    const adminPage = await adminCtx.newPage();

    try {
      // 1. Send Proposal #1 and drain it cleanly to 'sent'
      await adminPage.goto('/admin/proposals');
      await adminPage.locator('input[name="recipient_name"]').fill('Elena Vance');
      await adminPage.locator('input[name="recipient_email"]').fill(SEEDED_USERS.client.email);
      await adminPage.locator('input[name="title"]').fill('Outbox Separation Verification');
      await adminPage
        .locator('textarea[name="executive_summary"]')
        .fill('Verifies delivered outbox rows remain strictly in Delivery History.');
      await adminPage.locator('input[name="total_usd"]').fill('950');
      await adminPage.getByRole('button', { name: 'Send Proposal' }).click();
      await expect(adminPage.getByText('Outbox Separation Verification')).toBeVisible();

      const drainOk = await request.post('/api/cron/email-outbox', {
        headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
      });
      expect(drainOk.status()).toBe(200);
      const drainOkBody = (await drainOk.json()) as { accepted: number };
      expect(drainOkBody.accepted).toBeGreaterThanOrEqual(1);

      // 2. Visit /admin/emails/outbox -> Outbox Queue (0) MUST show 0 rows, never sent rows (RBAC-H3)
      await adminPage.goto('/admin/emails/outbox');
      await expect(adminPage.getByRole('link', { name: 'Outbox Queue (0)' })).toBeVisible();
      await expect(adminPage.getByText('Outbox Queue (0)').nth(1)).toBeVisible();
      await expect(adminPage.locator('tbody tr')).toHaveCount(0);
      await expect(adminPage.getByText('Outbox Separation Verification')).toHaveCount(0);

      // 3. Switch to Delivery History (/admin/emails) -> sent email MUST appear there
      await adminPage.getByRole('link', { name: /Delivery History/i }).click();
      await adminPage.waitForURL('**/admin/emails');
      await expect(adminPage.getByText(/Outbox Separation Verification/)).toBeVisible();

      // 4. Force 5 consecutive Resend 503 failures so Proposal #2 exhausts retries into 'failed'
      await fetch(`${RESEND_CONTROL_URL}/__test/fail-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10 }),
      });

      await adminPage.goto('/admin/proposals');
      await adminPage.locator('input[name="recipient_name"]').fill('Elena Vance');
      await adminPage.locator('input[name="recipient_email"]').fill(SEEDED_USERS.client.email);
      await adminPage.locator('input[name="title"]').fill('Outbox Bulk Retry Proof');
      await adminPage
        .locator('textarea[name="executive_summary"]')
        .fill('Verifies failed outbox rows appear in Outbox Queue and bulk retry bumps _retryNonce.');
      await adminPage.locator('input[name="total_usd"]').fill('1100');
      await adminPage.getByRole('button', { name: 'Send Proposal' }).click();
      await expect(adminPage.getByText('Outbox Bulk Retry Proof')).toBeVisible();

      const [failedCandidate] = await runFixtureOp<{ id: string; status: string }>(
        'getLatestEmailOutboxForRecipient',
        { toEmail: SEEDED_USERS.client.email }
      );
      expect(failedCandidate).toBeTruthy();

      let finalStatus = failedCandidate.status;
      for (let attempt = 0; attempt < 7 && finalStatus !== 'failed'; attempt += 1) {
        const drainFail = await request.post('/api/cron/email-outbox', {
          headers: { Authorization: `Bearer ${LOOPBACK_SECRETS.cronSecret}` },
        });
        expect(drainFail.status()).toBe(200);
        const [rowState] = await runFixtureOp<{ status: string }>('getEmailOutboxById', {
          id: failedCandidate.id,
        });
        finalStatus = rowState.status;
        if (finalStatus !== 'failed') {
          await new Promise((r) => setTimeout(r, Math.min(600, 80 * 2 ** attempt)));
        }
      }
      expect(finalStatus).toBe('failed');

      // 5. Restore Resend availability, reload Outbox Queue -> shows 1 failed item + Retry All Failed (1)
      await fetch(`${RESEND_CONTROL_URL}/__test/fail-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 0 }),
      });

      await adminPage.goto('/admin/emails/outbox');
      await expect(adminPage.getByRole('link', { name: 'Outbox Queue (1)' })).toBeVisible();
      await expect(adminPage.getByText(/Outbox Bulk Retry Proof/)).toBeVisible();
      await adminPage.getByRole('button', { name: 'Retry All Failed (1)' }).click();
      await expect(adminPage.getByRole('link', { name: 'Outbox Queue (0)' })).toBeVisible();
      await expect(adminPage.locator('tbody tr')).toHaveCount(0);

      // 6. Verify Resend received the retried message with bumped -r1 Idempotency-Key (RBAC-M1)
      const deliveriesResp = (await (
        await fetch(`${RESEND_CONTROL_URL}/__test/deliveries`)
      ).json()) as {
        deliveries: Array<{ idempotencyKey: string; subject: string }>;
      };
      const retriedDelivery = deliveriesResp.deliveries.find((d) =>
        d.subject.includes('Outbox Bulk Retry Proof')
      );
      expect(retriedDelivery).toBeTruthy();
      expect(retriedDelivery?.idempotencyKey).toBe(`outbox-${failedCandidate.id}-r1`);
    } finally {
      await fetch(`${RESEND_CONTROL_URL}/__test/fail-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 0 }),
      }).catch(() => undefined);
      await adminCtx.close();
    }
  });

  test('[RBAC-V7-ISOLATION-AND-MODULES] enforces cross-tenant isolation, internal note guards, admin email redaction, and untested modules', async ({
    browser,
    request,
  }) => {
    const clientCtx = await browser.newContext({ storageState: clientState });
    const otherCtx = await browser.newContext({ storageState: otherClientState });
    const adminCtx = await browser.newContext({ storageState: adminState });
    const clientPage = await clientCtx.newPage();
    const otherPage = await otherCtx.newPage();
    const adminPage = await adminCtx.newPage();

    try {
      // 1. Draft Proposal -> Edit -> Send -> Client Accept -> Cross-Tenant Isolation
      await adminPage.goto('/admin/proposals');
      await adminPage.locator('input[name="recipient_name"]').fill('Elena Vance');
      await adminPage.locator('input[name="recipient_email"]').fill(SEEDED_USERS.client.email);
      await adminPage.locator('input[name="title"]').fill('V7 Draft Proposal Before Edit');
      await adminPage
        .locator('textarea[name="executive_summary"]')
        .fill('Draft scope awaiting refinement.');
      await adminPage.locator('input[name="total_usd"]').fill('800');
      await adminPage.getByRole('button', { name: 'Save Draft' }).click();
      await expect(adminPage.getByText('V7 Draft Proposal Before Edit')).toBeVisible();

      const proposalLink = adminPage
        .locator('a[href^="/admin/proposals/"]', { hasText: 'V7 Draft Proposal Before Edit' })
        .first();
      const proposalHref = await proposalLink.getAttribute('href');
      expect(proposalHref).toMatch(/^\/admin\/proposals\/[0-9a-f-]{36}$/);
      const proposalId = proposalHref!.split('/').pop()!;

      // Draft proposal must render 404 Not Found to client before sending
      await expectNotFoundPage(
        clientPage,
        `/portal/proposals/${proposalId}`,
        'V7 Draft Proposal Before Edit'
      );

      // Admin edits draft title and sends it to client
      await adminPage.goto(`/admin/proposals/${proposalId}`);
      await adminPage.locator('#draft-prop-title').fill('V7 Sent Proposal Ready For Acceptance');
      await adminPage.getByRole('button', { name: /Save Draft Changes/i }).click();
      await expect(
        adminPage.getByRole('heading', { level: 1, name: 'V7 Sent Proposal Ready For Acceptance' })
      ).toBeVisible();
      await adminPage.getByRole('button', { name: 'Send Draft to Client' }).click();
      await expect(adminPage.getByText('Proposal sent to client.').first()).toBeVisible();

      // Cross-tenant otherClient gets Not Found on Elena's proposal
      await expectNotFoundPage(
        otherPage,
        `/portal/proposals/${proposalId}`,
        'V7 Sent Proposal Ready For Acceptance'
      );

      // Elena opens and accepts proposal -> converts to order
      await clientPage.goto(`/portal/proposals/${proposalId}`);
      await expect(
        clientPage.getByRole('heading', { level: 1, name: 'V7 Sent Proposal Ready For Acceptance' })
      ).toBeVisible();
      await clientPage.getByRole('button', { name: /Accept Proposal & Start Order/i }).click();
      await clientPage.waitForURL(/\/portal\/orders\/[0-9a-f-]{36}$/);
      const orderId = clientPage.url().split('/').pop()!;

      // Cross-tenant order & chat API isolation
      await expectNotFoundPage(
        otherPage,
        `/portal/orders/${orderId}`,
        'V7 Sent Proposal Ready For Acceptance'
      );
      const otherMsgApi = await otherPage.request.get(`/api/orders/${orderId}/messages`);
      expect(otherMsgApi.status()).toBe(403);
      const anonMsgApi = await request.get(`/api/orders/${orderId}/messages`);
      expect(anonMsgApi.status()).toBe(401);

      // 2. Live Contract Chat: admin public reply + internal note + email redaction (RBAC-H1, H2)
      await adminPage.goto(`/admin/orders/${orderId}?tab=thread`, { waitUntil: 'networkidle' });
      const adminChatLog = adminPage.getByRole('log', { name: 'Live contract messages' });
      const adminChatBox = adminPage.getByLabel('Contract chat message');
      await adminChatBox.fill('Public admin status update for client visibility.');
      await adminPage.getByRole('button', { name: 'Send Message' }).click();
      await expect(
        adminChatLog.getByText('Public admin status update for client visibility.')
      ).toBeVisible();

      // Toggle Private Internal Note -> Attach File button disables (RBAC-H1)
      await adminPage.getByText(/Private Internal Note/i).click();
      await expect(adminPage.getByRole('button', { name: 'Attach File' })).toBeDisabled();
      await adminChatBox.fill('INTERNAL_CHAT_SECRET_V7_DO_NOT_LEAK');
      await adminPage.getByRole('button', { name: 'Send Message' }).click();
      await expect(adminChatLog.getByText('INTERNAL_CHAT_SECRET_V7_DO_NOT_LEAK')).toBeVisible();

      // Verify client GET /api/orders/[id]/messages & /api/contact/active-contracts redact admin email & internal note
      const clientMsgRes = await clientPage.request.get(`/api/orders/${orderId}/messages`);
      expect(clientMsgRes.status()).toBe(200);
      const clientMsgJson = JSON.stringify(await clientMsgRes.json());
      expect(clientMsgJson).toContain('Public admin status update for client visibility.');
      expect(clientMsgJson).not.toContain('INTERNAL_CHAT_SECRET_V7_DO_NOT_LEAK');
      expect(clientMsgJson).not.toContain(SEEDED_USERS.admin.email);

      const activeContractsRes = await clientPage.request.get('/api/contact/active-contracts');
      expect(activeContractsRes.status()).toBe(200);
      const activeContractsBody = (await activeContractsRes.json()) as {
        authenticated: boolean;
        contracts: Array<Record<string, unknown>>;
      };
      expect(activeContractsBody.authenticated).toBe(true);
      expect(activeContractsBody.contracts.length).toBeGreaterThanOrEqual(1);
      expect(activeContractsBody.contracts[0]).not.toHaveProperty('initialMessages');

      // 3. Support Ticket cross-tenant Not Found + Internal Note attachment guard (RBAC-H1)
      await clientPage.goto('/portal/tickets');
      await clientPage.locator('#ticket-subject').fill('V7 RBAC Ticket Audit Subject');
      await clientPage
        .locator('#ticket-body')
        .fill('Verifying internal admin note isolation and attachment guard.');
      await clientPage.getByRole('button', { name: 'Submit Support Ticket' }).click();
      await clientPage.waitForURL(/\/portal\/tickets\/[0-9a-f-]{36}$/);
      const ticketId = clientPage.url().split('/').pop()!;

      await expectNotFoundPage(
        otherPage,
        `/portal/tickets/${ticketId}`,
        'V7 RBAC Ticket Audit Subject'
      );

      await adminPage.goto(`/admin/tickets/${ticketId}`, { waitUntil: 'networkidle' });
      await adminPage.getByText('Internal Admin Note (Hidden from Client)').click();
      await expect(
        adminPage.getByText(/Attachments are disabled on internal admin notes/i)
      ).toBeVisible();
      await adminPage
        .getByLabel('Ticket reply or internal note')
        .fill('INTERNAL_TICKET_SECRET_V7_HIDDEN');
      await adminPage.getByRole('button', { name: 'Post Internal Note' }).click();
      await expect(adminPage.getByText('Internal note posted.').first()).toBeVisible();
      await expect(adminPage.getByText('INTERNAL_TICKET_SECRET_V7_HIDDEN')).toBeVisible();

      await clientPage.goto(`/portal/tickets/${ticketId}`);
      await expect(clientPage.getByText('V7 RBAC Ticket Audit Subject')).toBeVisible();
      await expect(clientPage.getByText('INTERNAL_TICKET_SECRET_V7_HIDDEN')).toHaveCount(0);

      // 4. Untested modules & regressions: /portal/retainers CTA, /admin/retainers, /admin/support, /admin/audit, Typed Notes, /services pillar reset
      await clientPage.goto('/portal/retainers');
      const retainerCta = clientPage.getByRole('link', { name: /Start Monthly Retainer/i });
      await expect(retainerCta).toHaveAttribute(
        'href',
        '/portal/orders/new?service=monthly-security-and-engineering-retainer&tier=enterprise'
      );

      for (const route of ['/admin/retainers', '/admin/support', '/admin/audit']) {
        const res = await adminPage.goto(route);
        expect(res?.status(), `${route} should render 200`).toBe(200);
      }

      await adminPage.goto(`/admin/clients/${SEEDED_USERS.client.id}?tab=notes`);
      await adminPage.locator('textarea[name="body"]').fill('V7 E2E typed relationship note.');
      await adminPage.getByRole('button', { name: 'Add Typed Note' }).click();
      await expect(adminPage.getByText('Client note saved.').first()).toBeVisible();
      await expect(adminPage.getByText('V7 E2E typed relationship note.')).toBeVisible();

      // Public /services?pillar=cybersecurity -> navigate to /services resets filter (RBAC-M10)
      await clientPage.goto('/services?pillar=cybersecurity');
      await expect(
        clientPage.getByRole('button', { name: /Cybersecurity/i }).first()
      ).toHaveAttribute('aria-pressed', 'true');
      await clientPage.goto('/services');
      await expect(
        clientPage.getByRole('button', { name: /All 5 Pillars/i }).first()
      ).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await clientCtx.close();
      await otherCtx.close();
      await adminCtx.close();
    }
  });

  test('[RBAC-V7-ADMIN-LIFECYCLE] blocks admin profile in /admin/clients/[id], proves live BIGINT deactivate/reactivate, and invite revoke + resend', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: adminState });
    const otherCtx = await browser.newContext({ storageState: otherClientState });
    const adminPage = await adminCtx.newPage();
    const otherPage = await otherCtx.newPage();

    try {
      // 1. Admin profile UUID is never accessible in /admin/clients/[id] (RBAC-C2)
      await expectNotFoundPage(
        adminPage,
        `/admin/clients/${SEEDED_USERS.admin.id}`,
        'Deactivate'
      );

      // 2. Deactivate otherClient via real Admin UI button -> live BIGINT tokens_valid_after succeeds (RBAC-C1)
      await adminPage.goto(`/admin/clients/${SEEDED_USERS.otherClient.id}`);
      await expect(adminPage.getByText(/CLIENT 360°.*ACTIVE/)).toBeVisible();
      await adminPage.getByRole('button', { name: 'Deactivate', exact: true }).click();
      await adminPage.getByRole('button', { name: 'Deactivate Account', exact: true }).click();
      await expect(adminPage.getByText(/CLIENT 360°.*DEACTIVATED/)).toBeVisible();

      // Active client session is immediately bounced on next navigation
      await otherPage.goto('/portal/orders');
      await otherPage.waitForURL('**/login?reason=deactivated');
      await expect(
        otherPage.getByText('Your account has been deactivated. Contact the administrator.')
      ).toBeVisible();

      // Reactivate otherClient via real Admin UI button
      await adminPage.getByRole('button', { name: 'Reactivate', exact: true }).click();
      await adminPage.getByRole('button', { name: 'Reactivate Account', exact: true }).click();
      await expect(adminPage.getByText(/CLIENT 360°.*ACTIVE/)).toBeVisible();

      // Wait 1.1s so newly issued JWT iat (in seconds) strictly exceeds tokens_valid_after cutoff
      await new Promise((r) => setTimeout(r, 1100));
      await signInClient(
        otherPage,
        SEEDED_USERS.otherClient.email,
        SEEDED_USERS.otherClient.password
      );
      await expect(otherPage).toHaveURL(/\/portal/);

      // 3. Invite -> Revoke (real BIGINT tokens_valid_after) -> Re-invite (RBAC-H9)
      const disposableEmail = `invite-v7-${Date.now()}@test.local`;
      await adminPage.goto('/admin/clients');
      await adminPage.locator('#invite-client-email').fill(disposableEmail);
      await adminPage.locator('#invite-client-name').fill('V7 Invite Audit Client');
      await adminPage.locator('#invite-client-company').fill('Disposable Security Corp');
      await adminPage.getByRole('button', { name: 'Send Portal Invitation' }).click();

      const inviteRow = adminPage
        .locator('tr', { hasText: disposableEmail })
        .filter({ has: adminPage.getByRole('button', { name: 'Revoke', exact: true }) })
        .first();
      await expect(inviteRow).toBeVisible();
      await expect(inviteRow.getByText('pending')).toBeVisible();

      // Revoke pending invite
      await inviteRow.getByRole('button', { name: 'Revoke', exact: true }).click();
      await adminPage.getByRole('button', { name: 'Revoke Invite', exact: true }).click();
      await expect(
        adminPage.locator('tr', { hasText: disposableEmail }).filter({ hasText: 'revoked' }).first()
      ).toBeVisible();

      // Re-invite the same revoked unactivated email -> succeeds cleanly with fresh pending token
      await adminPage.locator('#invite-client-email').fill(disposableEmail);
      await adminPage.locator('#invite-client-name').fill('V7 Invite Audit Client');
      await adminPage.getByRole('button', { name: 'Send Portal Invitation' }).click();
      await expect(
        adminPage
          .locator('tr', { hasText: disposableEmail })
          .filter({ has: adminPage.getByRole('button', { name: 'Revoke', exact: true }) })
          .first()
      ).toBeVisible();

      const inviteTokens = await runFixtureOp<{ tokenHash: string }>('getLatestInviteTokenForEmail', {
        email: disposableEmail,
      });
      expect(inviteTokens.length).toBeGreaterThanOrEqual(1);
      expect(inviteTokens[0].tokenHash).toMatch(/^invite_/);
    } finally {
      await runFixtureOp('setProfileActive', {
        userId: SEEDED_USERS.otherClient.id,
        isActive: true,
      }).catch(() => undefined);
      await adminCtx.close();
      await otherCtx.close();
    }
  });
});
