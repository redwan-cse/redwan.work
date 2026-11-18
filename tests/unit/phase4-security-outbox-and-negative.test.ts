import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClaims = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockPutPublicObject = vi.fn();
const mockIsPublicR2Configured = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: mockGetClaims,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockProfileMaybeSingle,
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  }),
}));

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    isPublicR2Configured: () => mockIsPublicR2Configured(),
    putPublicObject: (...args: unknown[]) => mockPutPublicObject(...args),
  };
});

vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: vi.fn(),
  createInAppNotification: vi.fn(),
  notifyAllAdmins: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
}));

import { paginateItems } from '@/components/admin/admin-pagination';
import {
  drainEmailOutboxAction,
  publishConsentPolicyAction,
  syncBloggerCacheAction,
  uploadPublicAssetAction,
} from '@/lib/admin/ops-actions';
import { drainEmailOutbox } from '@/lib/email/outbox';

describe('Phase 4 Security Gates, Outbox 5th-Attempt Dead Letter & Negative Boundary Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_disposable_local_key';
    process.env.EMAIL_FROM = 'Redwan <noreply@redwan.test>';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3000';
  });

  it('[PUBLISHING-BOOLEAN] rejects non-admin client and anonymous callers on all admin ops server actions via requireAdminSession', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '22222222-2222-4222-8222-222222222222',
          email: 'client@disposable.test',
          aal: 'aal1',
          app_metadata: {},
        },
      },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValue({
      data: {
        role: 'client',
        is_active: true,
        mfa_enforced: false,
        full_name: 'Client User',
        email: 'client@disposable.test',
      },
      error: null,
    });

    const policyFd = new FormData();
    policyFd.set('version', '2026-11-16');
    policyFd.set('canonical', 'Canonical privacy notice policy text exceeding twenty characters.');

    const assetFd = new FormData();
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assetFd.set('asset_file', new File([validPng], 'logo.png', { type: 'image/png' }));

    await expect(drainEmailOutboxAction()).rejects.toThrow('NEXT_REDIRECT:/portal');
    await expect(publishConsentPolicyAction(policyFd)).rejects.toThrow('NEXT_REDIRECT:/portal');
    await expect(uploadPublicAssetAction(assetFd)).rejects.toThrow('NEXT_REDIRECT:/portal');
    await expect(syncBloggerCacheAction()).rejects.toThrow('NEXT_REDIRECT:/portal');
    expect(mockPutPublicObject).not.toHaveBeenCalled();
    expect(mockAdminFrom).not.toHaveBeenCalled();

    // Also reject unauthenticated callers
    mockGetClaims.mockResolvedValue({ data: { claims: null }, error: null });
    await expect(drainEmailOutboxAction()).rejects.toThrow(/^NEXT_REDIRECT:\/login/);
  });

  it('[CONSENT-CONTRACT] rejects spoofed file magic bytes in uploadPublicAssetAction even for AAL2 admin', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '11111111-1111-4111-8111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal2',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValue({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: true,
        full_name: 'Admin User',
        email: 'admin@disposable.test',
      },
      error: null,
    });
    mockIsPublicR2Configured.mockReturnValue(true);

    const fakePngFd = new FormData();
    fakePngFd.set(
      'asset_file',
      new File([new TextEncoder().encode('<script>alert(1)</script>')], 'evil.png', {
        type: 'image/png',
      })
    );
    await expect(uploadPublicAssetAction(fakePngFd)).rejects.toThrow(
      /contents do not match/i
    );

    const fakePdfFd = new FormData();
    fakePdfFd.set(
      'asset_file',
      new File([new TextEncoder().encode('not actually a pdf')], 'fake.pdf', {
        type: 'application/pdf',
      })
    );
    await expect(uploadPublicAssetAction(fakePdfFd)).rejects.toThrow(
      /contents do not match/i
    );
    expect(mockPutPublicObject).not.toHaveBeenCalled();
  });

  it('transitions email_outbox item to permanent failed dead-letter on 5th consecutive Resend error', async () => {
    const outboxUpdatePayloads: Array<Record<string, unknown>> = [];
    const emailLogInsertPayloads: Array<Record<string, unknown>> = [];

    mockAdminRpc.mockResolvedValue({
      data: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          to_email: 'client@disposable.test',
          subject: '5th retry deadline test',
          template: 'invoice_issued',
          payload: { message: 'Final attempt check', actionUrl: '/portal/invoices/123' },
          attempts: 4,
        },
      ],
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'email_outbox') {
        return {
          update: (payload: Record<string, unknown>) => {
            outboxUpdatePayloads.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'email_log') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            emailLogInsertPayloads.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ message: 'SMTP relay down' }), { status: 503 })
    ) as unknown as typeof fetch;

    try {
      const counts = await drainEmailOutbox(5);
      expect(counts).toEqual({ accepted: 0, deferred: 0, failed: 1 });
      expect(outboxUpdatePayloads).toHaveLength(1);
      expect(outboxUpdatePayloads[0]).toMatchObject({
        status: 'failed',
        attempts: 5,
        locked_at: null,
      });
      expect(emailLogInsertPayloads[0]).toMatchObject({
        status: 'failed',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('clamps pagination bounds safely in paginateItems for edge and out-of-range inputs', () => {
    const items = Array.from({ length: 53 }, (_, i) => `row-${i + 1}`);
    const page1 = paginateItems(items, undefined, 25);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(3);
    expect(page1.items).toHaveLength(25);

    const overflow = paginateItems(items, '999', 25);
    expect(overflow.page).toBe(3);
    expect(overflow.items).toEqual(['row-51', 'row-52', 'row-53']);

    const negative = paginateItems(items, '-4', 25);
    expect(negative.page).toBe(1);

    const malformed = paginateItems([], 'not-a-number', 25);
    expect(malformed.page).toBe(1);
    expect(malformed.totalPages).toBe(1);
    expect(malformed.items).toEqual([]);
  });
});
