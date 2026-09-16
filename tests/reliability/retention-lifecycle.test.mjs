import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

// Actual retention service, cron route, and CAS/storage boundaries; synthetic service boundaries only.
// No live S3/R2 credentials, external databases, or real network calls.
const cronSecret = 'synthetic-cron-secret-at-least-32-chars';
const projectId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const ticketId = '33333333-3333-4333-8333-333333333333';
const fileUuid = '44444444-4444-4444-8444-444444444444';

const fixture = {};
globalThis.__retentionLifecycleFixture = fixture;

function reset() {
  process.env.CRON_SECRET = cronSecret;
  Object.assign(fixture, {
    r2Configured: true,
    cursors: [
      { name: 'contact', last_key: '' },
      { name: 'private', last_key: '' },
      { name: 'projects', last_key: '' },
    ],
    cursorUpdateConflict: { contact: false, private: false, projects: false },
    cursorsError: null,
    inventoryPages: new Map([
      ['contact/', { items: [], next: '' }],
      ['private/', { items: [], next: '' }],
    ]),
    claimCalls: [],
    storageDeletions: new Set(),
    retainedLeads: new Set(),
    filesMap: new Map(), // r2_key -> file record
    archivedProjects: [],
    projectInvoiceCounts: new Map(),
    existingRecovery: new Set(),
    projectSnapshots: new Map(),
    prepareCleanupError: null,
    pendingDeletions: [],
    deletedKeys: [],
    deleteFails: false,
    deletionAckFails: false,
    alreadyCompleted: false,
  });
}
reset();
beforeEach(reset);

const bearerUrl = new URL('../../lib/auth/bearer.ts', import.meta.url).href;

