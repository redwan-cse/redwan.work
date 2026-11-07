import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentSession = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/crm/audit', () => ({
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
  recordAuditLog: vi.fn(),
}));

import {
  computeCappedLtvDeltaUsdCents,
  computeDepositSplit,
  computeInvoiceTotals,
  validatePaymentSubmission,
} from '@/lib/finance/invariants';
import {
  createAndIssueInvoiceAction,
  createOrderFromAdminAction,
  placePortalPackageOrderAction,
  submitInvoicePaymentProofAction,
} from '@/lib/crm/actions';

describe('Financial Arithmetic, Deposit Splits & Currency/Overpayment Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[MONEY-INVARIANTS] preserves exact cent conservation across invoice totals, deposit splits, currency checks, and LTV caps', () => {
    // 1. Invoice totals arithmetic & discount/tax bounds
    const totals = computeInvoiceTotals({
      subtotalCents: 120_000,
      discountCents: 20_000,
      taxRateBps: 750, // 7.50%
    });
    expect(totals).toEqual({
      subtotalCents: 120_000,
      discountCents: 20_000,
      taxableCents: 100_000,
      taxRateBps: 750,
      taxCents: 7_500,
      totalCents: 107_500,
    });

    expect(() =>
      computeInvoiceTotals({ subtotalCents: 10_000, discountCents: 10_001, taxRateBps: 0 })
    ).toThrow(/discount/i);

    expect(() =>
      computeInvoiceTotals({ subtotalCents: 10_000, discountCents: 0, taxRateBps: 15_000 })
    ).toThrow(/tax/i);

    // 2. Deposit + balance split always sums exactly to totalCents (zero rounding drift)
    for (const [totalCents, depositPercent] of [
      [100_001, 33],
      [120_000, 50],
      [45_000, 100],
      [85_000, 0],
      [295_000, 40],
    ] as const) {
      const split = computeDepositSplit(totalCents, depositPercent);
      expect(split.depositCents + split.balanceCents).toBe(totalCents);
      expect(split.depositCents).toBeGreaterThanOrEqual(0);
      expect(split.balanceCents).toBeGreaterThanOrEqual(0);
    }

    // 3. Payment currency & remaining balance validation
    expect(
      validatePaymentSubmission({
        invoiceTotalCents: 60_000,
        amountPaidCents: 20_000,
        creditedCents: 5_000,
        invoiceCurrency: 'USD',
        paymentAmountCents: 35_000,
        paymentCurrency: 'USD',
      })
    ).toEqual({ ok: true, remainingAfterPaymentCents: 0 });

    expect(
      validatePaymentSubmission({
        invoiceTotalCents: 60_000,
        amountPaidCents: 20_000,
        creditedCents: 5_000,
        invoiceCurrency: 'USD',
        paymentAmountCents: 35_001,
        paymentCurrency: 'USD',
      })
    ).toEqual({ ok: false, reason: 'overpayment' });

    expect(
      validatePaymentSubmission({
        invoiceTotalCents: 60_000,
        amountPaidCents: 0,
        creditedCents: 0,
        invoiceCurrency: 'USD',
        paymentAmountCents: 10_000,
        paymentCurrency: 'EUR',
      })
    ).toEqual({ ok: false, reason: 'currency_mismatch' });

    // 4. LTV delta cap prevents overpayment from inflating USD lifetime value
    expect(
      computeCappedLtvDeltaUsdCents({
        remainingBeforePaymentCents: 30_000,
        paymentAmountCents: 50_000,
        fxRateToUsd: 1,
      })
    ).toBe(30_000);
  });

  it('routes order/invoice creation through atomic RPCs and blocks payment proof overpayment before DB/vault writes', async () => {
    const rpcSpy = vi.fn();
    const fromSpy = vi.fn();

    mockGetCurrentSession.mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
      aal: 'aal2',
    });

    rpcSpy
      .mockResolvedValueOnce({
        data: { invoice_id: 'inv-1', code: 'INV-1001', total_cents: 75000 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { order_id: 'ord-1', code: 'ORD-1001', deposit_invoice_id: 'inv-2', status: 'awaiting_payment' },
        error: null,
      });

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: rpcSpy,
      from: fromSpy,
    });

    const invForm = new FormData();
    invForm.set('client_id', 'client-1');
    invForm.set('description', 'Retainer Settlement');
    invForm.set('amount_major', '750');
    invForm.set('currency', 'USD');
    await createAndIssueInvoiceAction(invForm);

    expect(rpcSpy).toHaveBeenNthCalledWith(
      1,
      'issue_invoice_atomic',
      expect.objectContaining({
        p_client_id: 'client-1',
        p_subtotal_cents: 75000,
        p_discount_cents: 0,
        p_tax_rate_bps: 0,
      })
    );

    const ordForm = new FormData();
    ordForm.set('client_id', 'client-1');
    ordForm.set('title', 'Cloud Hardening');
    ordForm.set('pillar', 'cybersecurity');
    ordForm.set('total_usd', '1200');
    ordForm.set('deposit_percent', '50');
    await createOrderFromAdminAction(ordForm);

    expect(rpcSpy).toHaveBeenNthCalledWith(
      2,
      'create_admin_order_atomic',
      expect.objectContaining({
        p_admin_id: 'admin-1',
        p_client_id: 'client-1',
        p_total_cents: 120000,
        p_deposit_percent: 50,
      })
    );

    // Portal package order atomic RPC
    mockGetCurrentSession.mockResolvedValue({
      userId: 'client-1',
      email: 'client@disposable.test',
      fullName: 'Client',
      role: 'client',
      aal: 'aal1',
    });
    fromSpy.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }));
    rpcSpy.mockResolvedValueOnce({
      data: { order_id: 'ord-pkg-1', code: 'ORD-1002', deposit_invoice_id: 'inv-3', status: 'awaiting_payment' },
      error: null,
    });

    const pkgForm = new FormData();
    pkgForm.set('service_slug', 'web-api-pentest');
    pkgForm.set('tier', 'standard');
    pkgForm.set('title', 'Portal Pentest');
    await expect(placePortalPackageOrderAction(pkgForm)).rejects.toThrow('NEXT_REDIRECT:/portal/orders/ord-pkg-1');
    expect(rpcSpy).toHaveBeenCalledWith(
      'create_package_order_atomic',
      expect.objectContaining({
        p_client_id: 'client-1',
      })
    );

    // Overpayment rejection before inserting vault_files or payments
    const vaultInsertSpy = vi.fn();
    fromSpy.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'inv-open',
                  code: 'INV-2001',
                  client_id: 'client-1',
                  order_id: 'ord-pkg-1',
                  currency: 'USD',
                  fx_rate_to_usd: 1,
                  status: 'partially_paid',
                  total_cents: 100000,
                  amount_paid_cents: 50000,
                  credited_cents: 0,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return { insert: vaultInsertSpy };
    });

    const overpayForm = new FormData();
    overpayForm.set('invoice_id', 'inv-open');
    overpayForm.set('method', 'bank_transfer');
    overpayForm.set('reference', 'OVERPAY-REF-99');
    overpayForm.set('amount_major', '501'); // $501 > $500 remaining
    overpayForm.set('r2_key', 'private/client-1/payment_proof/receipt.pdf');
    overpayForm.set('filename', 'receipt.pdf');
    overpayForm.set('size_bytes', '1024');

    await expect(submitInvoicePaymentProofAction(overpayForm)).rejects.toThrow(/exceeds|remaining|overpayment/i);
    expect(vaultInsertSpy).not.toHaveBeenCalled();
  });
});
