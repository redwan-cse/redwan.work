import { expect, test, type Page } from '@playwright/test';
import { LOOPBACK_SECRETS, SEEDED_USERS } from '../harness/loopback-services.mjs';

const SUPABASE_CONTROL_URL = process.env.LOOPBACK_SUPABASE_URL || 'http://127.0.0.1:24391';

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

test.describe('Phase 4 Extended E2E: Registration, Invite Activation, Support Tickets, Manual Billing/Credit Notes & Content Studio', () => {
  test('[AUTH-RECOVERY] enforces signup email confirmation gate and completes admin portal invite activation', async ({
    browser,
  }) => {
    const suffix = Date.now();
    const selfRegEmail = `self-reg-${suffix}@disposable.test`;
    const selfRegPass = `SelfReg!${suffix}Aa`;

    const regCtx = await browser.newContext();
    const regPage = await regCtx.newPage();
    try {
      await regPage.goto('/register');
      await regPage.locator('input[name="full_name"]').fill('Kamil Hossain');
      await regPage.locator('input[name="email"]').fill(selfRegEmail);
      await regPage.locator('input[name="company_name"]').fill('Kamil Labs Ltd');
      await regPage.locator('input[name="password"]').fill(selfRegPass);
      await regPage.locator('input[name="confirm"]').fill(selfRegPass);
      await regPage.getByRole('button', { name: /Create Client Account/i }).click();
      await expect(regPage.getByText(/verify your email address/i)).toBeVisible();

      // Unconfirmed user cannot sign in before confirming email (generic anti-enumeration message)
      await regPage.goto('/login');
      await regPage.locator('input[name="email"]').first().fill(selfRegEmail);
      await regPage.locator('input[name="password"]').fill(selfRegPass);
      await regPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(regPage.getByText('Invalid email or password.')).toBeVisible();

      // Retrieve signup confirmation token from loopback and confirm via /auth/callback
      const [signupToken] = await runFixtureOp<{ tokenHash: string }>(
        'getLatestSignupTokenForEmail',
        { email: selfRegEmail }
      );
      expect(signupToken?.tokenHash).toBeTruthy();

      await regPage.goto(
        `/auth/callback?token_hash=${encodeURIComponent(signupToken.tokenHash)}&type=signup&next=%2Fportal`
      );
      await regPage.waitForURL('**/portal**');
      await expect(regPage.getByText(/Kamil Hossain/i).first()).toBeVisible();
    } finally {
      await regCtx.close();
    }

    // Admin invites a client via /admin/clients -> /auth/callback?type=invite -> /invite/accept -> /portal
    const invitedEmail = `invited-${suffix}@disposable.test`;
    const invitedPass = `Invited!${suffix}Bb`;
    const adminCtx = await browser.newContext();
    const invitedCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const invitedPage = await invitedCtx.newPage();

    try {
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/clients');
      const inviteForm = adminPage
        .locator('form')
        .filter({ has: adminPage.locator('input[name="company"]') });
      await inviteForm.locator('input[name="email"]').fill(invitedEmail);
      await inviteForm.locator('input[name="full_name"]').fill('Tariq Hasan');
      await inviteForm.locator('input[name="company"]').fill('FinGrid BD');
      await inviteForm.locator('button[type="submit"]').click();
      await expect(adminPage.getByText(invitedEmail).first()).toBeVisible();

      const [inviteToken] = await runFixtureOp<{ tokenHash: string }>(
        'getLatestInviteTokenForEmail',
        { email: invitedEmail }
      );
      expect(inviteToken?.tokenHash).toBeTruthy();

      await invitedPage.goto(
        `/auth/callback?token_hash=${encodeURIComponent(inviteToken.tokenHash)}&type=invite&email=${encodeURIComponent(invitedEmail)}`
      );
      await invitedPage.waitForURL('**/invite/accept**');
      await invitedPage.locator('input[name="password"]').fill(invitedPass);
      await invitedPage.locator('input[name="confirm"]').fill(invitedPass);
      await invitedPage.getByRole('button', { name: /Activate/i }).click();
      await invitedPage.waitForURL('**/portal**');
    } finally {
      await adminCtx.close();
      await invitedCtx.close();
    }
  });

  test('[R1-ORDER-DELIVER-PAY] supports client billing address -> A4 invoice display, ticket threads, manual payment, and credit note (CRN-)', async ({
    browser,
  }) => {
    const clientCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    const adminPage = await adminCtx.newPage();

    try {
      // 1. Client updates profile company + billing address + tax ID
      await signInClient(clientPage, SEEDED_USERS.client.email, SEEDED_USERS.client.password);
      await clientPage.goto('/portal/profile');
      await clientPage.locator('input[name="company_name"]').fill('Northstar Cyber Holdings');
      await clientPage.locator('input[name="tax_id"]').fill('VAT-BD-99012');
      await clientPage.locator('input[name="billing_line1"]').fill('Suite 42, Kemal Ataturk Ave');
      await clientPage.locator('input[name="billing_city"]').fill('Dhaka');
      await clientPage.locator('input[name="billing_country"]').fill('Bangladesh');
      await clientPage.getByRole('button', { name: 'Save Profile Settings' }).click();
      await expect(clientPage.locator('input[name="billing_line1"]')).toHaveValue(
        'Suite 42, Kemal Ataturk Ave'
      );

      // 2. Client opens a Support Ticket and posts a follow-up reply; Admin replies cleanly
      await clientPage.goto('/portal/tickets');
      const ticketForm = clientPage
        .locator('form')
        .filter({ has: clientPage.locator('input[name="subject"]') });
      await ticketForm.locator('input[name="subject"]').fill('Need custom SLA addendum PDF');
      await ticketForm
        .locator('textarea[name="body"]')
        .fill('Please confirm quarterly escalation response windows in writing.');
      await ticketForm.locator('button[type="submit"]').click();
      await clientPage.waitForURL(/\/portal\/tickets\/[0-9a-f-]{36}$/);
      await expect(clientPage.getByText('Need custom SLA addendum PDF').first()).toBeVisible();
      const ticketId = clientPage.url().split('/').pop()!;
      await clientPage
        .locator('textarea[name="body"]')
        .fill('Adding security operations distribution email to thread.');
      await clientPage.getByRole('button', { name: 'Post Reply' }).click();
      await expect(
        clientPage.getByText('Adding security operations distribution email to thread.')
      ).toBeVisible();

      // 3. Admin replies on /admin/tickets/[id]
      await signInAdminWithAal2(adminPage);
      await adminPage.goto(`/admin/tickets/${ticketId}`);
      await expect(adminPage.getByText('Need custom SLA addendum PDF')).toBeVisible();
      await adminPage
        .locator('textarea[name="body"]')
        .fill('Confirmed: P1 security escalation SLA is 2 hours 24/7.');
      await adminPage.getByRole('button', { name: 'Send Reply' }).click();
      await expect(
        adminPage.getByText('Confirmed: P1 security escalation SLA is 2 hours 24/7.')
      ).toBeVisible();

      // 4. Client creates an order so a deposit invoice exists; inspect A4 invoice shows updated billing address
      await clientPage.goto('/portal/orders/new');
      await clientPage.locator('select[name="service_slug"]').selectOption('vapt-penetration-testing');
      await clientPage.locator('select[name="tier"]').selectOption('standard');
      await clientPage.locator('input[name="title"]').fill('Phase4 Billing Address & Credit Note Order');
      await clientPage
        .locator('textarea[name="target_scope_notes"]')
        .fill('https://portal-billing.local');
      await clientPage.getByRole('button', { name: /Launch Contract/i }).click();
      await clientPage.waitForURL(/\/portal\/orders\/[0-9a-f-]{36}$/);

      await clientPage.goto('/portal/invoices');
      await clientPage.getByRole('link', { name: /Pay \/ Submit Proof/i }).first().click();
      await clientPage.waitForURL(/\/portal\/invoices\/[0-9a-f-]{36}$/);
      const invoiceId = clientPage.url().split('/').pop()!;

      await expect(clientPage.getByText('Northstar Cyber Holdings')).toBeVisible();
      await expect(clientPage.getByText(/Suite 42, Kemal Ataturk Ave/)).toBeVisible();
      await expect(clientPage.getByText('VAT-BD-99012')).toBeVisible();
      await clientPage.emulateMedia({ media: 'print' });
      await expect(clientPage.getByRole('button', { name: /Print/i })).toBeHidden();
      await clientPage.emulateMedia({ media: 'screen' });

      // 5. Admin records partial manual payment ($250) + issues credit note (CRN-XXXX) for remainder ($350)
      await adminPage.goto(`/admin/invoices/${invoiceId}`);
      const manualForm = adminPage
        .locator('form')
        .filter({ has: adminPage.getByRole('button', { name: 'Record Verified Payment' }) });
      await manualForm.locator('input[name="amount_major"]').fill('250.00');
      await manualForm.locator('input[name="reference"]').fill(`MAN-P4-${Date.now()}`);
      await manualForm.getByRole('button', { name: 'Record Verified Payment' }).click();
      await expect(adminPage.getByText('partially_paid').first()).toBeVisible();

      const cnForm = adminPage
        .locator('form')
        .filter({ has: adminPage.getByRole('button', { name: 'Apply Credit Note' }) });
      await cnForm.locator('input[name="amount_major"]').fill('350.00');
      await cnForm.locator('input[name="reason"]').fill('Retainer loyalty offset');
      await cnForm.getByRole('button', { name: 'Apply Credit Note' }).click();
      await expect(adminPage.getByText(/CRN-/)).toBeVisible();
      await expect(adminPage.getByText('Retainer loyalty offset')).toBeVisible();
    } finally {
      await clientCtx.close();
      await adminCtx.close();
    }
  });

  test('[R1-ORDER-DELIVER-PAY] preserves optional fields on Admin Content Studio Sheet drawer edits', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    try {
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/content');
      const vaptRow = adminPage.locator('tr', { hasText: 'vapt-penetration-testing' }).first();
      await vaptRow.getByRole('button', { name: 'Edit' }).click();
      const drawer = adminPage.getByRole('dialog');
      await expect(drawer).toBeVisible();

      const standardTierForm = drawer.locator(
        'form:has(input[name="tier_name"][value="Standard"])'
      );
      await standardTierForm.locator('input[name="deposit_percent"]').fill('40');
      await standardTierForm.getByRole('button', { name: 'Update Tier' }).click();
      await expect(drawer.getByText(/Standard tier updated/i)).toBeVisible();

      await adminPage.goto('/admin/content?tab=portfolio');
      const studyRow = adminPage.locator('tr').nth(1);
      await studyRow.getByRole('button', { name: 'Edit' }).click();
      const portfolioDrawer = adminPage.getByRole('dialog');
      await expect(portfolioDrawer).toBeVisible();
      await portfolioDrawer
        .locator('input[name="external_url"]')
        .fill('https://github.com/redwan-cse');
      await portfolioDrawer.getByRole('button', { name: 'Save Case Study' }).click();
      await expect(portfolioDrawer.getByText('Portfolio case study saved.')).toBeVisible();

      await adminPage.reload();
      await adminPage.locator('tr').nth(1).getByRole('button', { name: 'Edit' }).click();
      await expect(
        adminPage.getByRole('dialog').locator('input[name="external_url"]')
      ).toHaveValue('https://github.com/redwan-cse');
    } finally {
      await adminCtx.close();
    }
  });

  test('[R1-ORDER-DELIVER-PAY] keeps Content Studio hub header and tabs when opening Public R2 Assets and Blogs Sync', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    try {
      await signInAdminWithAal2(adminPage);
      await adminPage.goto('/admin/content');
      const hubHeading = adminPage.getByRole('heading', {
        level: 1,
        name: /Services, Portfolio, Resume & Public Assets/i,
      });
      const hubTabs = adminPage.getByRole('navigation', {
        name: /Services, Portfolio, Resume & Public Assets views/i,
      });

      await hubTabs.getByRole('link', { name: 'Public R2 Assets' }).click();
      await adminPage.waitForURL('**/admin/content?tab=assets');
      await expect(hubHeading).toBeVisible();
      await expect(hubTabs.getByRole('link', { name: 'Blogs Sync' })).toBeVisible();
      await expect(adminPage.getByText('Upload Public Asset')).toBeVisible();
      await expect(adminPage.getByText(/Stored Public Objects/)).toBeVisible();
      await expect(adminPage.getByRole('link', { name: /Back to Content Studio/i })).toHaveCount(0);

      await hubTabs.getByRole('link', { name: 'Blogs Sync' }).click();
      await adminPage.waitForURL('**/admin/content?tab=blogs');
      await expect(hubHeading).toBeVisible();
      await expect(hubTabs.getByRole('link', { name: 'Public R2 Assets' })).toBeVisible();
      await expect(adminPage.getByText(/Synced Posts Preview/)).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Purge Cache/i })).toBeVisible();

      // Legacy standalone URLs now redirect into the hub instead of a separate environment.
      await adminPage.goto('/admin/assets');
      await adminPage.waitForURL('**/admin/content?tab=assets');
      await adminPage.goto('/admin/blogs');
      await adminPage.waitForURL('**/admin/content?tab=blogs');
    } finally {
      await adminCtx.close();
    }
  });

  test('[R1-ORDER-DELIVER-PAY] supports admin global search, structured consent policy publish -> /contact, and /invite/accept?session=1', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    try {
      await signInAdminWithAal2(adminPage);

      // 1. Admin command search exercises inquiries + proposals + orders under strict schema checking
      const searchRes = await adminPage.request.get('/api/admin/search?q=ORD-');
      expect(searchRes.status()).toBe(200);
      const searchJson = (await searchRes.json()) as {
        results: Array<{ group: string; href: string }>;
      };
      expect(Array.isArray(searchJson.results)).toBe(true);

      const inqSearchRes = await adminPage.request.get('/api/admin/search?q=FinGrid');
      expect(inqSearchRes.status()).toBe(200);

      // 2. Publish structured consent policy from /admin/settings and verify /contact renders it (never 503)
      await adminPage.goto('/admin/settings');
      const policyForm = adminPage
        .locator('form')
        .filter({ has: adminPage.locator('input[name="version"]') });
      await policyForm.locator('input[name="version"]').fill('v2-pr15');
      await policyForm
        .locator('input[name="checkbox"]')
        .fill('I accept PR15 structured consent & retention policy v2.');
      await policyForm
        .locator('textarea[name="privacy_notice"]')
        .fill('Inquiry details are handled solely under NDA evaluation.');
      await policyForm
        .locator('textarea[name="attachment_notice"]')
        .fill('Private attachments expire automatically per retention schedule.');
      await policyForm
        .locator('textarea[name="policy_text"]')
        .fill('Full privacy and confidentiality policy terms for engineering engagements.');
      await policyForm.locator('button[type="submit"]').click();
      await expect(policyForm.getByRole('status')).toBeVisible();

      const contactPolicyRes = await adminPage.request.get('/api/contact');
      expect(contactPolicyRes.status()).toBe(200);
      const contactPolicyJson = (await contactPolicyRes.json()) as {
        policy: { version: string; checkbox: string; attachmentNotice: string };
      };
      expect(contactPolicyJson.policy.version).toBe('v2-pr15');
      expect(contactPolicyJson.policy.checkbox).toBe(
        'I accept PR15 structured consent & retention policy v2.'
      );

      const contactResp = await adminPage.goto('/contact');
      expect(contactResp?.status()).toBe(200);
      await expect(
        adminPage.getByText('Private attachments expire automatically per retention schedule.')
      ).toBeVisible();
    } finally {
      await adminCtx.close();
    }

    // 3. PKCE session=1 mode on /invite/accept rejects unauthenticated activation submissions
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    try {
      await anonPage.goto('/invite/accept?session=1');
      await anonPage.locator('input[name="password"]').fill('StrongInviteTest!1234');
      await anonPage.locator('input[name="confirm"]').fill('StrongInviteTest!1234');
      await anonPage.getByRole('button', { name: /Activate account/i }).click();
      await expect(anonPage.getByText(/invalid or has expired/i)).toBeVisible();
    } finally {
      await anonCtx.close();
    }
  });
});
