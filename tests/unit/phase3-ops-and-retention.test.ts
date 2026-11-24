import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSupabaseAdmin = vi.fn();
const mockIsR2Configured = vi.fn();
const mockListPrivateContactObjects = vi.fn();
const mockListPrivateVaultObjects = vi.fn();
const mockDeletePrivateObjects = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    isR2Configured: () => mockIsR2Configured(),
    listPrivateContactObjects: () => mockListPrivateContactObjects(),
    listPrivateVaultObjects: () => mockListPrivateVaultObjects(),
    deletePrivateObjects: (...args: unknown[]) => mockDeletePrivateObjects(...args),
  };
});

import { GET as runRetentionCron } from '@/app/api/cron/r2-retention/route';
import { renderOutboxHtml } from '@/lib/email/outbox';

describe('Phase 3 Retention Pagination Sweep & Outbox Template CTAs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'phase3-cron-secret-value';
  });

  it('[P3-RETENTION-CURSOR] sweeps stale unretained R2 orphans beyond index 100 without starvation', async () => {
    mockIsR2Configured.mockReturnValue(true);
    const oldDate = new Date(Date.now() - 120 * 86_400_000);

    // 105 contact objects: first 100 retained in DB, last 5 are unretained orphans!
    const contactObjs = Array.from({ length: 105 }, (_, idx) => ({
      key: `contact/2026/05/file-${String(idx).padStart(3, '0')}.pdf`,
      lastModified: oldDate,
      size: 1024,
    }));
    const retainedSet = new Set(contactObjs.slice(0, 100).map((o) => o.key));

    mockListPrivateContactObjects.mockResolvedValue(contactObjs);
    mockListPrivateVaultObjects.mockResolvedValue([]);
    mockDeletePrivateObjects.mockImplementation(async (keys: string[]) => keys.length);

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
              in: async (_col: string, keys: string[]) => ({
                data: keys.filter((k) => retainedSet.has(k)).map((r2_key) => ({ r2_key })),
                error: null,
              }),
            }),
          };
        }
        return {
          update: () => ({
            in: () => ({
              lt: () => ({ select: async () => ({ data: [], error: null }) }),
            }),
          }),
        };
      },
    });

    const req = new NextRequest('http://127.0.0.1:3000/api/cron/r2-retention', {
      method: 'GET',
      headers: { Authorization: 'Bearer phase3-cron-secret-value' },
    });
    const res = await runRetentionCron(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deletedOrphanContactObjects?: number };
    expect(body.deletedOrphanContactObjects).toBe(5);
    expect(mockDeletePrivateObjects).toHaveBeenCalledWith(
      contactObjs.slice(100).map((o) => o.key)
    );
  });

  it('[P3-EMAIL-CTAS] renders context-aware CTA button labels for lifecycle templates cleanly', () => {
    const html = renderOutboxHtml({
      template: 'invoice_overdue',
      subject: 'Invoice INV-1002 Overdue',
      payload: {
        message: 'Please review balance.',
        actionUrl: 'https://redwan.work/portal/invoices/123',
      },
    });
    expect(html).toContain('Settle Overdue Invoice');
    expect(html).toContain('https://redwan.work/portal/invoices/123');

    const adminCancelHtml = renderOutboxHtml({
      template: 'order_cancellation_requested',
      subject: 'Cancellation Request ORD-901',
      payload: {
        message: 'Client requested mutual cancellation.',
        actionUrl: 'https://redwan.work/admin/orders/ord-901',
      },
    });
    expect(adminCancelHtml).toContain('Review Cancellation Request');

    const adminGenericHtml = renderOutboxHtml({
      template: 'custom_alert_admin',
      subject: 'Admin Alert',
      payload: {
        message: 'Check queue.',
        actionUrl: 'https://redwan.work/admin',
      },
    });
    expect(adminGenericHtml).toContain('Open Admin Command Center');

    const retainerHtml = renderOutboxHtml({
      template: 'retainer_renewed',
      subject: 'Retainer Renewed',
      payload: {
        message: 'New cycle ready.',
        actionUrl: 'https://redwan.work/portal/retainers',
      },
    });
    expect(retainerHtml).toContain('View Retainer &amp; Invoice');

    const deactivatedHtml = renderOutboxHtml({
      template: 'account_deactivated',
      subject: 'Account Status Updated',
      payload: {
        message: 'Access disabled.',
        actionUrl: 'https://redwan.work/contact',
      },
    });
    expect(deactivatedHtml).toContain('Contact Support');
  });

  it('[P6-RETENTION-OVERDUE-RPC] delegates daily CRM maintenance atomically to run_daily_crm_maintenance without direct invoice writes', async () => {
    mockIsR2Configured.mockReturnValue(false);
    const invUpdate = vi.fn();
    const rpcCalls: string[] = [];

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn(async (name: string) => {
        rpcCalls.push(name);
        if (name === 'run_daily_crm_maintenance') {
          return {
            data: {
              overdue_invoices: 1,
              expired_proposals: 0,
              auto_accepted_deliverables: 2,
              renewed_retainers: 1,
              pruned_rate_limits: 4,
              pruned_upload_reservations: 1,
            },
            error: null,
          };
        }
        return { data: 0, error: null };
      }),
      from: (table: string) => {
        if (table === 'invoices') {
          return { update: invUpdate };
        }
        throw new Error(`Unexpected direct table query: ${table}`);
      },
    });

    const req = new NextRequest('http://127.0.0.1:3000/api/cron/r2-retention', {
      method: 'GET',
      headers: { Authorization: 'Bearer phase3-cron-secret-value' },
    });
    const res = await runRetentionCron(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { autoAcceptedDeliverables?: number };
    expect(body.autoAcceptedDeliverables).toBe(2);
    expect(rpcCalls).toEqual(['run_daily_crm_maintenance']);
    expect(invUpdate).not.toHaveBeenCalled();
  });
});
