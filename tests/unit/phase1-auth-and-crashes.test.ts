import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Constants } from '@/lib/supabase/database.types';

const mockCreateSupabaseServerClient = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetCurrentSession = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.10', host: 'localhost:3000', origin: 'http://localhost:3000' }),
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
  getPendingMfaAdminSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock('@/lib/crm/audit', () => ({
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
  recordAuditLog: vi.fn(),
}));

import {
  checkClientEmailRegistrationAction,
  registerClientAccountAction,
  requestMagicLinkAction,
  setNewPasswordFromRecoveryAction,
  signInWithPasswordAction,
} from '@/lib/auth/actions';
import { GET as logoutGet } from '@/app/api/auth/logout/route';
import { ASSET_ALLOWED, validateMagicBytes } from '@/lib/mime';
import { ASSET_ALLOWED_EXT, getPrivateObjectSize, isR2Configured, presignPrivateGet } from '@/lib/r2';
import { submitInvoicePaymentProofAction } from '@/lib/crm/actions';
import { upsertPortfolioItemAction, upsertResumeItemAction, upsertServicePackageAction } from '@/lib/cms/actions';
import { getPublicPortfolioItems } from '@/lib/cms/queries';

describe('Phase 1 Auth Enumeration, Recovery, Mime/R2, Ticket Enum & CMS Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue(true);
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.LEAD_IP_HASH_SALT = 'test-salt';
  });

  it('[AUTH-SEC-01] prevents email enumeration across signIn, checkEmail, register, and magic-link actions', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { message: 'Invalid login credentials' },
        }),
        signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: 'existing-user', identities: [] }, session: null },
          error: null,
        }),
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null }, error: null }),
      },
    });
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn(() => ({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({ data: { id: 'u-1', role: 'client', is_active: true }, error: null }),
          }),
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'u-1', role: 'client', is_active: true }, error: null }),
          }),
        }),
      })),
    });

    // 1. Unknown email sign-in must NOT reveal user_exists / unregistered status
    const signInFd = new FormData();
    signInFd.set('email', 'unknown-victim@example.com');
    signInFd.set('password', 'WrongPass!1234');
    const signInRes = await signInWithPasswordAction({}, signInFd);
    expect(signInRes.error).toBe('Invalid email or password.');
    expect(JSON.stringify(signInRes)).not.toMatch(/unregistered|not registered|user_exists/i);

    // 2. checkClientEmailRegistrationAction must not disclose account existence
    const checkRes = await checkClientEmailRegistrationAction('existing@example.com');
    expect(checkRes).toEqual({ registered: false });

    // 3. requestMagicLinkAction must return generic notice without redirecting to /register
    const magicFd = new FormData();
    magicFd.set('email', 'unknown-victim@example.com');
    magicFd.set('next', '/portal/orders');
    const magicRes = await requestMagicLinkAction({}, magicFd);
    expect(magicRes.notice).toMatch(/if an account matches|check your email/i);
    expect(magicRes.error).toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();

    // 4. registerClientAccountAction on existing email must not redirect to /login?registered=1&email=... or leak existence
    const regFd = new FormData();
    regFd.set('full_name', 'Jane Doe');
    regFd.set('email', 'existing@example.com');
    regFd.set('password', 'StrongPass!1234');
    regFd.set('confirm', 'StrongPass!1234');
    const regRes = await registerClientAccountAction({}, regFd);
    expect(regRes.error).toBeUndefined();
    expect(regRes.notice).toMatch(/check your email|confirm/i);
    expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringContaining('registered=1'));
  });

  it('[AUTH-SEC-02] registerClientAccountAction requires email verification (email_confirm=false) and omits onboarding_completed', async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: null });
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const signUpSpy = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'new-user-123',
          email: 'fresh@example.com',
          identities: [{ id: 'ident-1' }],
        },
        session: null,
      },
      error: null,
    });

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        signUp: signUpSpy,
        signInWithPassword: vi.fn(),
      },
    });
    const createUserSpy = vi.fn().mockResolvedValue({
      data: { user: { id: 'new-user-123' } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      auth: {
        admin: {
          createUser: createUserSpy,
          deleteUser: deleteUserSpy,
        },
      },
      from: vi.fn((table: string) => ({
        upsert: async (payload: Record<string, unknown>) => {
          upsertSpy(table, payload);
          return { error: table === 'client_profiles' ? { message: 'simulated failure' } : null };
        },
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      })),
    });

    const fd = new FormData();
    fd.set('full_name', 'Fresh Client');
    fd.set('email', 'fresh@example.com');
    fd.set('company_name', 'FreshCo');
    fd.set('password', 'StrongPass!1234');
    fd.set('confirm', 'StrongPass!1234');

    const res = await registerClientAccountAction({}, fd);
    expect(createUserSpy).not.toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }));
    expect(signUpSpy).toHaveBeenCalledTimes(1);
    const clientProfileCall = upsertSpy.mock.calls.find((c) => c[0] === 'client_profiles');
    if (clientProfileCall) {
      expect(clientProfileCall[1]).not.toHaveProperty('onboarding_completed');
    }
    expect(deleteUserSpy).toHaveBeenCalledWith('new-user-123');
    expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringContaining('/portal'));
    expect(res.notice || res.error).toBeTruthy();
  });

  it('[AUTH-SEC-03] PasswordChangeCard uses hardened changePasswordAction & recovery rejects missing amr', async () => {
    const cardSource = readFileSync(
      resolve(process.cwd(), 'components/panel/password-change-card.tsx'),
      'utf8'
    );
    expect(cardSource).toContain('changePasswordAction');
    expect(cardSource).not.toContain('changeAuthenticatedPasswordAction');
    expect(cardSource).toMatch(/name=["']currentPassword["']/);

    // Session recovery mode (?session=1) without recovery AMR claim must fail
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: 'user-1',
              aal: 'aal1',
              amr: [{ method: 'password', timestamp: 1 }],
              app_metadata: { role: 'client' },
            },
          },
          error: null,
        }),
        updateUser: vi.fn(),
      },
    });
    const fd = new FormData();
    fd.set('password', 'NewStrongPass!123');
    fd.set('confirm', 'NewStrongPass!123');
    const recoveryRes = await setNewPasswordFromRecoveryAction({}, fd);
    expect(recoveryRes.error).toMatch(/recovery|expired|sign in/i);
  });

  it('[AUTH-SEC-04] blocks cross-site GET /api/auth/logout CSRF subresource requests', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
    });
    const req = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'GET',
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
      },
    });
    const res = await logoutGet(req);
    expect(res.status).toBe(403);
  });

  it('[LIVE-CRASH-01] /portal/tickets uses only valid PostgreSQL ticket_category enum options', () => {
    const ticketsPage = readFileSync(
      resolve(process.cwd(), 'app/(client)/portal/tickets/page.tsx'),
      'utf8'
    );
    const categorySelectMatch = ticketsPage.match(/<select[^>]*name=["']category["'][\s\S]*?<\/select>/);
    expect(categorySelectMatch).not.toBeNull();
    const values = Array.from(categorySelectMatch![0].matchAll(/<option\s+value=["']([^"']+)["']/g)).map(
      (m) => m[1]
    );
    expect(values.length).toBeGreaterThanOrEqual(4);
    const allowed = new Set<string>(Constants.public.Enums.ticket_category);
    for (const val of values) {
      expect(allowed.has(val), `Invalid ticket_category option: ${val}`).toBe(true);
    }

    const clientProposalsPage = readFileSync(
      resolve(process.cwd(), 'app/(client)/portal/proposals/page.tsx'),
      'utf8'
    );
    expect(clientProposalsPage).toMatch(/\.neq\(\s*['"]status['"]\s*,\s*['"]draft['"]\s*\)/);
  });

  it('[LIVE-CRASH-02] hardens R2 attachment disposition, removes unsafe SVG uploads, and stops CMS field wipes', async () => {
    // 1. SVG removed from asset upload allowlists
    expect(ASSET_ALLOWED).not.toHaveProperty('svg');
    expect(ASSET_ALLOWED_EXT).not.toContain('svg');

    // 2. Payment proof rejects HTML/non-allowed MIME and stores sha256_checksum when valid
    mockGetCurrentSession.mockResolvedValue({
      userId: '22222222-2222-2222-2222-222222222222',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'invoices') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    code: 'INV-101',
                    client_id: '22222222-2222-2222-2222-222222222222',
                    order_id: null,
                    currency: 'USD',
                    fx_rate_to_usd: 1,
                    status: 'issued',
                    total_cents: 50000,
                    amount_paid_cents: 0,
                    credited_cents: 0,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
    const badMimeForm = new FormData();
    badMimeForm.set('invoice_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    badMimeForm.set('reference', 'WIRE-BAD-MIME');
    badMimeForm.set('amount_major', '100');
    badMimeForm.set('r2_key', 'private/22222222-2222-2222-2222-222222222222/payment_proof/evil.html');
    badMimeForm.set('filename', 'evil.html');
    badMimeForm.set('mime_type', 'text/html');
    badMimeForm.set('size_bytes', '512');
    await expect(submitInvoicePaymentProofAction(badMimeForm)).rejects.toThrow(/unsupported.*type|mime/i);

    // 3. Presign private GET uses ResponseContentDisposition: attachment
    const r2Source = readFileSync(resolve(process.cwd(), 'lib/r2.ts'), 'utf8');
    expect(r2Source).toContain('ResponseContentDisposition');
    expect(validateMagicBytes(Buffer.from('%PDF-1.4\n'), 'application/pdf')).toBe(true);
    expect(typeof isR2Configured).toBe('function');
    expect(typeof getPrivateObjectSize).toBe('function');
    expect(typeof presignPrivateGet).toBe('function');

    // 4. CMS silent overwrite protections: existing DB values preserved or accepted from form
    const adminOps: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mockGetCurrentSession.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => ({
        update: (payload: Record<string, unknown>) => {
          adminOps.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
        select: () => ({
          order: async () => ({
            data: table === 'portfolio_items' ? [{
              id: 'port-1', code: 'CS-999', slug: 'custom-case', pillar: 'cybersecurity',
              pillar_label: 'Cybersecurity', title: 'Custom Case', client_sector: 'Gov',
              year: '2026', headline_metric: 'Clean', summary: 'Sum', challenge: 'Chal',
              approach: [], outcomes: [], stack: [], related_service_slug: null,
              external_url: 'https://example.com', is_published: true, is_featured: true, sort_order: 1,
            }] : [],
            error: null,
          }),
        }),
      })),
    });

    const portFd = new FormData();
    portFd.set('id', 'port-1');
    portFd.set('title', 'Custom Case');
    portFd.set('slug', 'custom-case');
    await upsertPortfolioItemAction(portFd);
    expect(adminOps.find((o) => o.table === 'portfolio_items')?.payload).not.toHaveProperty('external_url');

    const pkgFd = new FormData();
    pkgFd.set('id', 'pkg-1');
    pkgFd.set('service_id', 'svc-1');
    pkgFd.set('tier_name', 'Enterprise');
    await upsertServicePackageAction(pkgFd);
    expect(adminOps.find((o) => o.table === 'service_packages')?.payload).not.toHaveProperty('deposit_percent');

    const resFd = new FormData();
    resFd.set('id', 'res-1');
    resFd.set('section', 'experience');
    resFd.set('title', 'Lead Researcher');
    await upsertResumeItemAction(resFd);
    expect(adminOps.find((o) => o.table === 'resume_items')?.payload).not.toHaveProperty('location');

    // Static fallback does not resurrect missing default slugs when DB already has portfolio items
    const livePortfolio = await getPublicPortfolioItems();
    expect(livePortfolio).toHaveLength(1);
    expect(livePortfolio[0].slug).toBe('custom-case');
  });
});
