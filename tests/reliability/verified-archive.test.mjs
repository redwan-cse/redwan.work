import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

const projectId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';

// Global mock state for verified archive & retention tests
const f = {
  entries: [],
  writes: 0,
  marks: 0,
  prepares: 0,
  stored: new Map(),
  mismatchReadback: false,
  sourceBytesOverride: null,
  snapshotResult: null,
  markArchivedResult: { error: null },
  prepareCleanupResult: { error: null },
  recoveryRow: { data: null, error: null },
  invoicesResult: { count: 0, error: null },
  projectRow: null,
  presignError: false,
  revalidatedPaths: [],
  session: { userId: 'admin-1', role: 'admin' },
  profile: { role: 'admin', is_active: true },
};
globalThis.__archiveState = f;

function resetState() {
  f.entries = [];
  f.writes = 0;
  f.marks = 0;
  f.prepares = 0;
  f.stored.clear();
  f.mismatchReadback = false;
  f.sourceBytesOverride = null;
  f.markArchivedResult = { error: null };
  f.prepareCleanupResult = { error: null };
  f.recoveryRow = { data: null, error: null };
  f.invoicesResult = { count: 0, error: null };
  f.presignError = false;
  f.revalidatedPaths = [];
  f.session = { userId: 'admin-1', role: 'admin' };
  f.profile = { role: 'admin', is_active: true };

  // Default clean snapshot
  f.snapshotResult = {
    data: {
      project: { id: projectId, archived_at: null, name: 'Synthetic Project' },
      milestones: [{ id: 'ms-1', title: 'Milestone 1', amount_cents: 5000 }],
      files: [
        {
          id: fileId,
          r2_key: 'source/file-1.pdf',
          filename: '../../unsafe-slip-filename.pdf',
          size_bytes: 3,
        },
      ],
    },
    error: null,
  };

  f.projectRow = {
    id: projectId,
    archived_at: '2026-09-16T12:00:00Z',
    archive_key: `archive/project_${projectId}/verified_synthetic.zip`,
  };
}

class MockZipArchive extends EventEmitter {
  constructor() {
    super();
    this.aborted = false;
  }
  append(value, options) {
    f.entries.push({
      value: Buffer.isBuffer(value) ? value : Buffer.from(value),
      name: options.name,
    });
  }
  async finalize() {
    if (this.aborted) return;
    const syntheticZip = Buffer.from('synthetic-zip-content-' + Math.random().toString(36).slice(2));
    this.emit('data', syntheticZip);
    this.emit('end');
  }
  abort() {
    this.aborted = true;
  }
}
globalThis.__MockZipArchive = MockZipArchive;

const stub = (names) => names.map((name) => `export async function ${name}(){return {ok:true};}`).join('\n');

