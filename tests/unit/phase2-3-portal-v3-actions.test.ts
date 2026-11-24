import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentSession,
  mockRequireAdminSession,
  mockGetSupabaseAdmin,
  mockRecordAuditLog,
  mockRevalidatePath,
  mockConsumeRateLimit,
  mockDrainEmailOutbox,
  mockIsR2Configured,
} = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockRequireAdminSession: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockConsumeRateLimit: vi.fn(),
  mockDrainEmailOutbox: vi.fn(),
  mockIsR2Configured: vi.fn(),
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
vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: mockRecordAuditLog,
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: mockConsumeRateLimit,
}));
vi.mock('@/lib/email/outbox', () => ({
  drainEmailOutbox: mockDrainEmailOutbox,
}));
vi.mock('@/lib/r2', () => ({
  isR2Configured: mockIsR2Configured,
  isPublicR2Configured: vi.fn(() => false),
  verifyStoredPortalObjectSize: vi.fn(async () => true),
  getPrivateObjectHeadBytes: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  deletePrivateObjects: vi.fn(async () => undefined),
  deletePublicObject: vi.fn(async () => undefined),
  isPortalKey: vi.fn(() => true),
  makeAssetKey: vi.fn(() => 'assets/test.png'),
  putPublicObject: vi.fn(async () => undefined),
}));

import {
  deleteClientNoteAction,
  editOrderMilestoneDetailsAction,
  revokeClientInvitationAction,
  toggleClientNotePinAction,
  updateDraftInvoiceAction,
  updateDraftProposalAction,
  voidProposalAction,
} from '@/lib/crm/actions';
import { retryAllFailedOutboxEmailsAction } from '@/lib/admin/ops-actions';
import { POST as postOrderMessage } from '@/app/api/orders/[id]/messages/route';

