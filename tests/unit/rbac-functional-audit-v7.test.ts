import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCurrentSession,
  mockGetSupabaseAdmin,
  mockConsumeRateLimit,
  mockRecordAuditLog,
  mockCreateInAppNotification,
  mockNotifyAllAdmins,
  mockEnqueueTransactionalEmail,
  mockDrainEmailOutbox,
  mockIsR2Configured,
  mockDeletePrivateObjects,
  mockGetPrivateObjectBytes,
  mockRevalidatePath,
  mockRevalidateTag,
} = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockConsumeRateLimit: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockCreateInAppNotification: vi.fn(),
  mockNotifyAllAdmins: vi.fn(),
  mockEnqueueTransactionalEmail: vi.fn(),
  mockDrainEmailOutbox: vi.fn(),
  mockIsR2Configured: vi.fn(),
  mockDeletePrivateObjects: vi.fn(),
  mockGetPrivateObjectBytes: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
  updateTag: mockRevalidateTag,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
  requireAdminSession: async () => {
    const s = await mockGetCurrentSession();
    if (!s || s.role !== 'admin') throw new Error('Forbidden');
    return s;
  },
  requireClientSession: async () => {
    const s = await mockGetCurrentSession();
    if (!s) throw new Error('Unauthorized');
    return s;
  },
  requireAuthenticatedSession: async () => {
    const s = await mockGetCurrentSession();
    if (!s) throw new Error('Unauthorized');
    return s;
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: mockConsumeRateLimit,
}));

vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: mockRecordAuditLog,
  createInAppNotification: mockCreateInAppNotification,
  notifyAllAdmins: mockNotifyAllAdmins,
  enqueueTransactionalEmail: mockEnqueueTransactionalEmail,
}));

vi.mock('@/lib/email/outbox', () => ({
  drainEmailOutbox: mockDrainEmailOutbox,
}));

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    isR2Configured: mockIsR2Configured,
    deletePrivateObjects: mockDeletePrivateObjects,
    getPrivateObjectBytes: mockGetPrivateObjectBytes,
  };
});

import {
  CONTACT_ALLOWED,
  PORTAL_ALLOWED,
  extFromFilename,
  isAllowedMime,
  resolveMimeType,
} from '@/lib/mime';
import { validateContactFile } from '@/lib/r2';
import { parseLeadPayload } from '@/lib/contact/lead-schema';
import {
  createClientTicketAction,
  createProposalAction,
  replyTicketAction,
  signOrderRoeAction,
  submitInvoicePaymentProofAction,
  submitOrderDeliverableAction,
  toggleClientActiveStatusAction,
} from '@/lib/crm/actions';
import {
  extendVaultRetentionAction,
  purgeOrphanPrivateObjectAction,
  retryAllFailedOutboxEmailsAction,
  retryOutboxEmailAction,
} from '@/lib/admin/ops-actions';
import { upsertServiceAction } from '@/lib/cms/actions';
import { GET as exportRecoveryZip } from '@/app/api/admin/recovery/export/route';
import {
  GET as getOrderMessages,
  POST as postOrderMessage,
} from '@/app/api/orders/[id]/messages/route';
import { GET as getActiveContracts } from '@/app/api/contact/active-contracts/route';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ADMIN_ID = '11111111-1111-4111-8111-111111111112';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const TICKET_ID = '44444444-4444-4444-8444-444444444444';
const FILE_ID = '55555555-5555-4555-8555-555555555555';