const modules = {
  'server-only': 'export {};',
  'next/cache': `
    export function revalidatePath(path) {
      globalThis.__archiveState.revalidatedPaths.push(path);
    }
  `,
  'archiver': `
    export const ZipArchive = globalThis.__MockZipArchive;
    export default function(format, opts) {
      return new globalThis.__MockZipArchive();
    }
  `,
  '@/lib/r2': `
    export const ARCHIVE_MAX_BYTES = 104857600;
    export const ASSET_ALLOWED_EXT = ['.pdf', '.png', '.jpg'];
    export const ASSET_MAX_BYTES = 5242880;
    export function assetUrl(key) { return 'https://assets.example.test/' + key; }
    export async function deletePublicObject() { return { ok: true }; }
    export function makeAssetKey(name) { return 'assets/' + name; }
    export function makeDeliverableKey(p, f) { return 'private/' + p + '/' + f; }
    export async function presignPrivatePut() { return 'https://presigned.example.test/put'; }
    export async function putPublicObject() { return { ok: true }; }
    export function validateContactFile() { return { ok: true, ext: 'pdf' }; }
    export async function putPrivateObject(key, bytes) {
      const f = globalThis.__archiveState;
      f.writes++;
      f.stored.set(key, Buffer.from(bytes));
    }
    export async function getPrivateObjectBytes(key) {
      const f = globalThis.__archiveState;
      if (key === 'source/file-1.pdf') {
        return f.sourceBytesOverride ?? Buffer.from('abc');
      }
      if (f.mismatchReadback) {
        return Buffer.from('corrupted-readback-bytes');
      }
      const existing = f.stored.get(key);
      if (existing) return existing;
      return Buffer.from('default-stored-bytes');
    }
    export async function presignPrivateGet(key, ttl) {
      const f = globalThis.__archiveState;
      if (f.presignError) throw new Error('presign-network-timeout');
      return 'https://presigned.example.test/' + key + '?ttl=' + ttl;
    }
    export async function deletePrivateObjects(keys) {
      return { ok: true };
    }
  `,
  '@/lib/supabase/admin': `
    export function getSupabaseAdmin() {
      const f = globalThis.__archiveState;
      return {
        async rpc(name, args) {
          if (name === 'project_cleanup_snapshot') {
            return f.snapshotResult;
          }
          if (name === 'mark_project_archived') {
            f.marks++;
            return f.markArchivedResult;
          }
          if (name === 'prepare_project_cleanup') {
            f.prepares++;
            return f.prepareCleanupResult;
          }
          return { data: null, error: null };
        },
        from(table) {
          const q = {
            select(_fields, _opts) { return q; },
            eq(_field, _val) { return q; },
            is(_field, _val) { return q; },
            update(_data, _opts) { return q; },
            delete() { return q; },
            order(_field, _opts) { return q; },
            limit(_n) { return q; },
            async maybeSingle() {
              if (table === 'project_recovery') return f.recoveryRow;
              if (table === 'projects') return { data: f.projectRow, error: null };
              if (table === 'profiles') return { data: f.profile, error: null };
              return { data: null, error: null };
            },
            then(resolve, reject) {
              if (table === 'invoices') {
                return Promise.resolve(f.invoicesResult).then(resolve, reject);
              }
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            }
          };
          return q;
        }
      };
    }
  `,
  '@/lib/auth/session': `
    export async function getCurrentSession() {
      return globalThis.__archiveState.session;
    }
  `,
  '@/lib/email/recipients': 'export async function emailOrigin(){return "https://example.test";}export async function recipientEmail(){return null;}',
  '@/lib/email': 'export function queueEmail(){}export async function recordUnsent(){return {ok:true};}export async function sendDeliverableUploadedEmail(){return {ok:true};}',
  '@/lib/crm/clients': 'export async function convertLead(){return {ok:true};}export async function inviteClient(){return {ok:true};}export async function setClientActive(){return {ok:true};}',
  '@/lib/crm/tickets': stub(['adminReply', 'setTicketStatus']),
  '@/lib/crm/files': 'export async function createFileRow(){return {ok:true};}export async function deleteOwnedFile(){return {ok:true};}',
  '@/lib/mime': stub(['extFromFilename', 'isAllowedAssetMime']),
  '@/lib/format': 'export function formatBytes(){return "synthetic";}',
  '@/lib/crm/invoices': stub([
    'addInvoiceItem', 'confirmPayment', 'createDraftInvoice', 'createDraftInvoiceWithItems',
    'deleteInvoiceItem', 'getInvoiceDetail', 'rejectPayment', 'sendInvoice',
    'updateDraftInvoice', 'updateInvoiceItem', 'voidInvoice'
  ]),
  '@/lib/crm/deliverable-validation': 'export async function validateDeliverable(){return null;}',
  '@/lib/crm/milestone-money': 'export function parseMilestoneMoney(){return {ok:true,amount_cents:100};}',
};

registerHooks({
  resolve(s, c, n) {
    if (Object.hasOwn(modules, s)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[s]), shortCircuit: true };
    }
    if (s.startsWith('@/lib/')) {
      return { url: new URL('../../' + s.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    }
    return n(s, c);
  },
});

const { archiveProject } = await import('../../lib/crm/verified-archive.ts');
const { purgeArchivedProject } = await import('../../lib/crm/retention.ts');
const { getArchiveDownloadUrl } = await import('../../lib/crm/projects.ts');
const { archiveProjectAction, purgeArchivedProjectAction, archiveDownloadUrlAction } = await import('../../lib/crm/admin-actions.ts');

