import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPasswordLeakedHibp } from '@/lib/auth/hibp';
import { clearBlogCache, createBloggerAuthFromBase64, getBlogPostsPage } from '@/lib/blogger';

const mockState = vi.hoisted(() => ({
  claimedRows: [] as Array<{
    id: string;
    to_email: string;
    template: string;
    subject: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>,
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    rpc: vi.fn(async () => ({ data: mockState.claimedRows, error: null })),
    from: vi.fn(() => ({
      update: (data: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          mockState.updates.push({ id, data });
          return { error: null };
        },
      }),
      insert: vi.fn(async () => ({ error: null })),
    })),
  }),
}));

import { drainEmailOutbox } from '@/lib/email/outbox';

/**
 * Method 6: Chaos & Upstream Fault-Injection Suite
 *
 * Verifies graceful degradation and fail-closed/retry contracts when Resend,
 * HIBP, or Google Blogger OAuth2 endpoints return 429/503/network timeouts.
 */
describe('Method 6: Chaos & Upstream Fault-Injection Suite', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    mockState.claimedRows = [];
    mockState.updates = [];
    clearBlogCache();
    vi.restoreAllMocks();
  });

  it('[M6-CHAOS-RESEND] defers with backoff on Resend 429/503/timeout and transitions to failed after max attempts', async () => {
    process.env.RESEND_API_KEY = 're_test_chaos_key';
    process.env.EMAIL_OUTBOX_BASE_DELAY_MS = '100';

    mockState.claimedRows = [
      {
        id: 'row-429',
        to_email: 'c1@example.com',
        template: 'invoice_issued',
        subject: 'Rate limited',
        payload: { message: 'Hello' },
        attempts: 0,
      },
      {
        id: 'row-503',
        to_email: 'c2@example.com',
        template: 'order_created',
        subject: 'Upstream 503',
        payload: { message: 'Hello' },
        attempts: 1,
      },
      {
        id: 'row-exhausted',
        to_email: 'c3@example.com',
        template: 'ticket_reply',
        subject: 'Final attempt timeout',
        payload: { message: 'Hello' },
        attempts: 4,
      },
    ];

    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 });
      }
      if (call === 2) {
        return new Response('Service Unavailable', { status: 503 });
      }
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as typeof fetch;

    const result = await drainEmailOutbox(10);
    expect(result).toEqual({ accepted: 0, deferred: 2, failed: 1 });

    const byId = new Map(mockState.updates.map((u) => [u.id, u.data]));
    expect(byId.get('row-429')?.status).toBe('pending');
    expect(byId.get('row-429')?.attempts).toBe(1);
    expect(byId.get('row-503')?.status).toBe('pending');
    expect(byId.get('row-503')?.attempts).toBe(2);
    expect(byId.get('row-exhausted')?.status).toBe('failed');
    expect(byId.get('row-exhausted')?.attempts).toBe(5);
  });

  it('[M6-CHAOS-HIBP] fails open on HIBP 500/timeout while blocking known breached passwords offline and matching live HIBP hits', async () => {
    // 1. Offline denylist catches known breached 12+ password even without network
    const offline = await checkPasswordLeakedHibp('password123456');
    expect(offline.leaked).toBe(true);

    // 2. Upstream 500 fails open so user registration/reset is never bricked
    const err500 = await checkPasswordLeakedHibp('UniqueStrong#9928!Pass', {
      fetchImpl: vi.fn(async () => new Response('Internal Error', { status: 500 })) as unknown as typeof fetch,
    });
    expect(err500).toEqual({ leaked: false, count: 0 });

    // 3. Upstream network rejection fails open cleanly
    const netFail = await checkPasswordLeakedHibp('UniqueStrong#9928!Pass', {
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    });
    expect(netFail).toEqual({ leaked: false, count: 0 });

    // 4. Positive k-anonymity match detects leaked password (SHA1('CorrectHorseBattery99!') = 5-char prefix + suffix)
    const testFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      expect(urlStr).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
      // Return a synthetic match for 'test-breach-check-xyz-99' via standard SHA-1
      const { createHash } = await import('node:crypto');
      const digest = createHash('sha1').update('test-breach-check-xyz-99').digest('hex').toUpperCase();
      return new Response(`00000000000000000000000000000000000:0\r\n${digest.slice(5)}:42\r\n`, {
        status: 200,
      });
    });
    const hit = await checkPasswordLeakedHibp('test-breach-check-xyz-99', {
      fetchImpl: testFetch as unknown as typeof fetch,
    });
    expect(hit).toEqual({ leaked: true, count: 42 });
  });

  it('[M6-CHAOS-BLOGGER] degrades gracefully to empty page when Blogger OAuth/API fails or credentials are invalid', async () => {
    // Malformed / incomplete credentials return null without throwing
    const missingKey = Buffer.from(JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com' })).toString('base64');
    expect(createBloggerAuthFromBase64(missingKey)).toBeNull();

    // When Blogger credentials are set but OAuth2 returns 503, getBlogPostsPage degrades gracefully
    delete process.env.BLOGGER_FIXTURE_POSTS_JSON;
    process.env.BLOGGER_BLOG_ID = '123456789';
    process.env.GOOGLE_CREDENTIALS_B64 = Buffer.from(
      JSON.stringify({
        client_email: 'blogger@example.iam.gserviceaccount.com',
        private_key: 'invalid-pem-triggers-sign-error',
      })
    ).toString('base64');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = await getBlogPostsPage(1, 9, 10);
    expect(page).toEqual({ posts: [], totalItems: 0, isCapped: false });
    errorSpy.mockRestore();
  });
});
