import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as null | {
    userId: string;
    email: string;
    fullName: string | null;
    role: 'admin' | 'client';
  },
  adminDbCalls: 0,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(async () => state.session),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => {
    state.adminDbCalls += 1;
    throw new Error('UNEXPECTED_ADMIN_DB_ACCESS');
  }),
}));

vi.mock('@/lib/r2', () => ({
  RESUME_ASSET_KEY: 'resume/resume.pdf',
  assetUrl: vi.fn(() => 'https://assets.example/test'),
  deletePrivateObjects: vi.fn(),
  deletePublicObject: vi.fn(),
  getPrivateObjectHeadBytes: vi.fn(),
  isPublicR2Configured: vi.fn(() => false),
  isR2Configured: vi.fn(() => false),
  putPublicObject: vi.fn(),
  validateResumePdfUpload: vi.fn(),
  verifyStoredPortalObjectSize: vi.fn(),
}));

import * as crmActions from '@/lib/crm/actions';
import * as opsActions from '@/lib/admin/ops-actions';
import * as cmsActions from '@/lib/cms/actions';

const CLIENT_ONLY_ACTIONS = new Set([
  'acceptProposalClientAction',
  'placePortalPackageOrderAction',
  'submitOrderRequirementsAction',
  'signOrderRoeAction',
  'reviewDeliverableClientAction',
  'submitInvoicePaymentProofAction',
  'createClientTicketAction',
  'submitClientReviewAction',
  'updateClientProfileAction',
  'declineProposalClientAction',
  'acceptOrderNdaAction',
  'submitCancellationRequestAction',
]);

const SHARED_PORTAL_ACTIONS = new Set([
  'replyTicketAction',
  'markAllNotificationsReadAction',
  'markNotificationReadAction',
  'attachOrderRequirementFileAction',
]);

function collectExportedActions(mod: Record<string, unknown>) {
  return Object.entries(mod).filter(
    (entry): entry is [string, (...args: unknown[]) => Promise<unknown>] =>
      typeof entry[1] === 'function'
  );
}

function isStructuredAuthError(res: unknown, pattern: RegExp): boolean {
  if (!res || typeof res !== 'object') return false;
  const rec = res as Record<string, unknown>;
  return rec.ok === false && typeof rec.error === 'string' && pattern.test(rec.error);
}

/**
 * Method 10: Exhaustive Server-Action Negative RBAC Matrix
 *
 * Programmatically invokes EVERY exported Server Action across CRM, Ops, and CMS
 * modules (76 actions) as unauthenticated (`null`), wrong-role (`client` -> admin action),
 * and reversed-role (`admin` -> client-only action), asserting 100% fail-closed rejection
 * before any service-role DB client is ever touched.
 */
describe('Method 10: Exhaustive Server-Action Negative RBAC Matrix (All 76 Actions)', () => {
  const allActions: Array<{ module: string; name: string; fn: (...args: unknown[]) => Promise<unknown> }> = [
    ...collectExportedActions(crmActions).map(([name, fn]) => ({ module: 'crm', name, fn })),
    ...collectExportedActions(opsActions).map(([name, fn]) => ({ module: 'ops', name, fn })),
    ...collectExportedActions(cmsActions).map(([name, fn]) => ({ module: 'cms', name, fn })),
  ];

  beforeEach(() => {
    state.session = null;
    state.adminDbCalls = 0;
  });

  it('[M10-UNAUTH-ZERO-BYPASS] rejects 100% of exported Server Actions when unauthenticated without touching getSupabaseAdmin()', async () => {
    expect(allActions.length).toBeGreaterThanOrEqual(70);
    state.session = null;

    const bypassed: string[] = [];
    for (const action of allActions) {
      const fd = new FormData();
      let rejectedAuth = false;
      try {
        const res = await action.fn(fd);
        if (isStructuredAuthError(res, /auth|admin|client|sign in|login|forbidden|session/i)) {
          rejectedAuth = true;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/auth|admin|client|sign in|login|forbidden|session/i.test(msg)) {
          rejectedAuth = true;
        }
      }
      if (!rejectedAuth) {
        bypassed.push(`${action.module}.${action.name}`);
      }
    }

    expect(bypassed, 'Server actions that did not fail closed with an auth error for null session').toEqual([]);
    expect(state.adminDbCalls, 'getSupabaseAdmin() must never be called for unauthenticated callers').toBe(0);
  });

  it('[M10-CLIENT-CANNOT-CALL-ADMIN] rejects 100% of admin CRM/Ops/CMS Server Actions when called by a client session', async () => {
    state.session = {
      userId: 'client-user-001',
      email: 'client@example.test',
      fullName: 'Client Caller',
      role: 'client',
    };

    const adminActions = allActions.filter(
      (a) => !CLIENT_ONLY_ACTIONS.has(a.name) && !SHARED_PORTAL_ACTIONS.has(a.name)
    );
    expect(adminActions.length).toBeGreaterThanOrEqual(55);

    const bypassed: string[] = [];
    for (const action of adminActions) {
      const fd = new FormData();
      let rejectedAdmin = false;
      try {
        const res = await action.fn(fd);
        if (isStructuredAuthError(res, /unauth|admin|forbidden|role/i)) {
          rejectedAdmin = true;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unauth|admin|forbidden|role/i.test(msg)) {
          rejectedAdmin = true;
        }
      }
      if (!rejectedAdmin) {
        bypassed.push(`${action.module}.${action.name}`);
      }
    }

    expect(bypassed, 'Admin server actions callable by client role').toEqual([]);
    expect(state.adminDbCalls, 'getSupabaseAdmin() must never be called when client invokes admin actions').toBe(0);
  });

  it('[M10-ADMIN-CANNOT-CALL-CLIENT-ONLY] rejects 100% of client-only Server Actions when called by an admin session', async () => {
    state.session = {
      userId: 'admin-user-001',
      email: 'admin@example.test',
      fullName: 'Admin Caller',
      role: 'admin',
    };

    const clientOnlyList = allActions.filter((a) => CLIENT_ONLY_ACTIONS.has(a.name));
    expect(clientOnlyList.length).toBe(CLIENT_ONLY_ACTIONS.size);

    const bypassed: string[] = [];
    for (const action of clientOnlyList) {
      const fd = new FormData();
      let rejectedClient = false;
      try {
        await action.fn(fd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unauth|client|forbidden|role/i.test(msg)) {
          rejectedClient = true;
        }
      }
      if (!rejectedClient) {
        bypassed.push(`${action.module}.${action.name}`);
      }
    }

    expect(bypassed, 'Client-only server actions callable by admin role').toEqual([]);
    expect(state.adminDbCalls, 'getSupabaseAdmin() must never be called when admin invokes client-only actions').toBe(0);
  });
});