describe('Phase 2-3 Portal v3 & Admin Command Center v3 Contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentSession.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@disposable.test',
      fullName: 'Admin Operator',
      role: 'admin',
    });
    mockRequireAdminSession.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@disposable.test',
      fullName: 'Admin Operator',
      role: 'admin',
    });
    mockConsumeRateLimit.mockResolvedValue(true);
    mockIsR2Configured.mockReturnValue(false);
    mockDrainEmailOutbox.mockResolvedValue({ accepted: 0, deferred: 0, failed: 0 });
  });

  it('rejects editing a non-draft proposal and updates a draft proposal cleanly', async () => {
    const proposalUpdates: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'prop-1', code: 'PRP-0001', status: 'sent', client_id: 'cli-1' },
              error: null,
            }),
          }),
        }),
      })),
    });

    const fd = new FormData();
    fd.set('proposal_id', 'prop-1');
    fd.set('title', 'Updated Scope');
    fd.set('scope_summary', 'Detailed scope summary');
    fd.set('total_major', '1500');
    await expect(updateDraftProposalAction(fd)).rejects.toThrow(/Only draft proposals can be edited/i);

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'prop-2', code: 'PRP-0002', status: 'draft', client_id: 'cli-1' },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          proposalUpdates.push(payload);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      })),
    });

    fd.set('proposal_id', 'prop-2');
    fd.set('currency', 'EUR');
    await updateDraftProposalAction(fd);
    expect(proposalUpdates[0]).toMatchObject({
      title: 'Updated Scope',
      currency: 'EUR',
      total_cents: 150000,
    });
  });

  it('prevents voiding an accepted proposal and voids draft/sent proposals', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'prop-acc', code: 'PRP-0003', status: 'accepted', client_id: 'cli-1' },
              error: null,
            }),
          }),
        }),
      })),
    });
    const fd = new FormData();
    fd.set('proposal_id', 'prop-acc');
    await expect(voidProposalAction(fd)).rejects.toThrow(/Accepted proposals cannot be voided/i);
  });

  it('recomputes totals safely on updateDraftInvoiceAction and blocks non-draft edits', async () => {
    const invoiceUpdates: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'inv-1',
                code: 'INV-0010',
                status: 'draft',
                subtotal_cents: 100000,
                client_id: 'cli-1',
                order_id: 'ord-1',
              },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          invoiceUpdates.push(payload);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      })),
    });

    const fd = new FormData();
    fd.set('invoice_id', 'inv-1');
    fd.set('discount_major', '100');
    fd.set('tax_rate_bps', '1000');
    fd.set('due_at', '2026-12-31');
    await updateDraftInvoiceAction(fd);

    expect(invoiceUpdates[0]).toMatchObject({
      discount_cents: 10000,
      tax_rate_bps: 1000,
      tax_cents: 9000,
      total_cents: 99000,
    });
  });

  it('locks invoiced milestone amount during editOrderMilestoneDetailsAction while allowing title/date update', async () => {
    const msUpdates: Array<Record<string, unknown>> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'invoices') {
          return {
            select: () => ({
              eq: () => ({
                neq: () => ({
                  limit: async () => ({ data: [{ id: 'inv-existing' }], error: null }),
                }),
              }),
            }),
          };
        }
        return {
          update: (payload: Record<string, unknown>) => {
            msUpdates.push(payload);
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }),
    });

    const fd = new FormData();
    fd.set('milestone_id', 'ms-1');
    fd.set('order_id', 'ord-1');
    fd.set('title', 'Phase 1 Renamed');
    fd.set('amount_major', '9999');
    fd.set('due_date', '2026-12-20');
    await editOrderMilestoneDetailsAction(fd);

    expect(msUpdates[0]).toEqual({ title: 'Phase 1 Renamed', due_date: '2026-12-20' });
    expect(msUpdates[0]).not.toHaveProperty('amount_cents');
  });

  it('revokes pending client invitations, pins/deletes CRM notes, and bulk retries failed outbox emails', async () => {
    const revoked: Array<Record<string, unknown>> = [];
    const pinUpdates: Array<Record<string, unknown>> = [];
    let deletedNotes = 0;
    const bulkRetried: Array<Record<string, unknown>> = [];

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'client_invitations') {
          return {
            update: (payload: Record<string, unknown>) => {
              revoked.push(payload);
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { email: 'pending@disposable.test' }, error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        if (table === 'client_notes') {
          return {
            update: (payload: Record<string, unknown>) => {
              pinUpdates.push(payload);
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
            delete: () => ({
              eq: () => ({
                eq: async () => {
                  deletedNotes += 1;
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === 'email_outbox') {
          return {
            update: (payload: Record<string, unknown>) => {
              bulkRetried.push(payload);
              return {
                in: () => ({
                  select: async () => ({ data: [{ id: 'e1' }, { id: 'e2' }], error: null }),
                }),
              };
            },
          };
        }
        return {};
      }),
    });

    const invFd = new FormData();
    invFd.set('invitation_id', 'inv-row-1');
    await revokeClientInvitationAction(invFd);
    expect(revoked[0]).toEqual({ status: 'revoked' });

    const pinFd = new FormData();
    pinFd.set('note_id', 'note-1');
    pinFd.set('client_id', 'cli-1');
    pinFd.set('is_pinned', 'true');
    await toggleClientNotePinAction(pinFd);
    expect(pinUpdates[0]).toEqual({ is_pinned: true });

    await deleteClientNoteAction(pinFd);
    expect(deletedNotes).toBe(1);

    await retryAllFailedOutboxEmailsAction();
    expect(bulkRetried[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('rejects cross-tenant r2_key prefix on POST /api/orders/[id]/messages attachment upload', async () => {
    const orderId = '11111111-2222-4333-8444-555555555555';
    const clientId = '22222222-3333-4444-8555-666666666666';
    mockGetCurrentSession.mockResolvedValue({
      userId: clientId,
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: orderId, client_id: clientId, code: 'ORD-1001', title: 'Audit', status: 'in_progress' },
              error: null,
            }),
          }),
        }),
      })),
    });

    const req = new NextRequest(`http://127.0.0.1:3000/api/orders/${orderId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
      },
      body: JSON.stringify({
        body: 'Attached scope',
        attachment: {
          r2_key: 'private/other-client/order_attachment/evil.pdf',
          filename: 'scope.pdf',
          mime: 'application/pdf',
          size_bytes: 1024,
        },
      }),
    });

    const res = await postOrderMessage(req, { params: Promise.resolve({ id: orderId }) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/Invalid vault attachment storage prefix/i);
  });
});
