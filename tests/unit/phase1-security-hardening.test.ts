import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSiteSettingsAndResume = vi.fn();
const mockGetPublicObjectBytes = vi.fn();
const mockGetCurrentSession = vi.fn();
const mockRequireAdminSession = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockDeletePrivateObjects = vi.fn();
const mockIsR2Configured = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockCreateClient = vi.fn();
const mockHeaders = vi.fn();
const mockCheckPasswordLeakedHibp = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock('@/lib/cms/queries', () => ({
  getSiteSettingsAndResume: () => mockGetSiteSettingsAndResume(),
}));

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    getPublicObjectBytes: (...args: unknown[]) => mockGetPublicObjectBytes(...args),
    deletePrivateObjects: (...args: unknown[]) => mockDeletePrivateObjects(...args),
    isR2Configured: () => mockIsR2Configured(),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: (...args: unknown[]) => mockRecordAuditLog(...args),
}));

vi.mock('@/lib/auth/hibp', () => ({
  LEAKED_PASSWORD_ERROR: 'This password has appeared in a known data breach. Choose a unique password.',
  checkPasswordLeakedHibp: (...args: unknown[]) => mockCheckPasswordLeakedHibp(...args),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAdminSession: () => mockRequireAdminSession(),
    getCurrentSession: (...args: unknown[]) => {
      if (mockGetCurrentSession.getMockImplementation()) {
        return mockGetCurrentSession(...args);
      }
      return actual.getCurrentSession();
    },
  };
});

import { validateMagicBytes } from '@/lib/mime';
import { serveStoredResumePdf } from '@/lib/resume/route-handler';
import {
  extendVaultRetentionAction,
  publishConsentPolicyAction,
  purgeOrphanPrivateObjectAction,
  retryOutboxEmailAction,
} from '@/lib/admin/ops-actions';
import { getCurrentSession } from '@/lib/auth/session';
import { changePasswordAction } from '@/lib/auth/password-change';
import { resolveTrustedIp } from '@/lib/security/trusted-ip';
import {
  adminSearchQuerySchema,
  blogsPreloadQuerySchema,
  currencySchema,
  orderMessageBodySchema,
  positiveFiniteFxRateSchema,
  uuidSchema,
} from '@/lib/validation/schemas';