// --------------------------------------------------------------------------
// SUITE 1: Project Archive Verification & Zip-Slip Protection
// --------------------------------------------------------------------------

test('archive preserves manifests but never uses display filenames as ZIP paths', async () => {
  resetState();
  const res = await archiveProject(projectId);
  assert.equal(res.ok, true);
  assert.ok(res.archiveKey.startsWith(`archive/project_${projectId}/verified_`));
  assert.ok(f.entries.some((e) => e.name === 'files/' + fileId));
  assert.ok(f.entries.some((e) => e.name === 'project.json'));
  assert.ok(f.entries.some((e) => e.name === 'milestones.json'));
  assert.ok(f.entries.some((e) => e.name === 'files.json'));
  assert.ok(f.entries.some((e) => e.name === 'recovery.json'));
  // Ensure zip-slip filenames from user input are NOT in ZIP entry names
  assert.ok(f.entries.every((e) => !e.name.includes('..')));
  assert.ok(f.entries.every((e) => !e.name.includes('unsafe-slip')));
  assert.equal(f.marks, 1);
});

test('archive rejects already archived project and invalid UUIDs', async () => {
  resetState();
  // Already archived
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  const resAlready = await archiveProject(projectId);
  assert.equal(resAlready.ok, false);
  assert.equal(resAlready.error, 'Project already archived.');
  assert.equal(f.marks, 0);

  // Invalid UUID
  const resBadId = await archiveProject('not-a-valid-uuid');
  assert.equal(resBadId.ok, false);
  assert.equal(resBadId.error, 'Project not found.');
  assert.equal(f.marks, 0);
});

test('archive rejects byte count mismatch between R2 and database record', async () => {
  resetState();
  // Database record expects 3 bytes, but R2 returns 5 bytes
  f.sourceBytesOverride = Buffer.from('12345');
  const res = await archiveProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Archive verification failed. Project and source files are preserved.');
  assert.equal(f.marks, 0);
});

test('read-back mismatch prevents project archive transition', async () => {
  resetState();
  f.mismatchReadback = true;
  const result = await archiveProject(projectId);
  assert.equal(result.ok, false);
  assert.equal(f.marks, 0);
  assert.equal(result.error, 'Archive verification failed. Project and source files are preserved.');
});

test('archive handles concurrent project change during mark_project_archived RPC', async () => {
  resetState();
  f.markArchivedResult = { error: { message: 'Project changed during archive' } };
  const res = await archiveProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Project changed during archive. Source data is preserved; retry after review.');
});

// --------------------------------------------------------------------------
// SUITE 2: Recoverable Project Purge & Financial Retention Blockers
// --------------------------------------------------------------------------

test('purge: FINANCIAL RETENTION BLOCKER - refuses purge when linked invoices exist', async () => {
  resetState();
  // Project is archived
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  // Financial dependency: 2 invoices linked to project
  f.invoicesResult = { count: 2, error: null };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Project has retained invoices and cannot be purged.');
  assert.equal(f.prepares, 0);
  assert.equal(f.writes, 0);
});

test('purge: financial check failure fails closed', async () => {
  resetState();
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  f.invoicesResult = { count: null, error: { message: 'db-connection-failed' } };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Financial retention check unavailable.');
  assert.equal(f.prepares, 0);
});

test('purge: refuses purge when project is not yet archived', async () => {
  resetState();
  // Project is NOT archived
  f.snapshotResult.data.project.archived_at = null;
  f.invoicesResult = { count: 0, error: null };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Project is not archived.');
  assert.equal(f.prepares, 0);
});

test('purge: idempotent success when recovery record already exists', async () => {
  resetState();
  // Recovery record already present
  f.recoveryRow = { data: { project_id: projectId }, error: null };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, true);
  assert.equal(f.prepares, 0);
  assert.equal(f.writes, 0);
});

test('purge: recovery read-back verification failure aborts without deleting source', async () => {
  resetState();
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  f.invoicesResult = { count: 0, error: null };
  f.mismatchReadback = true;

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Could not verify recovery backup. Project and source files were not purged.');
  assert.equal(f.prepares, 0);
});

test('purge: atomic database cleanup queues deletions and cascades project', async () => {
  resetState();
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  f.invoicesResult = { count: 0, error: null };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, true);
  assert.equal(f.prepares, 1);
  assert.equal(f.writes, 1);
});

