import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentSession = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockEnqueueTransactionalEmail = vi.fn();
const mockCreateInAppNotification = vi.fn();
const mockNotifyAllAdmins = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
  requireAdminSession: async () => {
    const session = await mockGetCurrentSession();
    if (!session || session.role !== 'admin') {
      throw new Error('Unauthorized: Admin AAL2 session required.');
    }
    return session;
  },
  requireClientSession: async () => {
    const session = await mockGetCurrentSession();
    if (!session || session.role !== 'client') {
      throw new Error('Unauthorized: Client session required.');
    }
    return session;
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock('@/lib/crm/audit', () => ({
  createInAppNotification: (...args: unknown[]) => mockCreateInAppNotification(...args),
  enqueueTransactionalEmail: (...args: unknown[]) => mockEnqueueTransactionalEmail(...args),
  notifyAllAdmins: (...args: unknown[]) => mockNotifyAllAdmins(...args),
  recordAuditLog: (...args: unknown[]) => mockRecordAuditLog(...args),
}));

import { publishConsentPolicyAction } from '@/lib/admin/ops-actions';
import { GET as adminSearchGet } from '@/app/api/admin/search/route';
import {
  addTypedClientNoteAction,
  createMultiLineInvoiceAction,
  createOrderFromAdminAction,
  placePortalPackageOrderAction,
  resolveCancellationRequestAction,
  sendDraftProposalAction,
  submitOrderRequirementsAction,
} from '@/lib/crm/actions';
import { POST as postOrderMessage } from '@/app/api/orders/[id]/messages/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { parsePublicConsentPolicy } from '@/lib/contact/consent-client';
import { archivePolicy } from '@/lib/contact/consent-policy';

describe('PR #15 Adversarial Review Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[P6-CONSENT-PUBLISH] publishConsentPolicyAction stores structured canonical JSON compatible with /contact & archivePolicy', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    const upserts: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('consent_policies');
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
          upsert: async (row: Record<string, unknown>) => {
            upserts.push(row);
            return { error: null };
          },
        };
      }),
    });

    const fd = new FormData();
    fd.set('version', 'v2-2026');
    fd.set('checkbox', 'I explicitly consent to processing my scope inquiry.');
    fd.set('privacy_notice', 'Handled strictly under confidentiality.');
    fd.set('attachment_notice', 'Files purged on retention expiry.');
    fd.set('policy_text', 'Full privacy & data retention policy statement for engineering inquiries.');

    await publishConsentPolicyAction(fd);

    expect(upserts).toHaveLength(1);
    const saved = upserts[0];
    expect(saved.version).toBe('v2-2026');
    expect(saved.is_active).toBe(true);
    const parsedCanonical = JSON.parse(String(saved.canonical)) as unknown;
    const archived = archivePolicy(parsedCanonical);
    expect(saved.hash).toBe(archived.hash);
    expect(parsePublicConsentPolicy(parsedCanonical)).not.toBeNull();
  });

  it('[P6-ADMIN-SEARCH] /api/admin/search queries valid columns and links proposals to /admin/proposals/[id]', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    const selectedByTable: Record<string, string> = {};
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: (cols: string) => {
          selectedByTable[table] = cols;
          const resultMap: Record<string, unknown[]> = {
            orders: [{ id: 'ord-1', code: 'ORD-1', title: 'Audit', status: 'in_progress' }],
            profiles: [],
            invoices: [],
            tickets: [],
            proposals: [{ id: 'prop-99', code: 'PRP-99', title: 'Retainer Proposal', status: 'sent' }],
            inquiries: [
              {
                id: 'inq-1',
                code: 'INQ-7',
                name: 'Tariq',
                email: 'tariq@disposable.test',
                company: 'FinGrid',
                status: 'new',
              },
            ],
          };
          const rows = resultMap[table] ?? [];
          const tail = {
            limit: async () => ({ data: rows, error: null }),
          };
          return {
            or: () => tail,
            ilike: () => tail,
            eq: () => ({ or: () => tail }),
          };
        },
      })),
    });

    const req = new NextRequest('http://127.0.0.1:3000/api/admin/search?q=FinGrid');
    const res = await adminSearchGet(req);
    expect(res.status).toBe(200);
    expect(selectedByTable.inquiries).not.toContain('subject');
    expect(selectedByTable.inquiries).toContain('company');

    const body = (await res.json()) as {
      results: Array<{ group: string; href: string }>;
    };
    const proposalResult = body.results.find((r) => r.group === 'Proposals');
    expect(proposalResult?.href).toBe('/admin/proposals/prop-99');
  });

  it('[P6-CRM-SCHEMA-PARITY] sendDraftProposalAction omits non-existent sent_at, multi-line emits qty+quantity, and cancellation uses declined', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    const proposalUpdates: Array<Record<string, unknown>> = [];
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: { invoice_id: 'inv-1' }, error: null };
      }),
      from: vi.fn((table: string) => {
        if (table === 'proposals') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'prop-1',
                    code: 'PRP-1',
                    title: 'Pentest Scope',
                    client_id: 'cli-1',
                    recipient_name: 'Client User',
                    recipient_email: 'client@disposable.test',
                    total_cents: 150000,
                    currency: 'USD',
                    status: 'draft',
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              proposalUpdates.push(payload);
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
          };
        }
        if (table === 'cancellation_requests') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_id: 'ord-1', requested_by: 'cli-1' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { email: 'client@disposable.test' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }),
    });

    const propFd = new FormData();
    propFd.set('proposal_id', 'prop-1');
    await sendDraftProposalAction(propFd);
    expect(proposalUpdates[0]).toEqual({ status: 'sent' });
    expect(proposalUpdates[0]).not.toHaveProperty('sent_at');
    expect(mockEnqueueTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'proposal_sent' })
    );

    const invFd = new FormData();
    invFd.set('client_id', 'cli-1');
    invFd.set('currency', 'BDT');
    invFd.set('fx_rate_to_usd', '120.5');
    invFd.set(
      'items_json',
      JSON.stringify([{ description: 'Security Retainer', quantity: 3, unit_price_major: 200 }])
    );
    await createMultiLineInvoiceAction(invFd);
    expect(rpcCalls[0]?.name).toBe('create_draft_invoice_multi_atomic');
    expect(rpcCalls[0]?.args.p_items).toEqual([
      {
        description: 'Security Retainer',
        qty: 3,
        quantity: 3,
        unit_price_cents: 20000,
      },
    ]);

    const cancelFd = new FormData();
    cancelFd.set('request_id', 'cr-1');
    cancelFd.set('decision', 'declined');
    cancelFd.set('resolution_notes', 'Work already delivered');
    await resolveCancellationRequestAction(cancelFd);
    expect(rpcCalls[1]).toEqual({
      name: 'resolve_order_cancellation_atomic',
      args: expect.objectContaining({
        p_request_id: 'cr-1',
        p_decision: 'declined',
      }),
    });
  });

  it('[P6-MESSAGE-RATE-LIMIT] POST /api/orders/[id]/messages enforces 30/min rate limit with HTTP 429', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: 'cli-1',
      email: 'client@disposable.test',
      fullName: 'Client User',
      role: 'client',
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'ord-1', client_id: 'cli-1', code: 'ORD-1', title: 'Audit' },
              error: null,
            }),
          }),
        }),
      })),
    });
    mockConsumeRateLimit.mockResolvedValue(false);

    const req = new NextRequest('http://127.0.0.1:3000/api/orders/ord-1/messages', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ body: 'Checking rate limit window' }),
    });
    const res = await postOrderMessage(req, { params: Promise.resolve({ id: 'ord-1' }) });
    expect(res.status).toBe(429);
    expect(mockConsumeRateLimit).toHaveBeenCalledWith('order-message', 'cli-1', 30, 60);
  });

  it('[P6-LOGOUT-WWW] POST /api/auth/logout stays on www.redwan.work when NEXT_PUBLIC_SITE_URL is apex', async () => {
    const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://redwan.work';
    try {
      mockCreateSupabaseServerClient.mockResolvedValue({
        auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
      });
      const req = new NextRequest('https://www.redwan.work/api/auth/logout', {
        method: 'POST',
        headers: {
          host: 'www.redwan.work',
          origin: 'https://www.redwan.work',
        },
      });
      const res = await logoutPost(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('https://www.redwan.work/login');
    } finally {
      if (prevSiteUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SITE_URL;
      } else {
        process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
      }
    }
  });

  it('[P6-FORM-FEEDBACK] preserves submitter name/value and wraps interactive portal/order mutations in ActionFeedbackForm', () => {
    const feedbackSource = readFileSync(
      resolve(process.cwd(), 'components/panel/action-feedback-form.tsx'),
      'utf8'
    );
    expect(feedbackSource).toContain('new FormData(event.currentTarget, submitter)');

    for (const relPath of [
      'app/(client)/portal/tickets/page.tsx',
      'app/(client)/portal/orders/new/page.tsx',
      'app/(client)/portal/orders/[id]/page.tsx',
      'app/(client)/portal/proposals/page.tsx',
      'app/(client)/portal/proposals/[id]/page.tsx',
      'app/(admin)/admin/orders/[id]/page.tsx',
      'app/(admin)/admin/invoices/[id]/page.tsx',
      'components/admin/billing-hub-view.tsx',
    ]) {
      const content = readFileSync(resolve(process.cwd(), relPath), 'utf8');
      expect(content, `${relPath} must use ActionFeedbackForm`).toContain('ActionFeedbackForm');
      expect(content, `${relPath} must not use bare <form action={...}>`).not.toMatch(
        /<form\s+action=\{/
      );
    }

    for (const relPath of [
      'components/admin/ops-hub-view.tsx',
      'app/(admin)/admin/clients/[id]/page.tsx',
      'app/(admin)/admin/recovery/page.tsx',
      'app/(client)/portal/files/page.tsx',
      'app/api/admin/recovery/export/route.ts',
      'app/api/cron/r2-retention/route.ts',
      'app/(client)/portal/orders/[id]/page.tsx',
    ]) {
      const content = readFileSync(resolve(process.cwd(), relPath), 'utf8');
      expect(content, `${relPath} must use archived_at instead of deleted_from_r2_at`).not.toContain(
        'deleted_from_r2_at'
      );
    }
  });

  it('[P7-POST-AUDIT-V2] populates inquiry consent on custom quotes, maps client_notes note_type to valid enum, locks verified requirements in submitOrderRequirementsAction, and forwards currency in createOrderFromAdminAction', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: 'cli-1',
      email: 'client@disposable.test',
      fullName: 'Client User',
      role: 'client',
    });

    const inquiryInserts: Array<Record<string, unknown>> = [];
    const clientNoteInserts: Array<Record<string, unknown>> = [];
    const adminRpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        adminRpcCalls.push({ name, args });
        if (name === 'contact_consent_control') {
          return {
            data: {
              schema: 1,
              activeVersion: 'v2',
              policies: [
                {
                  version: 'v2',
                  hash: '1a699e66a0ca278d073abdf070313ae5e154a4449c0d6c2c053e40df238d3216',
                  canonical: JSON.stringify({
                    schema: 1,
                    version: 'v2',
                    checkbox: 'I consent',
                    privacyNotice: 'Privacy notice',
                    attachmentNotice: 'Attachment notice',
                    policyText: 'Full policy text for v2 consent validation',
                  }),
                },
              ],
            },
            error: null,
          };
        }
        return { data: { order_id: 'ord-bdt-1', code: 'ORD-1099', status: 'awaiting_payment' }, error: null };
      }),
      from: vi.fn((table: string) => {
        if (table === 'inquiries') {
          return {
            insert: (row: Record<string, unknown>) => {
              inquiryInserts.push(row);
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'inq-99', code: 'INQ-1099' }, error: null }),
                }),
              };
            },
          };
        }
        if (table === 'client_notes') {
          return {
            insert: async (row: Record<string, unknown>) => {
              clientNoteInserts.push(row);
              return { error: null };
            },
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'ord-locked-1',
                    code: 'ORD-1',
                    title: 'Locked Order',
                    client_id: 'cli-1',
                    status: 'pending_requirements',
                    requires_roe: false,
                    roe_signed_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'order_requirements') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'req-1',
                    verified_by_admin_at: '2026-11-18T00:00:00.000Z',
                  },
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn(async () => ({ error: null })),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { email: 'client@disposable.test', full_name: 'Client User' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            order: async () => ({ data: [], error: null }),
          }),
        };
      }),
    });

    // 1. Custom quote order must include active consent_policy_version & consent_policy_hash
    const quoteFd = new FormData();
    quoteFd.set('service_slug', 'other-custom-engagement');
    quoteFd.set('custom_budget_usd', '2500');
    quoteFd.set('project_notes', 'Need custom architecture review');
    await expect(placePortalPackageOrderAction(quoteFd)).rejects.toThrow(
      /NEXT_REDIRECT:\/portal\/orders\/new\?quote_submitted=1/
    );
    expect(inquiryInserts).toHaveLength(1);
    expect(inquiryInserts[0]).toEqual(
      expect.objectContaining({
        consent_policy_version: 'v2',
        consent_policy_hash: '1a699e66a0ca278d073abdf070313ae5e154a4449c0d6c2c053e40df238d3216',
        consent_capture_method: 'checkbox_v1',
      })
    );
    expect(typeof inquiryInserts[0].consent_at).toBe('string');

    // 2. submitOrderRequirementsAction must reject edits once verified_by_admin_at is set
    const reqFd = new FormData();
    reqFd.set('order_id', 'ord-locked-1');
    reqFd.set('target_scope_notes', 'Attempted overwrite after admin lock');
    await expect(submitOrderRequirementsAction(reqFd)).rejects.toThrow(/locked|verified/i);

    // 3. Admin actions: addTypedClientNoteAction maps 'call' -> 'call_log' and rejects invalid enum values;
    //    createOrderFromAdminAction passes p_currency
    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    const noteFd = new FormData();
    noteFd.set('client_id', 'cli-1');
    noteFd.set('note_type', 'call');
    noteFd.set('body', 'Discovery call completed');
    await addTypedClientNoteAction(noteFd);
    expect(clientNoteInserts[0]?.note_type).toBe('call_log');

    const orderFd = new FormData();
    orderFd.set('client_id', 'cli-1');
    orderFd.set('title', 'BDT Direct Engagement');
    orderFd.set('pillar', 'development');
    orderFd.set('currency', 'BDT');
    orderFd.set('total_usd', '150000');
    orderFd.set('deposit_percent', '50');
    await createOrderFromAdminAction(orderFd);
    const createOrderCall = adminRpcCalls.find((c) => c.name === 'create_admin_order_atomic');
    expect(createOrderCall?.args).toEqual(
      expect.objectContaining({
        p_currency: 'BDT',
      })
    );

    // 4. Verify removed unhardened/dead actions and /contact ISR + dynamic libphonenumber-js speed optimizations
    const authActionsSource = readFileSync(resolve(process.cwd(), 'lib/auth/actions.ts'), 'utf8');
    expect(authActionsSource).not.toContain('export async function changeAuthenticatedPasswordAction');

    const crmActionsSource = readFileSync(resolve(process.cwd(), 'lib/crm/actions.ts'), 'utf8');
    expect(crmActionsSource).not.toContain('export async function postOrderMessageAction');

    const contactPageSource = readFileSync(resolve(process.cwd(), 'app/contact/page.tsx'), 'utf8');
    expect(contactPageSource).toContain('export const revalidate = 300');
    expect(contactPageSource).not.toContain("export const dynamic = 'force-dynamic'");

    const contactFormSource = readFileSync(
      resolve(process.cwd(), 'components/enhanced-contact-form.tsx'),
      'utf8'
    );
    expect(contactFormSource).toContain("await import('libphonenumber-js')");
    expect(contactFormSource).not.toMatch(/import\s*\{[^}]*isValidPhoneNumber[^}]*\}\s*from\s*['"]libphonenumber-js['"]/);
  });
});