const modules = {
  'server-only': 'export {};',
  'archiver': 'export {};',
  'next/server': 'export class NextRequest extends Request {} export class NextResponse { static json(body, init={}) { return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }); } }',
  '@/lib/auth/bearer': `
    import { requireBearer } from '${bearerUrl}';
    export { requireBearer };
  `,
  '@/lib/r2': `
    export const ARCHIVE_MAX_BYTES = 104857600;
    export function isR2Configured() {
      return globalThis.__retentionLifecycleFixture.r2Configured !== false;
    }
    export async function deletePrivateObjects(keys) {
      const f = globalThis.__retentionLifecycleFixture;
      f.deletedKeys.push(...keys);
      if (f.deleteFails) throw new Error('synthetic-s3-deletion-failed');
      return keys.length;
    }
    export async function getPrivateObjectBytes() {
      throw new Error('unexpected storage read');
    }
    export async function putPrivateObject() {
      throw new Error('unexpected storage write');
    }
  `,
  '@/lib/r2-inventory': `
    export async function privateInventoryPage(prefix, after) {
      const f = globalThis.__retentionLifecycleFixture;
      return f.inventoryPages.get(prefix) ?? { items: [], next: '' };
    }
  `,
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    const f = globalThis.__retentionLifecycleFixture;
    return {
      from(table) {
        let updating = false;
        let patchData = null;
        let exactCount = false;
        const filters = [];
        let limitVal = 100;
        const q = {
          select(_cols, opts) {
            return q;
          },
          eq(key, value) {
            filters.push(['eq', key, value]);
            return q;
          },
          is(key, value) {
            filters.push(['is', key, value]);
            return q;
          },
          lt(key, value) {
            filters.push(['lt', key, value]);
            return q;
          },
          gt(key, value) {
            filters.push(['gt', key, value]);
            return q;
          },
          order() {
            return q;
          },
          limit(n) {
            limitVal = n;
            return q;
          },
          update(patch, opts) {
            updating = true;
            patchData = patch;
            exactCount = opts?.count === 'exact';
            return q;
          },
          async maybeSingle() {
            if (table === 'storage_deletions') {
              return { data: f.alreadyCompleted ? { completed_at: '2026-09-16T00:00:00Z' } : null, error: null };
            }
            if (table === 'project_recovery') {
              const pId = filters.find(([op, k]) => k === 'project_id')?.[2];
              return { data: f.existingRecovery.has(pId) ? { project_id: pId } : null, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve, reject) {
            if (table === 'maintenance_cursors') {
              if (updating) {
                const name = filters.find(([op, k]) => k === 'name')?.[2];
                if (f.cursorUpdateConflict[name]) {
                  return Promise.resolve({ count: 0, error: null }).then(resolve, reject);
                }
                const row = f.cursors.find(c => c.name === name);
                if (row && patchData?.last_key !== undefined) row.last_key = patchData.last_key;
                return Promise.resolve({ count: 1, error: null }).then(resolve, reject);
              }
              if (f.cursorsError) return Promise.resolve({ data: null, error: f.cursorsError }).then(resolve, reject);
              return Promise.resolve({ data: f.cursors, error: null }).then(resolve, reject);
            }
            if (table === 'projects') {
              return Promise.resolve({ data: f.archivedProjects, error: null }).then(resolve, reject);
            }
            if (table === 'invoices') {
              const pId = filters.find(([op, k]) => k === 'project_id')?.[2];
              const count = f.projectInvoiceCounts.get(pId) ?? 0;
              return Promise.resolve({ count, error: null }).then(resolve, reject);
            }
            if (table === 'storage_deletions') {
              if (updating) {
                if (f.deletionAckFails) return Promise.resolve({ count: 0, error: null }).then(resolve, reject);
                return Promise.resolve({ count: 1, error: null }).then(resolve, reject);
              }
              return Promise.resolve({ data: f.pendingDeletions.slice(0, limitVal), error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
        };
        return q;
      },
      async rpc(name, args) {
        if (name === 'claim_expired_storage') {
          f.claimCalls.push(args);
          const { p_key, p_modified } = args;
          if (!p_modified) return { data: false, error: null };
          const modifiedDate = new Date(p_modified).getTime();
          const now = Date.now();
          let source = null;

          const contactRe = /^contact\\/[0-9a-f-]{36}\\/[0-9a-f-]{36}\\.(pdf|docx|doc|xlsx|png|jpg|zip)$/;
          const pendingRe = /^private\\/[0-9a-f-]{36}\\/pending\\/[0-9a-f-]{36}\\.(pdf|docx|doc|xlsx|png|jpg|zip)$/;

          if (contactRe.test(p_key) && modifiedDate < now - 90 * 86400000) {
            source = 'contact';
          } else if (pendingRe.test(p_key) && modifiedDate < now - 24 * 3600000) {
            source = 'pending';
          } else {
            return { data: false, error: null };
          }

          if (f.storageDeletions.has(p_key)) return { data: false, error: null };
          if (f.retainedLeads.has(p_key) && source === 'contact') return { data: false, error: null };

          if (f.filesMap.has(p_key)) {
            const rec = f.filesMap.get(p_key);
            if (source !== 'pending' || rec.kind !== 'attachment' || rec.ticket_id != null || rec.project_id != null) {
              return { data: false, error: null };
            }
            if (new Date(rec.created_at).getTime() >= now - 24 * 3600000) {
              return { data: false, error: null };
            }
            f.filesMap.delete(p_key);
            f.storageDeletions.add(p_key);
            return { data: true, error: null };
          }

          f.storageDeletions.add(p_key);
          return { data: true, error: null };
        }
        if (name === 'project_cleanup_snapshot') {
          return { data: f.projectSnapshots.get(args.p_project) ?? null, error: null };
        }
        if (name === 'prepare_project_cleanup') {
          return { error: f.prepareCleanupError };
        }
        throw new Error('Unexpected RPC call: ' + name);
      }
    };
  }`,
};

registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(modules, specifier)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true };
    }
    if (specifier.startsWith('@/lib/')) {
      return { url: new URL('../../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  }
});

const { NextRequest } = await import('next/server');
const { GET: r2RetentionCron } = await import('../../app/api/cron/r2-retention/route.ts');
const { drainStorageDeletions, purgeArchivedProject } = await import('../../lib/crm/retention.ts');

// -----------------------------------------------------------------------------
// 1. Cron Endpoint Protection & Security Gates
// -----------------------------------------------------------------------------

test('cron: rejects missing or unauthenticated requests with 401', async () => {
  for (const auth of [undefined, null, '', 'Basic dXNlcjpwYXNz', 'Bearer wrong-secret']) {
    const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
      method: 'GET',
      headers: auth ? { authorization: auth } : {},
    });
    const res = await r2RetentionCron(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.message, 'Invalid or missing credentials');
  }
});

test('cron: fails closed with 503 if R2 storage is unconfigured', async () => {
  fixture.r2Configured = false;
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.message, 'Attachment storage is not configured.');
});

test('cron: fails closed with 503 if maintenance_cursors table is unavailable or incomplete', async () => {
  fixture.cursors = [{ name: 'contact', last_key: '' }]; // missing private and projects cursors
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.message, 'Retention sweep failed. Tracking records are preserved.');
});

test('cron: responses always include Cache-Control: no-store', async () => {
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

// -----------------------------------------------------------------------------
// 2. Distinguishing Bound Files from Unbound Pending Uploads
// -----------------------------------------------------------------------------

test('lifecycle: bound ticket attachments are never claimed or deleted by retention', async () => {
  const ticketKey = `private/${clientId}/ticket_${ticketId}/${fileUuid}.pdf`;
  fixture.inventoryPages.set('private/', {
    items: [{ key: ticketKey, modified: new Date(Date.now() - 30 * 86400000).toISOString() }],
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.examined, 1);
  assert.equal(body.deleted, 0);
  assert.equal(fixture.storageDeletions.has(ticketKey), false);
  assert.equal(fixture.deletedKeys.includes(ticketKey), false);
});

test('lifecycle: bound project deliverables are never claimed or deleted by retention', async () => {
  const projectKey = `private/${clientId}/project_${projectId}/${fileUuid}.pdf`;
  fixture.inventoryPages.set('private/', {
    items: [{ key: projectKey, modified: new Date(Date.now() - 40 * 86400000).toISOString() }],
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.examined, 1);
  assert.equal(body.deleted, 0);
  assert.equal(fixture.storageDeletions.has(projectKey), false);
  assert.equal(fixture.deletedKeys.includes(projectKey), false);
});

test('lifecycle: fresh pending uploads (< 24 hours) are preserved', async () => {
  const freshPendingKey = `private/${clientId}/pending/${fileUuid}.pdf`;
  fixture.inventoryPages.set('private/', {
    items: [{ key: freshPendingKey, modified: new Date(Date.now() - 2 * 3600000).toISOString() }], // 2 hours old
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.examined, 1);
  assert.equal(body.deleted, 0);
  assert.equal(fixture.storageDeletions.has(freshPendingKey), false);
});

test('lifecycle: abandoned pending uploads (>= 24 hours, unbound) are claimed into storage_deletions', async () => {
  const oldPendingKey = `private/${clientId}/pending/${fileUuid}.pdf`;
  fixture.inventoryPages.set('private/', {
    items: [{ key: oldPendingKey, modified: new Date(Date.now() - 48 * 3600000).toISOString() }], // 48 hours old
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  assert.equal(fixture.storageDeletions.has(oldPendingKey), true);
});

test('lifecycle: old pending upload that is bound to a ticket in files is NOT claimed', async () => {
  const boundPendingKey = `private/${clientId}/pending/${fileUuid}.pdf`;
  // Record exists in files and has a bound ticket_id
  fixture.filesMap.set(boundPendingKey, {
    kind: 'attachment',
    ticket_id: ticketId,
    project_id: null,
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
  });
  fixture.inventoryPages.set('private/', {
    items: [{ key: boundPendingKey, modified: new Date(Date.now() - 48 * 3600000).toISOString() }],
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  assert.equal(fixture.storageDeletions.has(boundPendingKey), false);
  assert.equal(fixture.filesMap.has(boundPendingKey), true);
});

test('lifecycle: retained lead attachments (contact/ with retained: true) are preserved', async () => {
  const leadKey = `contact/${clientId}/${fileUuid}.pdf`;
  fixture.retainedLeads.add(leadKey);
  fixture.inventoryPages.set('contact/', {
    items: [{ key: leadKey, modified: new Date(Date.now() - 120 * 86400000).toISOString() }], // 120 days old
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  assert.equal(fixture.storageDeletions.has(leadKey), false);
});

test('lifecycle: expired unretained lead attachments (>= 90 days) are claimed into storage_deletions', async () => {
  const expiredLeadKey = `contact/${clientId}/${fileUuid}.pdf`;
  fixture.inventoryPages.set('contact/', {
    items: [{ key: expiredLeadKey, modified: new Date(Date.now() - 100 * 86400000).toISOString() }], // 100 days old
    next: '',
  });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  assert.equal(fixture.storageDeletions.has(expiredLeadKey), true);
});

// -----------------------------------------------------------------------------
// 3. CAS Concurrency & Cursor Progress
// -----------------------------------------------------------------------------

test('concurrency: cursor compare-and-set conflict returns 503 with Retry-After: 60', async () => {
  fixture.cursorUpdateConflict.contact = true; // Another worker updated contact cursor
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '60');
  const body = await res.json();
  assert.equal(body.message, 'Maintenance progress changed. Retry the sweep.');
});

test('concurrency: uncontested run updates maintenance cursors cleanly', async () => {
  fixture.inventoryPages.set('contact/', { items: [], next: 'contact/cursor-next' });
  fixture.inventoryPages.set('private/', { items: [], next: 'private/cursor-next' });
  const req = new NextRequest('https://redwan.work/api/cron/r2-retention', {
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const res = await r2RetentionCron(req);
  assert.equal(res.status, 200);
  assert.equal(fixture.cursors.find(c => c.name === 'contact')?.last_key, 'contact/cursor-next');
  assert.equal(fixture.cursors.find(c => c.name === 'private')?.last_key, 'private/cursor-next');
});

// -----------------------------------------------------------------------------
// 4. Drain Deletion Reliability & Idempotency
// -----------------------------------------------------------------------------

test('drain: processes queued keys and marks completion', async () => {
  fixture.pendingDeletions = [{ r2_key: 'pending-key-1' }, { r2_key: 'pending-key-2' }];
  const result = await drainStorageDeletions();
  assert.deepEqual(result, { completed: 2, failed: 0 });
  assert.deepEqual(fixture.deletedKeys, ['pending-key-1', 'pending-key-2']);
});

test('drain: storage failure leaves record uncompleted for retry', async () => {
  fixture.pendingDeletions = [{ r2_key: 'failed-key' }];
  fixture.deleteFails = true;
  const result = await drainStorageDeletions();
  assert.deepEqual(result, { completed: 0, failed: 1 });
});

test('drain: already acknowledged row by concurrent worker is skipped without error', async () => {
  fixture.pendingDeletions = [{ r2_key: 'concurrent-key' }];
  fixture.deletionAckFails = true;
  fixture.alreadyCompleted = true; // another worker acknowledged it
  const result = await drainStorageDeletions();
  assert.deepEqual(result, { completed: 0, failed: 0 });
});

// -----------------------------------------------------------------------------
// 5. Project Purge Financial & Recovery Safeguards
// -----------------------------------------------------------------------------

test('project purge: archived project with retained invoices is refused', async () => {
  fixture.projectSnapshots.set(projectId, {
    project: { id: projectId, archived_at: '2026-08-01T00:00:00Z' },
    milestones: [],
    files: [],
  });
  fixture.projectInvoiceCounts.set(projectId, 2);
  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Project has retained invoices and cannot be purged.');
});

test('project purge: already prepared cleanup is idempotent', async () => {
  fixture.existingRecovery.add(projectId);
  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, true);
});
