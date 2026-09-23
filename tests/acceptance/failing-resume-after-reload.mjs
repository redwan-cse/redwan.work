import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { registerHooks } from 'node:module';
import {
  assertDisposableTarget,
  createAdminClient,
  createStorageClient,
  getSessionCookie,
  safeFetch,
  sha256,
  FixtureTracker,
  ENV,
} from './harness-env.mjs';

assertDisposableTarget();

const admin = createAdminClient();
const storage = createStorageClient();
globalThis.__acceptanceAdmin = admin;

registerHooks({
  resolve(s, c, n) {
    if (s === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (s === '@/lib/supabase/admin') return { url: 'data:text/javascript,export function getSupabaseAdmin(){return globalThis.__acceptanceAdmin;}', shortCircuit: true };
    if (s.startsWith('@/lib/')) return { url: new URL('../../' + s.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    return n(s, c);
  }
});

const { validateDeliverable } = await import('../../lib/crm/deliverable-validation.ts');
const { archiveProject } = await import('../../lib/crm/projects.ts');
const { purgeArchivedProject } = await import('../../lib/crm/retention.ts');
const { readRecoveryBytes } = await import('../../lib/crm/recovery-storage.ts');

test('PROPOSED SLICE: Resuming in-flight recovery after page reload / fresh session', { timeout: 120000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);
  let adminUser, clientUser, adminCookie;
  const adminPassword = 'Password123!@#';
  const clientPassword = 'Password123!@#';

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('Setup synthetic accounts and tracker', async () => {
    const adminEmail = `admin-failresume-${randomBytes(6).toString('hex')}@example.test`;
    const aRes = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    assert.ok(!aRes.error && aRes.data?.user);
    adminUser = tracker.trackUser(aRes.data.user.id);
    const pAdm = await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', adminUser);
    assert.ok(!pAdm.error);

    const clientEmail = `client-failresume-${randomBytes(6).toString('hex')}@example.test`;
    const cRes = await admin.auth.admin.createUser({
      email: clientEmail,
      password: clientPassword,
      email_confirm: true,
      app_metadata: { role: 'client' },
    });
    assert.ok(!cRes.error && cRes.data?.user);
    clientUser = tracker.trackUser(cRes.data.user.id);
    const pCli = await admin.from('profiles').update({ role: 'client', is_active: true, tokens_valid_after: 0 }).eq('id', clientUser);
    assert.ok(!pCli.error);

    await new Promise(r => setTimeout(r, 1600));
    adminCookie = await getSessionCookie(adminEmail, adminPassword);
  });

  let backupZipBytes;
  let seededProjectId;

  await t.test('Seed multi-file project and generate backup archive', async () => {
    const projRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Reload Resume Test Project',
      status: 'active',
      description: 'Project for testing reload resume',
    }).select('id').single();
    assert.ok(!projRes.error && projRes.data);
    seededProjectId = tracker.trackProject(projRes.data.id);

    const mRes = await admin.from('milestones').insert([
      { project_id: seededProjectId, title: 'Phase 1 Milestone', amount_cents: 10000, position: 0, status: 'done' },
    ]);
    assert.ok(!mRes.error);

    const f1Bytes = Buffer.from('Reload resume test file 1 content', 'utf8');
    const f2Bytes = Buffer.from('Reload resume test file 2 content', 'utf8');
    const k1 = tracker.trackKey(`private/${clientUser}/project_${seededProjectId}/${randomUUID()}.pdf`);
    const k2 = tracker.trackKey(`private/${clientUser}/project_${seededProjectId}/${randomUUID()}.docx`);
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: k1, Body: f1Bytes, ContentType: 'application/pdf' }));
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: k2, Body: f2Bytes, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

    const v1 = await validateDeliverable(seededProjectId, { key: k1, filename: 'Deliverable-1.pdf', mime: 'application/pdf', size_bytes: f1Bytes.length });
    const v2 = await validateDeliverable(seededProjectId, { key: k2, filename: 'Deliverable-2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: f2Bytes.length });
    tracker.trackKey(v1.key);
    tracker.trackKey(v2.key);

    const c1 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: seededProjectId, p_file: { r2_key: v1.key, filename: 'Deliverable-1.pdf', mime: 'application/pdf', size_bytes: f1Bytes.length } });
    const c2 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: seededProjectId, p_file: { r2_key: v2.key, filename: 'Deliverable-2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: f2Bytes.length } });
    assert.ok(!c1.error && c1.data && !c2.error && c2.data);
    tracker.trackFile(c1.data.id);
    tracker.trackFile(c2.data.id);

    await archiveProject(seededProjectId);
    const purgeRes = await purgeArchivedProject(seededProjectId);
    assert.equal(purgeRes.ok, true);

    const recRow = await admin.from('project_recovery').select('*').eq('project_id', seededProjectId).single();
    assert.ok(!recRow.error && recRow.data);
    tracker.trackKey(recRow.data.recovery_key);
    backupZipBytes = await readRecoveryBytes(recRow.data.recovery_key);
    assert.equal(sha256(backupZipBytes), recRow.data.sha256);
    console.log('Seeded project backup archive verified, size:', backupZipBytes.length);
  });

  let inFlightImportId;

  await t.test('Open import, preview, and perform partial restore (1 of 2 files)', async () => {
    // 1. Open upload
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ENV.APP_URL, cookie: adminCookie },
      body: JSON.stringify({ action: 'upload', size: backupZipBytes.length }),
    });
    assert.equal(upRes.status, 200);
    const { id, url } = await upRes.json();
    inFlightImportId = tracker.trackImport(id);

    // 2. Direct PUT to storage
    const putRes = await safeFetch(url, { method: 'PUT', headers: { 'content-type': 'application/zip' }, body: backupZipBytes });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    // 3. Preview
    const prevRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ENV.APP_URL, cookie: adminCookie },
      body: JSON.stringify({ action: 'preview', id: inFlightImportId }),
    });
    assert.equal(prevRes.status, 200);

    // 4. Restore chunk 1 (1 of 2)
    const chunk1Res = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ENV.APP_URL, cookie: adminCookie },
      body: JSON.stringify({ action: 'restore', id: inFlightImportId }),
    });
    assert.equal(chunk1Res.status, 200);
    const chunk1Data = await chunk1Res.json();
    assert.deepEqual(chunk1Data, { pending: true, id: inFlightImportId, completed: 1, total: 2 });
    console.log('Chunk 1 completed successfully (1 of 2). Simulating operator page reload / fresh session.');
  });

  await t.test('FAILING ACCEPTANCE CRITERION: Operator queries and resumes in-flight recovery by ID after page reload', async () => {
    // Defect reproduction:
    // When the operator reloads the page, the React client state resets to null.
    // The operator needs to resume the in-flight import by ID.
    // In candidate 6f5a0abc4964bff3ea314bad474428d36f57fefb:
    // GET /api/recovery does not support ?importId and ignores it, returning standard catalog listing.
    // Therefore, the assertion below FAILS as expected, confirming the defect.
    const resumeQueryRes = await safeFetch(`${ENV.APP_URL}/api/recovery?importId=${inFlightImportId}`, {
      method: 'GET',
      headers: { cookie: adminCookie, origin: ENV.APP_URL },
    });
    assert.equal(resumeQueryRes.status, 200);
    const body = await resumeQueryRes.json();

    assert.ok(
      body.inFlight === true && body.id === inFlightImportId && body.completed === 1 && body.total === 2,
      `DEFECT REPRODUCED: Server does not return in-flight recovery state for resumption. Received catalog response instead: ${JSON.stringify(body).slice(0, 120)}...`
    );
  });
});
