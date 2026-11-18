import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentSession = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
  requireAdminSession: async () => {
    const s = await mockGetCurrentSession();
    if (!s || s.role !== 'admin') throw new Error('Unauthorized: Admin AAL2 session required.');
    return s;
  },
  requireClientSession: async () => {
    const s = await mockGetCurrentSession();
    if (!s || s.role !== 'client') throw new Error('Unauthorized: Client session required.');
    return s;
  },
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
  acceptOrderNdaAction,
  createPaidRevisionInvoiceAction,
  declineProposalClientAction,
  issueCreditNoteAction,
  renewRetainerCycleAction,
  resolveCancellationRequestAction,
  submitCancellationRequestAction,
} from '@/lib/crm/actions';

describe('Phase 2 Compact 8-Hub Admin UI, Invoice Math, Retainers CTA & Lifecycle Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[P2-ACTIONS-TRUST] exposes full lifecycle Server Actions returning ActionState or routing to atomic RPCs with role checks', async () => {
    // 1. Client cannot issue credit note or renew retainer cycle
    mockGetCurrentSession.mockResolvedValue({
      userId: 'client-1',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
    });

    const cnFd = new FormData();
    cnFd.set('invoice_id', 'inv-1');
    cnFd.set('amount_major', '50');
    cnFd.set('reason', 'Courtesy credit');
    await expect(issueCreditNoteAction(cnFd)).rejects.toThrow(/admin|unauthorized/i);

    const renFd = new FormData();
    renFd.set('retainer_id', 'ret-1');
    await expect(renewRetainerCycleAction(renFd)).rejects.toThrow(/admin|unauthorized/i);

    // 2. Client can accept NDA, decline proposal, submit cancellation request
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'ord-1', code: 'ORD-101', client_id: 'client-1', status: 'in_progress' },
            error: null,
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'cancel-1' }, error: null }),
        }),
      }),
    }));

    const ndaFd = new FormData();
    ndaFd.set('order_id', 'ord-1');
    await acceptOrderNdaAction(ndaFd);
    expect(mockRpc).toHaveBeenCalledWith('accept_order_nda_atomic', {
      p_order_id: 'ord-1',
      p_actor_id: 'client-1',
    });

    const decFd = new FormData();
    decFd.set('proposal_id', 'prop-1');
    decFd.set('decline_reason', 'Different timeline');
    await declineProposalClientAction(decFd);
    expect(mockRpc).toHaveBeenCalledWith('decline_proposal_client_atomic', {
      p_proposal_id: 'prop-1',
      p_actor_id: 'client-1',
      p_reason: 'Different timeline',
    });

    const cancelFd = new FormData();
    cancelFd.set('order_id', 'ord-1');
    cancelFd.set('reason', 'Project cancelled');
    await submitCancellationRequestAction(cancelFd);

    // 3. Admin actions call corresponding atomic RPCs
    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    const resCancelFd = new FormData();
    resCancelFd.set('request_id', 'cancel-1');
    resCancelFd.set('decision', 'approved');
    resCancelFd.set('resolution_notes', 'Approved cleanly');
    await resolveCancellationRequestAction(resCancelFd);
    expect(mockRpc).toHaveBeenCalledWith(
      'resolve_order_cancellation_atomic',
      expect.objectContaining({ p_request_id: 'cancel-1', p_decision: 'approved' })
    );

    const paidRevFd = new FormData();
    paidRevFd.set('order_id', 'ord-1');
    paidRevFd.set('extra_revisions', '2');
    paidRevFd.set('fee_major', '120');
    paidRevFd.set('summary', 'Extra 2 revision rounds');
    await createPaidRevisionInvoiceAction(paidRevFd);
    expect(mockRpc).toHaveBeenCalledWith(
      'create_paid_revision_invoice_atomic',
      expect.objectContaining({ p_order_id: 'ord-1', p_extra_revisions: 2, p_fee_cents: 12000 })
    );
  });

  it('[P2-UI-CONSOLIDATED-HUBS] implements 8 cohesive Admin hubs, Cmd+K palette, Retainers enterprise CTA, portal not-found, and A4 invoice formatting', () => {
    const adminLayout = readFileSync(resolve(process.cwd(), 'app/(admin)/admin/layout.tsx'), 'utf8');
    expect(adminLayout).toContain('/admin/pipeline');
    expect(adminLayout).toContain('/admin/billing');
    expect(adminLayout).toContain('/admin/support');
    expect(adminLayout).toContain('/admin/content');
    expect(adminLayout).toContain('/admin/ops');
    expect(adminLayout).toContain('AdminCommandPalette');

    const retainersPage = readFileSync(
      resolve(process.cwd(), 'app/(client)/portal/retainers/page.tsx'),
      'utf8'
    );
    expect(retainersPage).toContain('tier=enterprise');
    expect(retainersPage).not.toContain('tier=standard');

    const clientInvoicePage = readFileSync(
      resolve(process.cwd(), 'app/(client)/portal/invoices/[id]/page.tsx'),
      'utf8'
    );
    expect(clientInvoicePage).toMatch(/qty\s*\*\s*item\.unit_price_cents|line_total_cents/);
    expect(clientInvoicePage).toContain('billing_address');

    const portalNotFound = readFileSync(
      resolve(process.cwd(), 'app/(client)/portal/not-found.tsx'),
      'utf8'
    );
    expect(portalNotFound).toContain('not found');
  });
});
