import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentSession,
  mockRequireAdminSession,
  mockGetSupabaseAdmin,
  mockCreateSupabaseServerClient,
  mockConsumeRateLimit,
  mockRecordAuditLog,
  mockRevalidatePath,
  mockDeletePublicObject,
} = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockRequireAdminSession: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockCreateSupabaseServerClient: vi.fn(),
  mockConsumeRateLimit: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDeletePublicObject: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
  requireAdminSession: mockRequireAdminSession,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: mockConsumeRateLimit,
}));
vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: mockRecordAuditLog,
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
}));
vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    isPublicR2Configured: vi.fn(() => true),
    isR2Configured: vi.fn(() => false),
    deletePublicObject: mockDeletePublicObject,
  };
});

import { resolveCallbackOrigin } from '@/lib/security/safe-redirect';
import { parseAttachments } from '@/lib/contact/lead-schema';
import { sanitizeCsvCell } from '@/components/admin/csv-export-button';
import { GET as logoutGet } from '@/app/api/auth/logout/route';
import { GET as getOrderMessages } from '@/app/api/orders/[id]/messages/route';
import { deletePublicAssetAction, retryOutboxEmailAction } from '@/lib/admin/ops-actions';
import { toggleClientActiveStatusAction } from '@/lib/crm/actions';
import { RESUME_ASSET_KEY } from '@/lib/r2';

