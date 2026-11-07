import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentSession = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock('@/lib/crm/audit', () => ({
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
  recordAuditLog: vi.fn(),
}));

import {
  acceptProposalClientAction,
  createClientTicketAction,
  signOrderRoeAction,
  submitClientReviewAction,
  submitInvoicePaymentProofAction,
} from '@/lib/crm/actions';

describe('CRM Server Action Trust Boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents an admin from signing a client Rules of Engagement legal attestation', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
    });

    const fd = new FormData();
    fd.set('order_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    fd.set('authorized_targets', 'app.client.example');
    fd.set('emergency_contact_name', 'SecOps Lead');
    fd.set('emergency_contact_phone', '+15550100');
    fd.set('signer_full_name', 'Client Signer');
    fd.set('ownership_attested', 'on');

    await expect(signOrderRoeAction(fd)).rejects.toThrow(/client/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('prevents submitting a client review for another client order or an incomplete order', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: '33333333-3333-3333-3333-333333333333',
      email: 'clientb@disposable.test',
      fullName: 'Client B',
      role: 'client',
    });

    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  client_id: '22222222-2222-2222-2222-222222222222',
                  status: 'in_progress',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'client_reviews') {
        return { upsert: upsertSpy };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const fd = new FormData();
    fd.set('order_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    fd.set('rating_overall', '5');
    fd.set('review_text', 'Spoofed review attempt');

    await expect(submitClientReviewAction(fd)).rejects.toThrow(/forbidden|completed/i);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('prevents creating a support ticket linked to another client order', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: '33333333-3333-3333-3333-333333333333',
      email: 'clientb@disposable.test',
      fullName: 'Client B',
      role: 'client',
    });

    const insertSpy = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  client_id: '22222222-2222-2222-2222-222222222222',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tickets') {
        return { insert: insertSpy };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const fd = new FormData();
    fd.set('subject', 'Need help');
    fd.set('body', 'Attaching foreign order_id');
    fd.set('order_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    await expect(createClientTicketAction(fd)).rejects.toThrow(/forbidden/i);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('prevents R2 key prefix hijack in submitInvoicePaymentProofAction', async () => {
    const clientAId = '22222222-2222-2222-2222-222222222222';
    mockGetCurrentSession.mockResolvedValue({
      userId: clientAId,
      email: 'clienta@disposable.test',
      fullName: 'Client A',
      role: 'client',
    });

    const vaultInsertSpy = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  code: 'INV-2026-0001',
                  client_id: clientAId,
                  order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  currency: 'USD',
                  fx_rate_to_usd: 1,
                  status: 'issued',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'vault_files') {
        return { insert: vaultInsertSpy };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const fd = new FormData();
    fd.set('invoice_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    fd.set('reference', 'WIRE-12345');
    fd.set('amount_major', '500');
    fd.set('r2_key', 'private/33333333-3333-3333-3333-333333333333/deliverable/secret.pdf');
    fd.set('filename', 'receipt.pdf');
    fd.set('size_bytes', '1024');

    await expect(submitInvoicePaymentProofAction(fd)).rejects.toThrow(/prefix|forbidden|invalid/i);
    expect(vaultInsertSpy).not.toHaveBeenCalled();
  });

  it('redirects to order detail from JSONB { order_id } returned by accept_proposal_and_create_order', async () => {
    mockGetCurrentSession.mockResolvedValue({
      userId: '22222222-2222-2222-2222-222222222222',
      email: 'clienta@disposable.test',
      fullName: 'Client A',
      role: 'client',
    });
    mockRpc.mockResolvedValue({
      data: {
        order_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        deposit_invoice_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'awaiting_payment',
      },
      error: null,
    });

    const fd = new FormData();
    fd.set('proposal_id', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

    await expect(acceptProposalClientAction(fd)).rejects.toThrow(
      'NEXT_REDIRECT:/portal/orders/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
  });
});
