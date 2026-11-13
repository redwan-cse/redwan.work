import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentSession = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockIsR2Configured = vi.fn();
const mockPresignPrivatePut = vi.fn();
const mockDeletePrivateObjects = vi.fn();
const mockListPrivateContactObjects = vi.fn();
const mockListPrivateVaultObjects = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    isR2Configured: () => mockIsR2Configured(),
    presignPrivatePut: (...args: unknown[]) => mockPresignPrivatePut(...args),
    deletePrivateObjects: (...args: unknown[]) => mockDeletePrivateObjects(...args),
    listPrivateContactObjects: () => mockListPrivateContactObjects(),
    listPrivateVaultObjects: () => mockListPrivateVaultObjects(),
  };
});

import { drainEmailOutbox, escapeHtml, renderOutboxHtml } from '@/lib/email/outbox';
import { GET as getEmailOutboxCron } from '@/app/api/cron/email-outbox/route';
import { GET as getR2RetentionCron } from '@/app/api/cron/r2-retention/route';
import { POST as postPortalPresign } from '@/app/api/uploads/portal-presign/route';

describe('Outbox HTML Escaping, Idempotency Header, Cron GET Verbs & Retention/Presign Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret-value';
    process.env.RESEND_API_KEY = 're_disposable_test_key';
    process.env.RESEND_API_BASE_URL = 'http://127.0.0.1:19999';
  });

  it('escapes untrusted HTML in email templates, strips javascript: URLs, and sends Idempotency-Key', async () => {
    expect(escapeHtml(`<script>alert("xss")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );

    const html = renderOutboxHtml({
      subject: 'Invoice <img src=x onerror=alert(1)>',
      payload: {
        message: 'Hello <b>Client</b>',
        actionUrl: 'javascript:alert(1)',
      },
    });
    expect(html).toContain('Invoice &lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Hello &lt;b&gt;Client&lt;/b&gt;');
    expect(html).not.toContain('javascript:alert(1)');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'resend-msg-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const outboxUpdateSpy = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const emailLogInsertSpy = vi.fn(async () => ({ error: null }));

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            id: 'outbox-uuid-1',
            to_email: 'client@disposable.test',
            subject: 'Proposal Ready',
            template: 'proposal_sent',
            payload: { message: 'Ready for review', actionUrl: 'http://127.0.0.1:3000/portal' },
            attempts: 0,
            entity_type: 'proposal',
            entity_id: null,
          },
        ],
        error: null,
      })),
      from: (table: string) => {
        if (table === 'email_outbox') return { update: outboxUpdateSpy };
        if (table === 'email_log') return { insert: emailLogInsertSpy };
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const req = new NextRequest('http://127.0.0.1:3000/api/cron/email-outbox', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-cron-secret-value' },
    });
    const res = await getEmailOutboxCron(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accepted).toBe(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, fetchInit] = fetchSpy.mock.calls[0];
    const headers = fetchInit?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('outbox-outbox-uuid-1');
    fetchSpy.mockRestore();
  });

  it('retries failed outbox sends with exponential backoff and transitions >=5 attempts to failed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Upstream 503' }), { status: 503 })
    );

    let capturedUpdate: Record<string, unknown> | null = null;
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            id: 'outbox-uuid-retry',
            to_email: 'client@disposable.test',
            subject: 'Retry Test',
            template: 'invoice_issued',
            payload: { message: 'Retry me' },
            attempts: 1,
            entity_type: null,
            entity_id: null,
          },
        ],
        error: null,
      })),
      from: (table: string) => {
        if (table === 'email_outbox') {
          return {
            update: (u: Record<string, unknown>) => {
              capturedUpdate = u;
              return { eq: vi.fn(async () => ({ error: null })) };
            },
          };
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      },
    });

    const res = await drainEmailOutbox(5);
    expect(res).toEqual({ accepted: 0, deferred: 1, failed: 0 });
    expect(capturedUpdate).toMatchObject({
      status: 'pending',
      attempts: 2,
      locked_at: null,
    });
    fetchSpy.mockRestore();
  });

  it('queries real retention_until & archived_at columns in r2-retention GET cron and blocks client deliverable presign', async () => {
    mockIsR2Configured.mockReturnValue(true);
    mockDeletePrivateObjects.mockResolvedValue(1);
    mockListPrivateContactObjects.mockResolvedValue([]);
    mockListPrivateVaultObjects.mockResolvedValue([]);

    let archivedUpdatePayload: Record<string, unknown> | null = null;

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async () => ({ data: 2, error: null })),
      from: (table: string) => {
        if (table === 'vault_files') {
          return {
            select: (cols: string) => {
              expect(cols).not.toContain('retained');
              expect(cols).not.toContain('deleted_from_r2_at');
              return {
                is: (col: string) => {
                  expect(col).toBe('archived_at');
                  return {
                    not: () => ({
                      lt: (ltCol: string) => {
                        expect(ltCol).toBe('retention_until');
                        return {
                          limit: async () => ({
                            data: [
                              {
                                id: 'vf-1',
                                r2_key: 'private/00000000-0000-0000-0000-000000000001/deliverable/old.pdf',
                                owner_client_id: '00000000-0000-0000-0000-000000000001',
                                order_id: null,
                              },
                            ],
                            error: null,
                          }),
                        };
                      },
                    }),
                  };
                },
              };
            },
            update: (u: Record<string, unknown>) => {
              archivedUpdatePayload = u;
              return { in: async () => ({ error: null }) };
            },
          };
        }
        if (table === 'inquiry_attachments') {
          return {
            select: () => ({
              eq: () => ({
                lt: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const cronReq = new NextRequest('http://127.0.0.1:3000/api/cron/r2-retention', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-cron-secret-value' },
    });
    const cronRes = await getR2RetentionCron(cronReq);
    expect(cronRes.status).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody).toMatchObject({
      ok: true,
      autoAcceptedDeliverables: 2,
      deletedVaultFiles: 1,
    });
    expect(archivedUpdatePayload).toHaveProperty('archived_at');

    // Client attempting to presign 'deliverable' category must get 403 Forbidden
    mockGetCurrentSession.mockResolvedValue({
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
      aal: 'aal1',
    });
    mockConsumeRateLimit.mockResolvedValue(true);

    const presignReq = new NextRequest('http://127.0.0.1:3000/api/uploads/portal-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3000',
        Host: '127.0.0.1:3000',
      },
      body: JSON.stringify({
        filename: 'report.pdf',
        mime: 'application/pdf',
        size: 2048,
        category: 'deliverable',
      }),
    });
    const presignRes = await postPortalPresign(presignReq);
    expect(presignRes.status).toBe(403);
  });

  it('aborts orphan contact sweep on DB error without deleting retained R2 objects and fails closed on portal-presign quota error', async () => {
    mockIsR2Configured.mockReturnValue(true);
    mockDeletePrivateObjects.mockResolvedValue(0);
    const oldDate = new Date(Date.now() - 120 * 86_400_000);
    mockListPrivateContactObjects.mockResolvedValue([
      { key: 'contact/2026/05/retained-doc.pdf', lastModified: oldDate },
    ]);
    mockListPrivateVaultObjects.mockResolvedValue([]);

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async () => ({ data: 0, error: null })),
      from: (table: string) => {
        if (table === 'vault_files') {
          return {
            select: () => ({
              is: () => ({
                not: () => ({
                  lt: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'inquiry_attachments') {
          return {
            select: () => ({
              eq: () => ({
                lt: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
              in: async () => ({ data: null, error: { message: 'DB unavailable' } }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const cronReq = new NextRequest('http://127.0.0.1:3000/api/cron/r2-retention', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-cron-secret-value' },
    });
    const cronRes = await getR2RetentionCron(cronReq);
    expect(cronRes.status).toBe(503);
    expect(mockDeletePrivateObjects).not.toHaveBeenCalled();

    // Cross-origin portal-presign must return 403
    mockGetCurrentSession.mockResolvedValue({
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
      aal: 'aal1',
    });
    mockConsumeRateLimit.mockResolvedValue(true);

    const crossOriginReq = new NextRequest('http://127.0.0.1:3000/api/uploads/portal-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
        Host: '127.0.0.1:3000',
      },
      body: JSON.stringify({
        filename: 'proof.pdf',
        mime: 'application/pdf',
        size: 1024,
        category: 'payment_proof',
      }),
    });
    const crossOriginRes = await postPortalPresign(crossOriginReq);
    expect(crossOriginRes.status).toBe(403);

    // Same-origin portal-presign with DB error on vault_files quota query must return 503 (fail closed)
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: async () => ({ data: null, error: { message: 'DB timeout' } }),
          }),
        }),
      }),
    });
    const dbFailReq = new NextRequest('http://127.0.0.1:3000/api/uploads/portal-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:3000',
        Host: '127.0.0.1:3000',
      },
      body: JSON.stringify({
        filename: 'proof.pdf',
        mime: 'application/pdf',
        size: 1024,
        category: 'payment_proof',
      }),
    });
    const dbFailRes = await postPortalPresign(dbFailReq);
    expect(dbFailRes.status).toBe(503);
  });
});
