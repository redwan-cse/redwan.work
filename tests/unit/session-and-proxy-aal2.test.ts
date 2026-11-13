import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: mockGetClaims,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
    rpc: mockRpc,
  }),
}));

vi.mock('@supabase/ssr', () => ({
  parseCookieHeader: () => [],
  createServerClient: () => ({
    auth: {
      getClaims: mockGetClaims,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
    rpc: mockRpc,
  }),
}));

import { getCurrentSession } from '@/lib/auth/session';
import { signInWithPasswordAction } from '@/lib/auth/actions';
import { proxy } from '@/proxy';
import {
  sanitizeAdminMfaNextPath,
  sanitizeHttpUrl,
  sanitizeRelativeRedirectPath,
  shouldUseSecureCookies,
} from '@/lib/security/safe-redirect';

describe('Session & Proxy MFA AAL2 and Active-Account Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_disposable_local_key';
  });

  it('denies getCurrentSession() to an AAL1 admin when mfa_enforced is true', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: true,
        full_name: 'Admin User',
        email: 'admin@disposable.test',
      },
      error: null,
    });

    const session = await getCurrentSession();
    expect(session).toBeNull();
  });

  it('grants getCurrentSession() to an AAL2 admin with app_metadata.role === admin', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal2',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: true,
        full_name: 'Admin User',
        email: 'admin@disposable.test',
      },
      error: null,
    });

    const session = await getCurrentSession();
    expect(session).toEqual({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@disposable.test',
      fullName: 'Admin User',
      role: 'admin',
    });
  });

  it('redirects AAL1 admin visiting /admin to /mfa?next=%2Fadmin in proxy()', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: true,
      },
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/admin');
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/mfa?next=%2Fadmin');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('redirects AAL2 admin away from /mfa to /admin and redirects deactivated accounts to logout', async () => {
    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal2',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: true,
      },
      error: null,
    });

    const mfaRes = await proxy(new NextRequest('http://localhost:3000/mfa'));
    expect(mfaRes.status).toBe(307);
    expect(mfaRes.headers.get('location')).toBe('http://localhost:3000/admin');

    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: {
          sub: '44444444-4444-4444-4444-444444444444',
          email: 'inactive@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'client' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        role: 'client',
        is_active: false,
        mfa_enforced: false,
      },
      error: null,
    });

    const deactRes = await proxy(new NextRequest('http://localhost:3000/portal'));
    expect(deactRes.status).toBe(307);
    expect(deactRes.headers.get('location')).toBe(
      'http://localhost:3000/api/auth/logout?reason=deactivated'
    );
  });

  it('signs out and returns deactivation error in signInWithPasswordAction when caller_account_state is inactive', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: '44444444-4444-4444-4444-444444444444',
          email: 'disabled@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'client' },
        },
      },
      error: null,
    });
    // Under RLS, inactive user cannot read own profile row (returns null)
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: 'inactive', error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const fd = new FormData();
    fd.set('email', 'disabled@disposable.test');
    fd.set('password', 'ValidPassword!1234');

    const result = await signInWithPasswordAction({}, fd);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      error: 'Your account has been deactivated. Contact the administrator.',
    });
  });

  it('blocks WHATWG control-char open redirects and never downgrades Secure cookies in production', () => {
    expect(sanitizeRelativeRedirectPath('/\t/evil.example')).toBeNull();
    expect(sanitizeRelativeRedirectPath('/%09/evil.example')).toBeNull();
    expect(sanitizeRelativeRedirectPath('/\n/evil.example')).toBeNull();
    expect(sanitizeRelativeRedirectPath('//evil.example')).toBeNull();
    expect(sanitizeRelativeRedirectPath('/\\evil.example')).toBeNull();
    expect(sanitizeRelativeRedirectPath('https://evil.example/admin')).toBeNull();
    expect(sanitizeRelativeRedirectPath('/portal/orders?tab=1')).toBe('/portal/orders?tab=1');

    expect(sanitizeAdminMfaNextPath('/\t/evil.example')).toBe('/admin');
    expect(sanitizeAdminMfaNextPath('/admin\t/../../evil')).toBe('/admin');
    expect(sanitizeAdminMfaNextPath('/portal/orders')).toBe('/admin');
    expect(sanitizeAdminMfaNextPath('/admin/orders?page=2')).toBe('/admin/orders?page=2');

    expect(
      shouldUseSecureCookies({
        nodeEnv: 'production',
        testEnvironment: undefined,
        siteUrl: 'https://redwan.work',
      })
    ).toBe(true);
    expect(
      shouldUseSecureCookies({
        nodeEnv: 'production',
        testEnvironment: undefined,
        siteUrl: 'http://127.0.0.1:3000',
      })
    ).toBe(true);
    expect(
      shouldUseSecureCookies({
        nodeEnv: 'production',
        testEnvironment: 'isolated-ci',
        siteUrl: 'http://127.0.0.1:24390',
      })
    ).toBe(false);

    expect(() => sanitizeHttpUrl('javascript:alert(1)')).toThrow();
    expect(() => sanitizeHttpUrl('data:text/html,<script>alert(1)</script>')).toThrow();
    expect(sanitizeHttpUrl('https://redwan.work/resume')).toBe('https://redwan.work/resume');
    expect(sanitizeHttpUrl('/resume.pdf', { allowRelative: true })).toBe('/resume.pdf');
  });

  it('requires AAL2 for admins even when mfa_enforced is false', async () => {
    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: false,
        full_name: 'Admin User',
        email: 'admin@disposable.test',
      },
      error: null,
    });
    expect(await getCurrentSession()).toBeNull();

    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'admin@disposable.test',
          aal: 'aal1',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        role: 'admin',
        is_active: true,
        mfa_enforced: false,
      },
      error: null,
    });
    const res = await proxy(new NextRequest('http://localhost:3000/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/mfa?next=%2Fadmin');
  });
});