test('purge: database RPC retained invoices conflict mapping', async () => {
  resetState();
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  f.invoicesResult = { count: 0, error: null };
  f.prepareCleanupResult = { error: { message: 'Project has retained invoices' } };

  const res = await purgeArchivedProject(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Project has retained invoices and cannot be purged.');
});

// --------------------------------------------------------------------------
// SUITE 3: Archive Download Presigning Boundaries
// --------------------------------------------------------------------------

test('download: getArchiveDownloadUrl generates presigned URL for archived project', async () => {
  resetState();
  const res = await getArchiveDownloadUrl(projectId);
  assert.equal(res.ok, true);
  assert.ok(res.url.startsWith('https://presigned.example.test/archive/project_'));
});

test('download: getArchiveDownloadUrl refuses unarchived or missing projects', async () => {
  resetState();
  // Missing archive_key
  f.projectRow.archive_key = null;
  const resNoKey = await getArchiveDownloadUrl(projectId);
  assert.equal(resNoKey.ok, false);
  assert.equal(resNoKey.error, 'Project is not archived.');

  // Unarchived
  f.projectRow.archived_at = null;
  const resUnarchived = await getArchiveDownloadUrl(projectId);
  assert.equal(resUnarchived.ok, false);
  assert.equal(resUnarchived.error, 'Project is not archived.');

  // Project not found
  f.projectRow = null;
  const resNotFound = await getArchiveDownloadUrl(projectId);
  assert.equal(resNotFound.ok, false);
  assert.equal(resNotFound.error, 'Project not found.');
});

test('download: getArchiveDownloadUrl masks presigning errors', async () => {
  resetState();
  f.presignError = true;
  const res = await getArchiveDownloadUrl(projectId);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'Archive download unavailable.');
  assert.equal(res.error.includes('presign-network-timeout'), false);
});

// --------------------------------------------------------------------------
// SUITE 4: Administrative Action Authorization Boundaries
// --------------------------------------------------------------------------

test('admin actions: archiveProjectAction, purgeArchivedProjectAction, and archiveDownloadUrlAction enforce admin authority', async () => {
  resetState();
  // 1. Client caller denied
  f.session = { userId: 'client-1', role: 'client' };
  f.profile = { role: 'client', is_active: true };
  assert.deepEqual(await archiveProjectAction(projectId), { error: 'Unauthorized.' });
  assert.deepEqual(await purgeArchivedProjectAction(projectId), { error: 'Unauthorized.' });
  assert.deepEqual(await archiveDownloadUrlAction(projectId), { ok: false, error: 'Unauthorized.' });

  // 2. Inactive admin caller denied
  f.session = { userId: 'admin-1', role: 'admin' };
  f.profile = { role: 'admin', is_active: false };
  assert.deepEqual(await archiveProjectAction(projectId), { error: 'Unauthorized.' });
  assert.deepEqual(await purgeArchivedProjectAction(projectId), { error: 'Unauthorized.' });
  assert.deepEqual(await archiveDownloadUrlAction(projectId), { ok: false, error: 'Unauthorized.' });

  // 3. Authorized admin succeeds and revalidates paths
  f.session = { userId: 'admin-1', role: 'admin' };
  f.profile = { role: 'admin', is_active: true };
  const archiveRes = await archiveProjectAction(projectId);
  assert.match(archiveRes.notice, /Project archived with a verified backup/);
  assert.ok(f.revalidatedPaths.includes('/admin/projects'));
  assert.ok(f.revalidatedPaths.includes('/admin'));

  f.revalidatedPaths = [];
  f.snapshotResult.data.project.archived_at = '2026-09-10T10:00:00Z';
  const purgeRes = await purgeArchivedProjectAction(projectId);
  assert.deepEqual(purgeRes, {});
  assert.ok(f.revalidatedPaths.includes('/admin/projects'));
  assert.ok(f.revalidatedPaths.includes('/admin'));

  const dlRes = await archiveDownloadUrlAction(projectId);
  assert.equal(dlRes.ok, true);
  assert.ok(dlRes.url.includes('archive/project_'));
});
