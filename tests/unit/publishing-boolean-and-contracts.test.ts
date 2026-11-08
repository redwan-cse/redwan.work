import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentSession = vi.fn();
const mockFrom = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockIsR2Configured = vi.fn();
const mockPresignPrivateGet = vi.fn();
const mockGetPrivateObjectSize = vi.fn();

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
  getPrivateObjectSize: () => mockGetPrivateObjectSize(),
}));

import {
  upsertPortfolioItemAction,
  upsertResumeItemAction,
  upsertServiceAction,
  upsertServicePackageAction,
} from '@/lib/cms/actions';
import {
  addOrderTaskAction,
  markAllNotificationsReadAction,
  submitOrderDeliverableAction,
  toggleClientActiveStatusAction,
  updateRetainerPlanAction,
} from '@/lib/crm/actions';
import { GET as downloadVaultFile } from '@/app/api/files/[id]/download/route';
import { insertLead } from '@/lib/contact/lead-store';

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

  it('allows admin fallback download of inquiry_attachments and supports client active toggle, retainer update, and bulk notification read', async () => {
    const updatedTables: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mockIsR2Configured.mockReturnValue(true);
    mockGetPrivateObjectSize.mockResolvedValue(1024);
    mockPresignPrivateGet.mockResolvedValue('https://r2.disposable.test/signed-scope.pdf');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'vault_files') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'inquiry_attachments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  inquiry_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  r2_key: 'contact/2026/11/08/scope.pdf',
                  filename: 'scope.pdf',
                  mime_type: 'application/pdf',
                  size_bytes: 1024,
                  deleted_from_r2_at: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: (payload: Record<string, unknown>) => {
          updatedTables.push({ table, payload });
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
              is: async () => ({ error: null }),
              then: (resolve: (val: { error: null }) => unknown) => resolve({ error: null }),
            }),
          };
        },
      };
    });

    const req = new NextRequest('http://localhost:3000/api/files/cccccccc-cccc-4ccc-8ccc-cccccccccccc/download');
    const res = await downloadVaultFile(req, {
      params: Promise.resolve({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://r2.disposable.test/signed-scope.pdf');

    const toggleFd = new FormData();
    toggleFd.set('client_id', '22222222-2222-2222-2222-222222222222');
    toggleFd.set('is_active', 'false');
    await toggleClientActiveStatusAction(toggleFd);
    expect(updatedTables.find((u) => u.table === 'profiles')?.payload.is_active).toBe(false);

    const retFd = new FormData();
    retFd.set('retainer_id', '33333333-3333-4333-8333-333333333333');
    retFd.set('hours_used_current_period', '12.5');
    retFd.set('status', 'paused');
    await updateRetainerPlanAction(retFd);
    expect(updatedTables.find((u) => u.table === 'retainer_plans')?.payload).toMatchObject({
      hours_used_current_period: 12.5,
      status: 'paused',
    });

    await markAllNotificationsReadAction();
    expect(updatedTables.find((u) => u.table === 'notifications')?.payload).toHaveProperty('read_at');
  });

  it('derives service_pillar from selected services and rolls back inquiry row if attachment insert fails', async () => {
    const insertedInquiryPayloads: Array<Record<string, unknown>> = [];
    const deletedInquiryIds: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'inquiries') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedInquiryPayloads.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'inq-rollback-1', code: 'INQ-9001', ticket_number: 9001 },
                  error: null,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (_col: string, id: string) => {
              deletedInquiryIds.push(id);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'inquiry_attachments') {
        return {
          insert: async () => ({
            error: { message: 'attachment table failure' },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const res = await insertLead({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      country: 'GB',
      whatsapp_e164: '+447700900077',
      preferred_contact_method: 'email',
      timezone: 'Europe/London',
      preferred_contact_date: '2026-11-15',
      best_time_to_contact: 'Morning',
      services: ['Full-Stack Web Development'],
      company: 'Analytical Engine Ltd',
      project_url: null,
      project_summary: 'Need a Next.js + PostgreSQL enterprise portal.',
      nda_required: true,
      urgency: 'standard',
      budget_min: 3000,
      budget_max: 6000,
      how_found: 'Search',
      source_page: '/contact',
      device_type: 'desktop',
      user_agent: 'Vitest',
      ip_hash: 'a'.repeat(64),
      consent_at: '2026-11-08T00:00:00.000Z',
      consent_policy_version: '2026-04-06',
      consent_policy_hash: 'b'.repeat(64),
      consent_capture_method: 'explicit-checkbox-v1',
      attachments: [
        {
          key: 'contact/2026/11/08/11111111-1111-4111-8111-111111111111.pdf',
          filename: 'scope.pdf',
          mime: 'application/pdf',
          size_bytes: 1024,
        },
      ],
    });

    expect(res.ok).toBe(false);
    expect(insertedInquiryPayloads[0]?.service_pillar).toBe('development');
    expect(deletedInquiryIds).toEqual(['inq-rollback-1']);
  });
});