describe('Deep Audit v3 AppSec, Auth, Upload & Operations Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue(true);
    mockGetCurrentSession.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@disposable.test',
      fullName: 'Admin Operator',
      role: 'admin',
      aal: 'aal2',
    });
    mockRequireAdminSession.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@disposable.test',
      fullName: 'Admin Operator',
      role: 'admin',
      aal: 'aal2',
    });
  });

  it('[AUDIT-V3-APP-01] resolveCallbackOrigin rejects loopback hosts in production and strips attacker ports', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TEST_ENVIRONMENT', '');
    try {
      expect(
        resolveCallbackOrigin({
          host: 'localhost:9999',
          requestOrigin: 'https://redwan.work',
          siteUrl: 'https://redwan.work',
        })
      ).toBe('https://redwan.work');

      expect(
        resolveCallbackOrigin({
          host: '127.0.0.1:8080',
          forwardedHost: '127.0.0.1:8080',
          requestOrigin: 'https://redwan.work',
          siteUrl: 'https://redwan.work',
        })
      ).toBe('https://redwan.work');

      expect(
        resolveCallbackOrigin({
          host: 'redwan.work:8443',
          forwardedProto: 'https',
          requestOrigin: 'https://redwan.work',
          siteUrl: 'https://redwan.work',
        })
      ).toBe('https://redwan.work');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('[AUDIT-V3-APP-02] GET /api/auth/logout rejects same-site CSRF and signs out with scope local only', async () => {
    const signOutMock = vi.fn(async () => ({ error: null }));
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { signOut: signOutMock },
    });

    const crossSiteReq = new NextRequest('https://redwan.work/api/auth/logout', {
      method: 'GET',
      headers: {
        host: 'redwan.work',
        'sec-fetch-site': 'same-site',
      },
    });
    const blocked = await logoutGet(crossSiteReq);
    expect(blocked.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();

    const sameOriginReq = new NextRequest('https://redwan.work/api/auth/logout?reason=session_invalid', {
      method: 'GET',
      headers: {
        host: 'redwan.work',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      },
    });
    const ok = await logoutGet(sameOriginReq);
    expect(ok.status).toBe(302);
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('[AUDIT-V3-APP-03] sanitizeCsvCell neutralizes leading whitespace/newline formula injection', () => {
    expect(sanitizeCsvCell('  =CMD|"/c calc"!A0')).toMatch(/^"'/);
    expect(sanitizeCsvCell('\n+SUM(A1:A2)')).toMatch(/^"'/);
    expect(sanitizeCsvCell('\r\t-1+1')).toMatch(/^"'/);
    expect(sanitizeCsvCell(' @SUM(1,2)')).toMatch(/^"'/);
    expect(sanitizeCsvCell('normal text')).toBe('normal text');
  });

  it('[AUDIT-V3-APP-04] parseAttachments enforces R2 key extension parity and MIME allowlist', () => {
    const mismatched = parseAttachments(
      JSON.stringify([
        {
          key: 'contact/11111111-2222-4333-8444-555555555555/00000000-0000-4000-8000-000000000001.png',
          filename: 'scope.pdf',
          mime: 'application/pdf',
          size_bytes: 2048,
        },
      ])
    );
    expect(mismatched.ok).toBe(false);

    const valid = parseAttachments(
      JSON.stringify([
        {
          key: 'contact/11111111-2222-4333-8444-555555555555/00000000-0000-4000-8000-000000000001.pdf',
          filename: '../evil/\r\nscope.pdf',
          mime: 'application/pdf',
          size_bytes: 2048,
        },
      ])
    );
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.attachments[0].filename).not.toMatch(/[\\/\r\n]/);
      expect(valid.attachments[0].filename.endsWith('.pdf')).toBe(true);
    }
  });

  it('[AUDIT-V3-APP-05] deletePublicAssetAction protects canonical and active resume PDF assets', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { resume_pdf_url: 'https://assets.redwan.work/assets/custom-cv.pdf' },
              error: null,
            }),
          }),
        }),
      })),
    });

    const fd1 = new FormData();
    fd1.set('key', RESUME_ASSET_KEY);
    await expect(deletePublicAssetAction(fd1)).rejects.toThrow(/canonical resume PDF/i);

    const fd2 = new FormData();
    fd2.set('key', 'assets/custom-cv.pdf');
    await expect(deletePublicAssetAction(fd2)).rejects.toThrow(/actively referenced in site settings/i);
    expect(mockDeletePublicObject).not.toHaveBeenCalled();
  });

  it('[AUDIT-V3-APP-06] retryOutboxEmailAction refuses in-flight processing rows and stamps _retryNonce on failed rows', async () => {
    const emailId = '11111111-2222-4333-8444-555555555555';
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: emailId,
                status: 'processing',
                locked_at: new Date().toISOString(),
                payload: { message: 'hi' },
              },
              error: null,
            }),
          }),
        }),
      })),
    });

    const fdProcessing = new FormData();
    fdProcessing.set('outbox_id', emailId);
    await expect(retryOutboxEmailAction(fdProcessing)).rejects.toThrow(/currently processing/i);

    const updates: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: emailId, status: 'failed', locked_at: null, payload: { message: 'retry me' } },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: () => ({
              neq: async () => ({ error: null }),
            }),
          };
        },
      })),
    });

    await retryOutboxEmailAction(fdProcessing);
    expect(updates[0]).toMatchObject({ status: 'pending', attempts: 0 });
    expect((updates[0].payload as Record<string, unknown>)._retryNonce).toBe(1);
  });

  it('[AUDIT-V3-APP-07] toggleClientActiveStatusAction bans auth user, bumps tokens_valid_after, and revokes DB sessions', async () => {
    const clientId = '22222222-3333-4444-8555-666666666666';
    const profileUpdates: Array<Record<string, unknown>> = [];
    const banCalls: Array<{ id: string; attrs: Record<string, unknown> }> = [];
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            update: (payload: Record<string, unknown>) => {
              profileUpdates.push(payload);
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: clientId }, error: null }),
                    }),
                  }),
                }),
              };
            },
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { email: 'client@disposable.test' }, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
      auth: {
        admin: {
          updateUserById: async (id: string, attrs: Record<string, unknown>) => {
            banCalls.push({ id, attrs });
            return { data: {}, error: null };
          },
        },
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { data: 1, error: null };
      },
    });

    const fd = new FormData();
    fd.set('client_id', clientId);
    fd.set('is_active', 'false');
    await toggleClientActiveStatusAction(fd);

    expect(profileUpdates[0]).toMatchObject({ is_active: false });
    expect(typeof profileUpdates[0].tokens_valid_after).toBe('number');
    expect(Number.isInteger(profileUpdates[0].tokens_valid_after)).toBe(true);
    expect(Number(profileUpdates[0].tokens_valid_after)).toBeGreaterThan(1_700_000_000);
    expect(banCalls).toEqual([{ id: clientId, attrs: { ban_duration: '876000h' } }]);
    expect(rpcCalls).toEqual([{ fn: 'revoke_auth_user_sessions', args: { p_user_id: clientId } }]);
  });

  it('[AUDIT-V3-APP-08] GET /api/orders/[id]/messages omits author email for client callers', async () => {
    const orderId = '11111111-2222-4333-8444-555555555555';
    const clientId = '22222222-3333-4444-8555-666666666666';
    const capturedSelects: string[] = [];

    mockGetCurrentSession.mockResolvedValue({
      userId: clientId,
      email: 'client@disposable.test',
      fullName: 'Client User',
      role: 'client',
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: orderId, client_id: clientId, code: 'ORD-1001', title: 'Audit', status: 'in_progress' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'order_messages') {
          return {
            select: (sel: string) => {
              capturedSelects.push(sel);
              return {
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      eq: async () => ({
                        data: [
                          {
                            id: 'msg-1',
                            body: 'Hello from admin',
                            created_at: '2026-11-25T10:00:00Z',
                            is_internal_note: false,
                            author_id: 'admin-1',
                            attachment_file_ids: [],
                            author: { full_name: 'Redwan', role: 'admin' },
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        return {};
      }),
    });

    const req = new NextRequest(`https://redwan.work/api/orders/${orderId}/messages`);
    const res = await getOrderMessages(req, { params: Promise.resolve({ id: orderId }) });
    expect(res.status).toBe(200);
    expect(capturedSelects[0]).not.toContain('email');
    const json = (await res.json()) as { messages: Array<{ author: Record<string, unknown> }> };
    expect(json.messages[0].author).toEqual({ full_name: 'Redwan', role: 'admin' });
    expect(json.messages[0].author).not.toHaveProperty('email');
  });
});