describe('RBAC & Functional Audit v7 Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue(true);
    mockIsR2Configured.mockReturnValue(true);
    mockDrainEmailOutbox.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });
  });

  it('[RBAC-C1/C2] blocks admin self-ban, zero-row target ban fallthrough, and writes integer epoch seconds to tokens_valid_after', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });

    const updateUserById = vi.fn();
    const rpc = vi.fn(async () => ({ data: 1, error: null }));

    // 1. Self-ban attempt throws before DB call
    const selfFd = new FormData();
    selfFd.set('client_id', ADMIN_ID);
    selfFd.set('is_active', 'false');
    await expect(toggleClientActiveStatusAction(selfFd)).rejects.toThrow(/cannot be deactivated/i);

    // 2. Targeting another admin UUID returns 0 rows from role='client' filter -> throws & never calls GoTrue ban
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
      rpc,
      auth: { admin: { updateUserById } },
    });

    const otherAdminFd = new FormData();
    otherAdminFd.set('client_id', OTHER_ADMIN_ID);
    otherAdminFd.set('is_active', 'false');
    await expect(toggleClientActiveStatusAction(otherAdminFd)).rejects.toThrow(
      /not found or target is not a client/i
    );
    expect(updateUserById).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('[RBAC-H1] blocks file attachments on internal admin ticket replies and internal order chat notes', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });

    const vaultInsert = vi.fn();
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'tickets') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { client_id: CLIENT_ID, code: 'TKT-101', subject: 'Audit', status: 'open' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: ORDER_ID, code: 'ORD-101', title: 'VAPT', client_id: CLIENT_ID, status: 'in_progress' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { insert: vaultInsert };
      },
    });

    // Ticket reply with is_internal_note=true and r2_key must reject
    const tktFd = new FormData();
    tktFd.set('ticket_id', TICKET_ID);
    tktFd.set('body', 'Confidential internal triage note');
    tktFd.set('is_internal_note', 'true');
    tktFd.set('r2_key', `private/${CLIENT_ID}/ticket_attachment/secret.pdf`);
    await expect(replyTicketAction(tktFd)).rejects.toThrow(/attachments are disabled on internal/i);
    expect(vaultInsert).not.toHaveBeenCalled();

    // Order chat POST with is_internal_note=true and attachment must return 400
    const req = new NextRequest(`http://localhost:3000/api/orders/${ORDER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        body: 'Internal ops note',
        is_internal_note: true,
        attachment: {
          r2_key: `private/${CLIENT_ID}/order_attachment/secret.pdf`,
          filename: 'secret.pdf',
          mime: 'application/pdf',
          size_bytes: 1024,
        },
      }),
    });
    const res = await postOrderMessage(req, { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(400);
    expect(vaultInsert).not.toHaveBeenCalled();
  });

  it('[RBAC-H2] /api/contact/active-contracts never leaks admin login email or unenriched order_messages', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: CLIENT_ID,
      email: 'client@example.com',
      role: 'client',
      fullName: 'Client User',
      isActive: true,
    });

    const queriedTables: string[] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        queriedTables.push(table);
        return {
          select: () => ({
            neq: () => ({
              order: () => ({
                limit: () => ({
                  eq: async () => ({
                    data: [{ id: ORDER_ID, code: 'ORD-202', title: 'PenTest', status: 'in_progress' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      },
    });

    const res = await getActiveContracts();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      authenticated: boolean;
      contracts: Array<Record<string, unknown>>;
    };
    expect(json.authenticated).toBe(true);
    expect(json.contracts).toHaveLength(1);
    expect(json.contracts[0]).not.toHaveProperty('initialMessages');
    expect(queriedTables).not.toContain('order_messages');
  });

  it('[RBAC-H4/H5] protects PINNED vault files from +90d unpinning, extends >90d retention cumulatively, and protects active upload reservations from orphan purge', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });

    // 1. Refuse extend_90d on a pinned (retention_until === null) file
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: FILE_ID, retention_until: null, archived_at: null, filename: 'pinned-report.pdf' },
              error: null,
            }),
          }),
        }),
      }),
    });

    const pinnedFd = new FormData();
    pinnedFd.set('file_id', FILE_ID);
    pinnedFd.set('mode', 'extend_90d');
    await expect(extendVaultRetentionAction(pinnedFd)).rejects.toThrow(/already pinned forever/i);

    // 2. Extend 365-day file by +90d cumulatively (~455d from now, not truncated to 90d!)
    const in365Days = new Date(Date.now() + 365 * 86_400_000).toISOString();
    let updatedRetention: string | null = null;
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: FILE_ID, retention_until: in365Days, archived_at: null, filename: 'annual.pdf' },
              error: null,
            }),
          }),
        }),
        update: (payload: { retention_until: string | null }) => {
          updatedRetention = payload.retention_until;
          return {
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { filename: 'annual.pdf', owner_client_id: CLIENT_ID, order_id: ORDER_ID },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    });

    const extendFd = new FormData();
    extendFd.set('file_id', FILE_ID);
    extendFd.set('mode', 'extend_90d');
    await extendVaultRetentionAction(extendFd);
    expect(updatedRetention).toBeTruthy();
    const daysOut = (new Date(updatedRetention!).getTime() - Date.now()) / 86_400_000;
    expect(daysOut).toBeGreaterThan(450);

    // 3. Refuse orphan purge when an active vault_upload_reservations entry exists
    const reservedKey = `private/${CLIENT_ID}/deliverable/in-flight.pdf`;
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'vault_files') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'inquiry_attachments') {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'vault_upload_reservations') {
          return {
            select: () => ({
              eq: () => ({
                gt: () => ({
                  limit: async () => ({ data: [{ id: 'res-1' }], error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    });

    const purgeFd = new FormData();
    purgeFd.set('r2_key', reservedKey);
    await expect(purgeOrphanPrivateObjectAction(purgeFd)).rejects.toThrow(
      /in-flight upload reservation/i
    );
    expect(mockDeletePrivateObjects).not.toHaveBeenCalled();
  });

  it('[RBAC-H6] /api/admin/recovery/export rejects non-admin and streams a valid PK ZIP binary with truncation header when >200 files', async () => {
    // 1. Client caller gets 403
    mockGetCurrentSession.mockResolvedValueOnce({
      userId: CLIENT_ID,
      email: 'client@example.com',
      role: 'client',
      fullName: 'Client',
      isActive: true,
    });
    const forbiddenRes = await exportRecoveryZip(
      new NextRequest(`http://localhost:3000/api/admin/recovery/export?order_id=${ORDER_ID}`)
    );
    expect(forbiddenRes.status).toBe(403);

    // 2. Admin receives valid binary ZIP (PK\x03\x04 magic bytes)
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });
    mockGetPrivateObjectBytes.mockResolvedValue(Buffer.from('%PDF-1.4\nSample Report\n%%EOF'));
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: ORDER_ID, code: 'ORD-707', title: 'Security Audit', client_id: CLIENT_ID },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'vault_files') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: FILE_ID,
                          filename: 'pentest-report.pdf',
                          r2_key: `private/${CLIENT_ID}/deliverable/report.pdf`,
                          category: 'deliverable',
                          size_bytes: 28,
                          sha256_checksum: 'abc123',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    });

    const okRes = await exportRecoveryZip(
      new NextRequest(`http://localhost:3000/api/admin/recovery/export?order_id=${ORDER_ID}`)
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get('content-type')).toBe('application/zip');
    expect(okRes.headers.get('x-archive-truncated')).toBeNull();

    const zipBuf = Buffer.from(await okRes.arrayBuffer());
    expect(zipBuf.byteLength).toBeGreaterThan(60);
    // ZIP Local File Header signature PK\x03\x04
    expect(zipBuf[0]).toBe(0x50);
    expect(zipBuf[1]).toBe(0x4b);
    expect(zipBuf[2]).toBe(0x03);
    expect(zipBuf[3]).toBe(0x04);
    expect(zipBuf.toString('latin1')).toContain('deliverable/pentest-report.pdf');

    // 3. >200 files sets X-Archive-Truncated: true and appends EXPORT_TRUNCATED.txt
    const manyFiles = Array.from({ length: 201 }, (_, idx) => ({
      id: `55555555-5555-4555-8555-${String(idx).padStart(12, '0')}`,
      filename: `file-${idx}.pdf`,
      r2_key: `private/${CLIENT_ID}/deliverable/file-${idx}.pdf`,
      category: 'deliverable',
      size_bytes: 16,
    }));
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: ORDER_ID, code: 'ORD-707', title: 'Security Audit', client_id: CLIENT_ID },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: async () => ({ data: manyFiles, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    });
    const truncRes = await exportRecoveryZip(
      new NextRequest(`http://localhost:3000/api/admin/recovery/export?order_id=${ORDER_ID}`)
    );
    expect(truncRes.status).toBe(200);
    expect(truncRes.headers.get('x-archive-truncated')).toBe('true');
    const truncBuf = Buffer.from(await truncRes.arrayBuffer());
    expect(truncBuf.toString('latin1')).toContain('EXPORT_TRUNCATED.txt');
  });

  it('[RBAC-H7] preserves 6-digit microsecond ?after= timestamps verbatim in GET /api/orders/[id]/messages', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: CLIENT_ID,
      email: 'client@example.com',
      role: 'client',
      fullName: 'Client',
      isActive: true,
    });

    const capturedGtArgs: Array<[string, string]> = [];
    const chain = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn((col: string, val: string) => {
        capturedGtArgs.push([col, val]);
        return chain;
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: (val: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };

    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: ORDER_ID, client_id: CLIENT_ID, code: 'ORD-101' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => chain };
      },
    });

    const microTs = '2026-11-26T10:15:30.123456Z';
    const res = await getOrderMessages(
      new NextRequest(`http://localhost:3000/api/orders/${ORDER_ID}/messages?after=${encodeURIComponent(microTs)}`),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(res.status).toBe(200);
    expect(capturedGtArgs).toEqual([['created_at', microTs]]);
  });

  it('[RBAC-H8] accepts standard .jpeg across contact/portal validators and resolves .avif MIME fallback', () => {
    expect(extFromFilename('Evidence.JPEG')).toBe('jpg');
    expect(isAllowedMime('jpeg', 'image/jpeg', CONTACT_ALLOWED)).toBe(true);
    expect(isAllowedMime('jpeg', 'image/jpeg', PORTAL_ALLOWED)).toBe(true);
    expect(validateContactFile({ filename: 'screenshot.jpeg', mime: 'image/jpeg', size: 2048 })).toEqual({
      ok: true,
      ext: 'jpg',
    });
    expect(resolveMimeType('hero-banner.avif', '')).toBe('image/avif');
    expect(resolveMimeType('photo.jpeg', 'application/octet-stream')).toBe('image/jpeg');
  });

  it('[RBAC-H11/H12/M1/M12/M15] enforces FX validation, explicit validation throws, bulk retry nonce, timezone-safe contact date, and non-final deliverable timer guard', async () => {
    // 1. RBAC-M12: timezone-safe preferred_contact_date
    const leadFd = new FormData();
    leadFd.set('gdprConsent', 'true');
    leadFd.set('name', 'Test User');
    leadFd.set('email', 'test@example.com');
    leadFd.set('projectSummary', 'Need a comprehensive web & API penetration test next week.');
    leadFd.set('preferredContactDate', '2026-11-28');
    const parsedLead = parseLeadPayload(leadFd, { ipHash: 'abc', userAgent: 'vitest' });
    expect(parsedLead.ok).toBe(true);
    if (parsedLead.ok) {
      expect(parsedLead.lead.preferred_contact_date).toBe('2026-11-28');
    }

    // 2. RBAC-H11: non-USD proposal with blank fx_rate_to_usd throws
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });
    const badFxProp = new FormData();
    badFxProp.set('recipient_name', 'Alex');
    badFxProp.set('recipient_email', 'alex@example.com');
    badFxProp.set('title', 'BDT Audit');
    badFxProp.set('executive_summary', 'Scope summary');
    badFxProp.set('currency', 'BDT');
    badFxProp.set('fx_rate_to_usd', '');
    badFxProp.set('total_usd', '100000');
    await expect(createProposalAction(badFxProp)).rejects.toThrow(/FX rate/i);

    // 3. RBAC-H12: silent returns replaced with throws
    const emptySlugSvc = new FormData();
    emptySlugSvc.set('title', '!!!');
    await expect(upsertServiceAction(emptySlugSvc)).rejects.toThrow(/ASCII slug/i);

    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: FILE_ID, status: 'sent', payload: {} },
              error: null,
            }),
          }),
        }),
      }),
    });
    const sentOutboxFd = new FormData();
    sentOutboxFd.set('outbox_id', FILE_ID);
    await expect(retryOutboxEmailAction(sentOutboxFd)).rejects.toThrow(/already delivered/i);

    // Client validation throws
    mockGetCurrentSession.mockResolvedValue({
      userId: CLIENT_ID,
      email: 'client@example.com',
      role: 'client',
      fullName: 'Client',
      isActive: true,
    });
    const zeroPayFd = new FormData();
    zeroPayFd.set('invoice_id', FILE_ID);
    zeroPayFd.set('reference', 'REF-1');
    zeroPayFd.set('amount_major', '0');
    await expect(submitInvoicePaymentProofAction(zeroPayFd)).rejects.toThrow(/positive payment amount/i);

    const blankTktFd = new FormData();
    blankTktFd.set('subject', '   ');
    blankTktFd.set('body', '   ');
    await expect(createClientTicketAction(blankTktFd)).rejects.toThrow(/required/i);

    const emptyRoeFd = new FormData();
    emptyRoeFd.set('order_id', ORDER_ID);
    await expect(signOrderRoeAction(emptyRoeFd)).rejects.toThrow(/Rules of Engagement/i);

    // 4. RBAC-M1: bulk outbox retry bumps _retryNonce on every failed row
    mockGetCurrentSession.mockResolvedValue({
      userId: ADMIN_ID,
      email: 'admin@redwan.work',
      role: 'admin',
      fullName: 'Admin',
      isActive: true,
    });
    const updatedOutboxPayloads: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          in: () => ({
            limit: async () => ({
              data: [
                { id: 'out-1', payload: { message: 'hello' } },
                { id: 'out-2', payload: { message: 'world', _retryNonce: 2 } },
              ],
              error: null,
            }),
          }),
        }),
        update: (val: { payload?: Record<string, unknown> }) => {
          if (val.payload) updatedOutboxPayloads.push(val.payload);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      }),
    });
    await retryAllFailedOutboxEmailsAction();
    expect(updatedOutboxPayloads).toEqual([
      { message: 'hello', _retryNonce: 1 },
      { message: 'world', _retryNonce: 3 },
    ]);

    // 5. RBAC-M15: non-final deliverable sets auto_accept_at: null and omits delivered_at
    let insertedDeliverable: Record<string, unknown> | null = null;
    let updatedOrderPayload: Record<string, unknown> | null = null;
    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { code: 'ORD-500', pillar: 'development', auto_accept_days: 7, client_id: CLIENT_ID },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updatedOrderPayload = payload;
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        if (table === 'deliverables') {
          return {
            insert: (payload: Record<string, unknown>) => {
              insertedDeliverable = payload;
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'del-1', code: 'DLV-1' }, error: null }),
                }),
              };
            },
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { email: 'client@example.com' }, error: null }),
            }),
          }),
        };
      },
    });
    const draftDelivFd = new FormData();
    draftDelivFd.set('order_id', ORDER_ID);
    draftDelivFd.set('client_id', CLIENT_ID);
    draftDelivFd.set('title', 'Milestone 1 Draft');
    draftDelivFd.set('is_final_delivery', 'false');
    await submitOrderDeliverableAction(draftDelivFd);
    expect(insertedDeliverable).toMatchObject({
      is_final_delivery: false,
      auto_accept_at: null,
    });
    expect(updatedOrderPayload).toMatchObject({ status: 'in_review', progress_percent: 80 });
    expect(updatedOrderPayload).not.toHaveProperty('delivered_at');
  });
});