describe('Phase 1 P0-P1 Application Security, SSRF, Magic Bytes, Zod & MFA Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentSession.mockReset();
    mockHeaders.mockResolvedValue(new Headers());
    mockCheckPasswordLeakedHibp.mockResolvedValue({ leaked: false });
  });

  it('[S8-MIME-AVIF] rejects MP4 ftypisom disguised as image/avif and accepts genuine AVIF brands', () => {
    const fakeMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x69, 0x73, 0x6f, 0x6d, // isom (MP4, NOT AVIF)
      0x00, 0x00, 0x02, 0x00,
    ]);
    const validAvif = Buffer.from([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x66, // avif
      0x00, 0x00, 0x00, 0x00,
    ]);
    const validAvis = Buffer.from([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x73, // avis
      0x00, 0x00, 0x00, 0x00,
    ]);

    expect(validateMagicBytes(fakeMp4, 'image/avif')).toBe(false);
    expect(validateMagicBytes(validAvif, 'image/avif')).toBe(true);
    expect(validateMagicBytes(validAvis, 'image/avif')).toBe(true);
  });

  it('[S8-ZOD-AND-IP] validates shared Zod API/finance schemas and prioritizes x-vercel-forwarded-for over spoofed cf-connecting-ip', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('11111111-2222-4333-8444-555555555555').success).toBe(true);
    expect(currencySchema.safeParse('usd').data).toBe('USD');
    expect(currencySchema.safeParse('ZZZ').success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(Number.NaN).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(0).success).toBe(false);
    expect(positiveFiniteFxRateSchema.safeParse(0.0085).success).toBe(true);

    expect(orderMessageBodySchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(orderMessageBodySchema.safeParse({ body: 'Valid update', is_internal_note: true }).success).toBe(true);
    expect(blogsPreloadQuerySchema.safeParse({ page: 51 }).success).toBe(false);
    expect(blogsPreloadQuerySchema.safeParse({ page: 2 }).success).toBe(true);
    expect(adminSearchQuerySchema.safeParse({ q: 'ORD-1001' }).success).toBe(true);

    // Spoofed cf-connecting-ip must NOT override x-vercel-forwarded-for
    const spoofed = new Headers({
      'cf-connecting-ip': '1.2.3.4',
      'x-vercel-forwarded-for': '203.0.113.10, 198.51.100.7',
    });
    expect(resolveTrustedIp(spoofed)).toBe('198.51.100.7');
  });

  it('[S5-RESUME-SSRF] returns clean 404 on relative /resume.pdf fallback and blocks external non-R2 SSRF hosts', async () => {
    process.env.R2_ENDPOINT = '';
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = 'https://assets.redwan.work';

    // 1. Default relative URL '/resume.pdf' must return 404 (never throw uncaught 500)
    mockGetSiteSettingsAndResume.mockResolvedValueOnce({
      settings: { resume_pdf_url: '/resume.pdf', full_name: 'Md. Redwan Ahmed' },
    });
    const relReq = new NextRequest('https://redwan.work/api/resume');
    const relRes = await serveStoredResumePdf(relReq);
    expect(relRes.status).toBe(404);

    // 2. Arbitrary external / internal URL (SSRF) must NOT be fetched at all
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockGetSiteSettingsAndResume.mockResolvedValueOnce({
      settings: { resume_pdf_url: 'http://169.254.169.254/latest/meta-data/', full_name: 'Md. Redwan Ahmed' },
    });
    const ssrfRes = await serveStoredResumePdf(new NextRequest('https://redwan.work/api/resume'));
    expect(ssrfRes.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 3. Matching R2 public origin uses redirect:'error' and enforces %PDF- header + streaming size cap
    fetchSpy.mockResolvedValueOnce(
      new Response(Buffer.from('%PDF-1.7\nhello'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      })
    );
    mockGetSiteSettingsAndResume.mockResolvedValueOnce({
      settings: {
        resume_pdf_url: 'https://assets.redwan.work/assets/resume/Md_Redwan_Ahmed_Resume.pdf',
        full_name: 'Md. Redwan Ahmed',
      },
    });
    const okRes = await serveStoredResumePdf(new NextRequest('https://redwan.work/api/resume'));
    expect(okRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://assets.redwan.work/assets/resume/Md_Redwan_Ahmed_Resume.pdf',
      expect.objectContaining({ redirect: 'error' })
    );
    fetchSpy.mockRestore();
  });

  it('[S7-OPS-GUARDS] blocks purging live DB-referenced R2 keys, skips already-sent outbox retries, and publishes consent policies via atomic RPC', async () => {
    mockRequireAdminSession.mockResolvedValue({
      userId: 'admin-uuid-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
    });
    mockIsR2Configured.mockReturnValue(true);

    // 1. purgeOrphanPrivateObjectAction refuses deletion if key still exists in vault_files
    mockGetSupabaseAdmin.mockReturnValueOnce({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: table === 'vault_files' ? [{ id: 'vf-live-1' }] : [],
              error: null,
            }),
          }),
        }),
      }),
    });
    const purgeFd = new FormData();
    purgeFd.set('r2_key', 'private/11111111-1111-4111-8111-111111111111/deliverable/live.pdf');
    await expect(purgeOrphanPrivateObjectAction(purgeFd)).rejects.toThrow(/referenced|active/i);
    expect(mockDeletePrivateObjects).not.toHaveBeenCalled();

    // 2. retryOutboxEmailAction restricts update with .neq('status', 'sent')
    const neqSpy = vi.fn(async () => ({ error: null }));
    mockGetSupabaseAdmin.mockReturnValueOnce({
      from: () => ({
        update: () => ({
          eq: () => ({
            neq: neqSpy,
          }),
        }),
      }),
    });
    const retryFd = new FormData();
    retryFd.set('outbox_id', '11111111-2222-4333-8444-555555555555');
    await retryOutboxEmailAction(retryFd);
    expect(neqSpy).toHaveBeenCalledWith('status', 'sent');

    // 3. extendVaultRetentionAction restricts update with .is('archived_at', null)
    const isSpy = vi.fn(() => ({
      select: () => ({
        maybeSingle: async () => ({
          data: { filename: 'report.pdf', owner_client_id: 'cli-1', order_id: null },
          error: null,
        }),
      }),
    }));
    mockGetSupabaseAdmin.mockReturnValueOnce({
      from: () => ({
        update: () => ({
          eq: () => ({
            is: isSpy,
          }),
        }),
      }),
    });
    const extFd = new FormData();
    extFd.set('file_id', '11111111-2222-4333-8444-555555555555');
    extFd.set('mode', 'extend_90d');
    await extendVaultRetentionAction(extFd);
    expect(isSpy).toHaveBeenCalledWith('archived_at', null);

    // 4. publishConsentPolicyAction calls publish_consent_policy_atomic RPC (not non-atomic two-step update+upsert)
    const rpcSpy = vi.fn(async () => ({ data: { version: 'v4', hash: 'abc' }, error: null }));
    mockGetSupabaseAdmin.mockReturnValueOnce({
      rpc: rpcSpy,
    });
    const polFd = new FormData();
    polFd.set('version', 'v4');
    polFd.set('checkbox', 'I agree to the v4 privacy policy.');
    polFd.set('privacy_notice', 'Data is used strictly for scope evaluation.');
    polFd.set('attachment_notice', 'Files are stored encrypted and purged on retention.');
    polFd.set('policy_text', 'Full v4 policy text body covering GDPR and confidentiality.');
    await publishConsentPolicyAction(polFd);
    expect(rpcSpy).toHaveBeenCalledWith(
      'publish_consent_policy_atomic',
      expect.objectContaining({ p_version: 'v4', p_admin_id: 'admin-uuid-1' })
    );
  });

  it('[S6-MFA-FAIL-CLOSED] rejects client session when getAuthenticatorAssuranceLevel throws, when mfa_enforced=true at aal1, or when iat is missing with tokens_valid_after > 0', async () => {
    // 1. Fail-closed when MFA assurance API throws
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: 'cli-1', email: 'c@test.local', aal: 'aal1', iat: 2000 } },
          error: null,
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => {
            throw new Error('Auth upstream timeout');
          },
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                role: 'client',
                is_active: true,
                mfa_enforced: false,
                tokens_valid_after: 0,
                full_name: 'Client',
                email: 'c@test.local',
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    expect(await getCurrentSession()).toBeNull();

    // 2. Client with mfa_enforced = true and aal1 must be rejected
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: 'cli-1', email: 'c@test.local', aal: 'aal1', iat: 2000 } },
          error: null,
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal1' },
          }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                role: 'client',
                is_active: true,
                mfa_enforced: true,
                tokens_valid_after: 0,
                full_name: 'Client',
                email: 'c@test.local',
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    expect(await getCurrentSession()).toBeNull();

    // 3. Missing iat claim when tokens_valid_after > 0 must fail closed
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: 'cli-1', email: 'c@test.local', aal: 'aal1' } },
          error: null,
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal1' },
          }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                role: 'client',
                is_active: true,
                mfa_enforced: false,
                tokens_valid_after: 1700000000,
                full_name: 'Client',
                email: 'c@test.local',
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    expect(await getCurrentSession()).toBeNull();
  });

  it('[S6-PASSWORD-CHANGE-SM] verifies changePasswordAction runtime state machine, bumps tokens_valid_after, and logs auth.password_changed', async () => {
    process.env.LEAD_IP_HASH_SALT = 'unit-test-salt';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';

    // 1. Denied on short password
    const weakFd = new FormData();
    weakFd.set('currentPassword', 'OldStrongPass!123');
    weakFd.set('password', 'short');
    weakFd.set('confirm', 'short');
    const weakRes = await changePasswordAction({}, weakFd);
    expect(weakRes.status).toBe('denied');

    // 2. Denied when HIBP flags leaked password
    mockCheckPasswordLeakedHibp.mockResolvedValueOnce({ leaked: true });
    const leakFd = new FormData();
    leakFd.set('currentPassword', 'OldStrongPass!123');
    leakFd.set('password', 'Password123456!');
    leakFd.set('confirm', 'Password123456!');
    const leakRes = await changePasswordAction({}, leakFd);
    expect(leakRes.status).toBe('denied');
    expect(leakRes.error).toMatch(/breach/i);

    // 3. Complete flow: refreshes current session, bumps tokens_valid_after, and records audit log
    const profileUpdateEq = vi.fn(async () => ({ error: null }));
    const profileUpdateSpy = vi.fn(() => ({ eq: profileUpdateEq }));
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: (table: string) => {
        if (table === 'profiles') return { update: profileUpdateSpy };
        return {};
      },
    });
    mockGetCurrentSession.mockImplementation(async () => ({
      userId: 'cli-pw-1',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
    }));

    const refreshedIat = Math.floor(Date.now() / 1000);
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getClaims: vi
          .fn()
          .mockResolvedValueOnce({ data: { claims: { sub: 'cli-pw-1', session_id: 'sid-orig', iat: refreshedIat - 100 } }, error: null })
          .mockResolvedValueOnce({ data: { claims: { sub: 'cli-pw-1', session_id: 'sid-orig', iat: refreshedIat - 100 } }, error: null })
          .mockResolvedValueOnce({ data: { claims: { sub: 'cli-pw-1', session_id: 'sid-orig', iat: refreshedIat } }, error: null }),
        getUser: vi.fn(async () => ({
          data: { user: { id: 'cli-pw-1', email: 'client@disposable.test' } },
          error: null,
        })),
        updateUser: vi.fn(async () => ({
          data: { user: { id: 'cli-pw-1' } },
          error: null,
        })),
        signOut: vi.fn(async () => ({ error: null })),
        refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'refreshed' } }, error: null })),
      },
    });
    mockCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: { access_token: 'temp' }, user: { id: 'cli-pw-1' } },
          error: null,
        })),
        getClaims: vi.fn(async () => ({
          data: { claims: { sub: 'cli-pw-1', session_id: 'sid-temp' } },
          error: null,
        })),
        signOut: vi.fn(async () => ({ error: null })),
      },
    });

    const okFd = new FormData();
    okFd.set('currentPassword', 'OldStrongPass!123');
    okFd.set('password', 'BrandNewUniquePass#2026!');
    okFd.set('confirm', 'BrandNewUniquePass#2026!');
    const okRes = await changePasswordAction({}, okFd);
    expect(okRes.status).toBe('complete');
    expect(profileUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tokens_valid_after: expect.any(Number) })
    );
    expect(profileUpdateEq).toHaveBeenCalledWith('id', 'cli-pw-1');
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'cli-pw-1',
        action: 'auth.password_changed',
      })
    );
  });
});
