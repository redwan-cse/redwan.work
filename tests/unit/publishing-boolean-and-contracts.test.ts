import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentSession = vi.fn();
const mockFrom = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockIsR2Configured = vi.fn();
const mockPresignPrivateGet = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/lib/crm/audit', () => ({
  recordAuditLog: (...args: unknown[]) => mockRecordAuditLog(...args),
  createInAppNotification: vi.fn(),
  enqueueTransactionalEmail: vi.fn(),
  notifyAllAdmins: vi.fn(),
}));

vi.mock('@/lib/r2', () => ({
  isR2Configured: () => mockIsR2Configured(),
  presignPrivateGet: (...args: unknown[]) => mockPresignPrivateGet(...args),
}));

import {
  upsertPortfolioItemAction,
  upsertResumeItemAction,
  upsertServiceAction,
  upsertServicePackageAction,
} from '@/lib/cms/actions';
import { addOrderTaskAction, submitOrderDeliverableAction } from '@/lib/crm/actions';
import { GET as downloadVaultFile } from '@/app/api/files/[id]/download/route';

describe('Publishing Checkbox Parsing, Error Honesty & Vault Download Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentSession.mockResolvedValue({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@disposable.test',
      fullName: 'Admin',
      role: 'admin',
    });
  });

  it('[PUBLISHING-BOOLEAN] parses unchecked HTML checkboxes as false across CMS and CRM actions and throws on DB errors without false audit logs', async () => {
    const capturedPayloads: Array<{ table: string; payload: Record<string, unknown> }> = [];

    mockFrom.mockImplementation((table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        capturedPayloads.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({ data: { id: 'deliv-1', code: 'DLV-1001' }, error: null }),
          }),
          then: (resolve: (val: { error: null }) => unknown) => resolve({ error: null }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        capturedPayloads.push({ table, payload });
        return {
          eq: async () => ({ error: null }),
        };
      },
      upsert: async (payload: Record<string, unknown>) => {
        capturedPayloads.push({ table, payload });
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { code: 'ORD-1001', auto_accept_days: 7, client_id: '22222222-2222-2222-2222-222222222222' },
            error: null,
          }),
        }),
      }),
    }));

    // 1. Service with unchecked is_public
    const svcFd = new FormData();
    svcFd.set('title', 'Draft Security Service');
    svcFd.set('slug', 'draft-security-service');
    await upsertServiceAction(svcFd);
    expect(capturedPayloads.find((p) => p.table === 'services')?.payload.is_public).toBe(false);

    // 2. Service package with unchecked is_active
    const pkgFd = new FormData();
    pkgFd.set('service_id', 'svc-1');
    pkgFd.set('tier_name', 'Starter');
    pkgFd.set('package_name', 'Inactive Starter');
    await upsertServicePackageAction(pkgFd);
    expect(capturedPayloads.find((p) => p.table === 'service_packages')?.payload.is_active).toBe(false);

    // 3. Portfolio item with unchecked is_published
    const portFd = new FormData();
    portFd.set('title', 'Unpublished Case Study');
    portFd.set('slug', 'unpublished-case-study');
    await upsertPortfolioItemAction(portFd);
    expect(capturedPayloads.find((p) => p.table === 'portfolio_items')?.payload.is_published).toBe(false);

    // 4. Resume item with unchecked is_visible
    const resFd = new FormData();
    resFd.set('section', 'experience');
    resFd.set('title', 'Draft Experience');
    await upsertResumeItemAction(resFd);
    expect(capturedPayloads.find((p) => p.table === 'resume_items')?.payload.is_visible).toBe(false);

    // 5. Order task with unchecked is_client_visible
    const taskFd = new FormData();
    taskFd.set('order_id', 'ord-1');
    taskFd.set('title', 'Internal QA Checklist');
    await addOrderTaskAction(taskFd);
    expect(capturedPayloads.find((p) => p.table === 'order_tasks')?.payload.is_client_visible).toBe(false);

    // 6. Deliverable with unchecked is_final_delivery
    const delivFd = new FormData();
    delivFd.set('order_id', 'ord-1');
    delivFd.set('client_id', '22222222-2222-2222-2222-222222222222');
    delivFd.set('title', 'Interim Draft Findings');
    await submitOrderDeliverableAction(delivFd);
    expect(capturedPayloads.find((p) => p.table === 'deliverables')?.payload.is_final_delivery).toBe(false);

    // 7. DB error must throw and must NOT emit phantom audit log
    mockRecordAuditLog.mockClear();
    mockFrom.mockImplementationOnce(() => ({
      insert: async () => ({ error: { message: 'duplicate key value violates unique constraint' } }),
    }));
    await expect(upsertServiceAction(svcFd)).rejects.toThrow(/duplicate key/i);
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it('uses real vault_files schema columns in /api/files/[id]/download and returns 410 for expired/archived files', async () => {
    let selectedColumns = '';
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'vault_files') throw new Error(`Unexpected table ${table}`);
      return {
        select: (cols: string) => {
          selectedColumns = cols;
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  owner_client_id: '22222222-2222-2222-2222-222222222222',
                  order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  deliverable_id: null,
                  r2_key: 'private/22222222-2222-2222-2222-222222222222/deliverable/report.pdf',
                  filename: 'report.pdf',
                  mime_type: 'application/pdf',
                  size_bytes: 2048,
                  download_count: 0,
                  retention_until: '2020-01-01T00:00:00.000Z',
                  archived_at: null,
                },
                error: null,
              }),
            }),
          };
        },
      };
    });

    const req = new NextRequest('http://localhost:3000/api/files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download');
    const res = await downloadVaultFile(req, {
      params: Promise.resolve({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    });

    expect(selectedColumns).not.toMatch(/\bmime\b/);
    expect(selectedColumns).not.toContain('deleted_from_r2_at');
    expect(selectedColumns).toContain('mime_type');
    expect(selectedColumns).toContain('archived_at');
    expect(res.status).toBe(410);
  });
});
