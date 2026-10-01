import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { registerHooks } from 'node:module';
import {
  assertDisposableTarget,
  createAdminClient,
  createStorageClient,
  getSessionCookie,
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

const { archiveProject } = await import('../../lib/crm/projects.ts');
const { purgeArchivedProject } = await import('../../lib/crm/retention.ts');
const { validateDeliverable } = await import('../../lib/crm/deliverable-validation.ts');
const { readRecoveryBytes } = await import('../../lib/crm/recovery-storage.ts');

test('Section 4: Interrupted restore, retry, concurrency, and retention', { timeout: 240000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);
  let adminUser, adminEmail, adminCookie;
  let clientUser, clientEmail;
  const adminPassword = 'Password123!@#';
  const clientPassword = 'Password123!@#';

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('Setup synthetic admin and client accounts', async () => {
    adminEmail = `admin-sec4-${randomBytes(6).toString('hex')}@example.test`;
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
    await new Promise(r => setTimeout(r, 1500));
    adminCookie = await getSessionCookie(adminEmail, adminPassword);

    clientEmail = `client-sec4-${randomBytes(6).toString('hex')}@example.test`;
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
  });

  let projectId, purgeArchiveBytes, purgeArchiveKey, purgeDigest;
  let file1Bytes, file2Bytes;

  await t.test('Seed 2-file project, archive, and purge to create registered backup', async () => {
    const projRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Section 4 Interruption Project',
      status: 'active',
      description: 'Project for testing interrupted restore and retry',
    }).select('id').single();
    assert.ok(!projRes.error && projRes.data);
    projectId = tracker.trackProject(projRes.data.id);

    const mRes = await admin.from('milestones').insert([
      { project_id: projectId, title: 'Phase 1 Milestone', amount_cents: 10000, position: 0, status: 'done' },
    ]);
    assert.ok(!mRes.error);

    file1Bytes = Buffer.from('Section 4 Deliverable One Contents 2026', 'utf8');
    file2Bytes = Buffer.from('Section 4 Deliverable Two Contents 2026', 'utf8');

    const k1 = tracker.trackKey(`private/${clientUser}/project_${projectId}/${randomUUID()}.pdf`);
    const k2 = tracker.trackKey(`private/${clientUser}/project_${projectId}/${randomUUID()}.docx`);
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: k1, Body: file1Bytes, ContentType: 'application/pdf' }));
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: k2, Body: file2Bytes, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

    const v1 = await validateDeliverable(projectId, { key: k1, filename: 'Spec1.pdf', mime: 'application/pdf', size_bytes: file1Bytes.length });
    const v2 = await validateDeliverable(projectId, { key: k2, filename: 'Spec2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: file2Bytes.length });
    tracker.trackKey(v1.key);
    tracker.trackKey(v2.key);

    const c1 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: projectId, p_file: { r2_key: v1.key, filename: 'Spec1.pdf', mime: 'application/pdf', size_bytes: file1Bytes.length } });
    const c2 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: projectId, p_file: { r2_key: v2.key, filename: 'Spec2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: file2Bytes.length } });
    assert.ok(!c1.error && c1.data && !c2.error && c2.data);
    assert.match(c1.data, /^[0-9a-f-]{36}$/);
    assert.match(c2.data, /^[0-9a-f-]{36}$/);
    tracker.trackFile(c1.data);
    tracker.trackFile(c2.data);

    const arcRes = await archiveProject(projectId);
    assert.equal(arcRes.ok, true);

    const purgeRes = await purgeArchivedProject(projectId);
    assert.equal(purgeRes.ok, true);

    const recRow = await admin.from('project_recovery').select('*').eq('project_id', projectId).single();
    assert.ok(!recRow.error && recRow.data);
    purgeArchiveKey = tracker.trackKey(recRow.data.recovery_key);
    purgeDigest = recRow.data.sha256;
    purgeArchiveBytes = await readRecoveryBytes(purgeArchiveKey);
    assert.equal(sha256(purgeArchiveBytes), purgeDigest);
    console.log('PASS: Seeded and purged 2-file project; backup archive bytes verified.');
  });

  let importId, uploadKey, sealedKey;

  await t.test('4.1 Multi-file interruption: chunk 1 succeeds, simulated disconnect, no premature creation', async () => {
    // 1. Call POST /api/recovery with action: 'upload'
    const upRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'upload', size: purgeArchiveBytes.length }),
    });
    assert.equal(upRes.status, 200);
    const upData = await upRes.json();
    assert.ok(upData.id && upData.url);
    importId = tracker.trackImport(upData.id);

    // 2. Direct PUT to presigned upload URL
    const putRes = await fetch(upData.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: purgeArchiveBytes,
    });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    // 3. Call action: 'preview' to seal and verify
    const prevRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'preview', id: importId }),
    });
    assert.equal(prevRes.status, 200);
    const prevData = await prevRes.json();
    assert.equal(prevData.files, 2);
    assert.equal(prevData.kind, 'project');

    // 4. Call action: 'restore' for Chunk 1
    const chunk1Res = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'restore', id: importId }),
    });
    assert.equal(chunk1Res.status, 200);
    const chunk1Data = await chunk1Res.json();
    assert.equal(chunk1Data.pending, true);
    assert.equal(chunk1Data.completed, 1);
    assert.equal(chunk1Data.total, 2);

    // 5. Interruption simulation:
    // Client disconnects / crashes / loses network here.
    // Inspect database state:
    const impRow = (await admin.from('recovery_imports').select('*').eq('id', importId).single()).data;
    assert.ok(impRow);
    uploadKey = tracker.trackKey(impRow.upload_key);
    sealedKey = tracker.trackKey(impRow.sealed_key);
    assert.equal(impRow.result, null, 'Result is null prior to full completion');
    assert.equal(impRow.completed_files.length, 1, 'Exactly 1 completed file checkpoint recorded');
    assert.ok(impRow.object_plan, 'Object plan is persisted');
    assert.equal(impRow.object_plan.files.length, 2);

    // Verify NO project or file rows have been created prematurely
    const plannedProjectId = impRow.object_plan.project_id;
    const prematureProj = await admin.from('projects').select('id').eq('id', plannedProjectId);
    assert.ok(!prematureProj.error && prematureProj.data.length === 0, 'No premature project row created');
    const prematureFiles = await admin.from('files').select('id').eq('project_id', plannedProjectId);
    assert.ok(!prematureFiles.error && prematureFiles.data.length === 0, 'No premature files row created');
    console.log('PASS 4.1: Chunk 1 completed and checkpointed (1/2); interruption simulated with zero premature DB rows');
  });

  let restoredProjectId, restoredFileIds;

  await t.test('4.2 Resumed restore after interruption: chunk 2, commit, byte read-back hash match, zero duplicate rows', async () => {
    // Resume restore loop from same import ID
    // Call action: 'restore' for Chunk 2
    const chunk2Res = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'restore', id: importId }),
    });
    assert.equal(chunk2Res.status, 200);
    const chunk2Data = await chunk2Res.json();
    assert.equal(chunk2Data.pending, true);
    assert.equal(chunk2Data.completed, 2);
    assert.equal(chunk2Data.total, 2);

    // Database check: both files checkpointed
    const impRowMid = (await admin.from('recovery_imports').select('completed_files, result').eq('id', importId).single()).data;
    assert.equal(impRowMid.completed_files.length, 2);
    assert.equal(impRowMid.result, null);

    // Final call: 'restore' commits the restore transaction
    const finalRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'restore', id: importId }),
    });
    assert.equal(finalRes.status, 200);
    const finalData = await finalRes.json();
    assert.ok(finalData.result);
    assert.ok(finalData.result.projectId);
    restoredProjectId = tracker.trackProject(finalData.result.projectId);
    restoredFileIds = finalData.result.fileIds;
    assert.equal(restoredFileIds.length, 2);
    restoredFileIds.forEach(id => tracker.trackFile(id));

    // Verify exactly 1 project created, exactly 2 files created
    const projCheck = await admin.from('projects').select('*').eq('id', restoredProjectId);
    assert.ok(!projCheck.error && projCheck.data.length === 1, 'Exactly one project row exists');

    const filesCheck = await admin.from('files').select('*').eq('project_id', restoredProjectId);
    assert.ok(!filesCheck.error && filesCheck.data.length === 2, 'Exactly two file rows exist, no duplicate rows');

    // READ ACTUAL RESTORED OBJECT BYTES FROM STORAGE BEFORE ASSERTING HASH EQUALITY
    const observedFilenames = new Set(filesCheck.data.map(f => f.filename));
    const expectedFilenames = new Set(['Spec1.pdf', 'Spec2.docx']);
    assert.deepEqual(observedFilenames, expectedFilenames, 'Observed restored filenames must match exact expected set');

    for (const fileRow of filesCheck.data) {
      tracker.trackKey(fileRow.r2_key);
      const actualBytes = await readRecoveryBytes(fileRow.r2_key);
      if (fileRow.filename === 'Spec1.pdf') {
        assert.equal(actualBytes.length, file1Bytes.length);
        assert.equal(sha256(actualBytes), sha256(file1Bytes), 'Restored Spec1.pdf bytes match original');
      } else if (fileRow.filename === 'Spec2.docx') {
        assert.equal(actualBytes.length, file2Bytes.length);
        assert.equal(sha256(actualBytes), sha256(file2Bytes), 'Restored Spec2.docx bytes match original');
      } else {
        assert.fail(`Unexpected restored filename: ${fileRow.filename}`);
      }
    }

    // Verify idempotence: calling restore again returns the exact same result
    const idempRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: ENV.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'restore', id: importId }),
    });
    assert.equal(idempRes.status, 200);
    const idempData = await idempRes.json();
    assert.deepEqual(idempData.result, finalData.result);

    const filesCheckAfter = await admin.from('files').select('*').eq('project_id', restoredProjectId);
    assert.ok(!filesCheckAfter.error && filesCheckAfter.data.length === 2, 'Still exactly two file rows after idempotent retry');
    console.log('PASS 4.2: Resumed restore succeeded with storage byte read-back hash verification and zero duplicate rows');
  });

  await t.test('4.3 Controlled lost-response retry: client retry after connection dropped post-commit succeeds idempotently', async () => {
    // Setup a fresh 2-file import, prepare and seal it
    const upRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: purgeArchiveBytes.length }),
    });
    const upData = await upRes.json();
    const retryImportId = tracker.trackImport(upData.id);

    const putRes = await fetch(upData.url, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: purgeArchiveBytes });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    const prevRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: retryImportId }),
    });
    assert.equal(prevRes.status, 200);

    // Chunk 1 executed and checkpointed
    const c1Res = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: retryImportId }),
    });
    assert.equal(c1Res.status, 200);
    const c1Data = await c1Res.json();
    assert.equal(c1Data.completed, 1);

    // Chunk 2 executed and checkpointed
    const c2Res = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: retryImportId }),
    });
    assert.equal(c2Res.status, 200);
    const c2Data = await c2Res.json();
    assert.equal(c2Data.completed, 2);

    // DETERMINISTIC FAULT INJECTION: Lost response on final commit
    // Create an ephemeral loopback HTTP interceptor proxy to drop the client response after server commit
    const http = await import('node:http');
    let responseDropped = false;
    let upstreamStatus;
    const proxyServer = http.createServer((clientReq, clientRes) => {
      const appUrlParsed = new URL(ENV.APP_URL);
      const forwardReq = http.request({
        hostname: appUrlParsed.hostname,
        port: appUrlParsed.port,
        path: clientReq.url,
        method: clientReq.method,
        // Route to the real destination, preserving the caller's Origin unchanged.
        headers: { ...clientReq.headers, host: appUrlParsed.host },
      }, (appRes) => {
        upstreamStatus = appRes.statusCode;
        appRes.resume();
        // Drop delivery; the independent database read below must prove commit.
        responseDropped = true;
        clientReq.socket.destroy();
      });

      clientReq.pipe(forwardReq);
      forwardReq.on('error', () => { clientReq.socket.destroy(); });
    });

    await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    const proxyPort = proxyServer.address().port;

    // Send commit request through the interceptor proxy; socket destruction triggers network error on client
    let clientErrorCaught = false;
    try {
      await fetch(`http://127.0.0.1:${proxyPort}/api/recovery`, {
        method: 'POST',
        headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id: retryImportId }),
      });
    } catch (err) {
      clientErrorCaught = true;
    } finally {
      await new Promise((resolve) => proxyServer.close(resolve));
    }

    assert.ok(responseDropped, 'Server commit progress finished and response was dropped before client receipt');
    assert.equal(upstreamStatus, 200, 'Fault must occur after a successful upstream response, not a CSRF refusal');
    assert.ok(clientErrorCaught, 'Client encountered connection drop exception simulating lost response');

    // Independently observe server commit in PostgreSQL
    const { data: dbImport, error: impErr } = await admin
      .from('recovery_imports')
      .select('result, completed_files')
      .eq('id', retryImportId)
      .single();
    assert.ifError(impErr);
    assert.ok(dbImport.result, 'Server-side commit succeeded independently in PostgreSQL');
    assert.ok(dbImport.result.projectId);
    tracker.trackProject(dbImport.result.projectId);
    dbImport.result.fileIds?.forEach(id => tracker.trackFile(id));

    // Client retries commit through the standard client path
    const retryRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: retryImportId }),
    });
    assert.equal(retryRes.status, 200, 'Retry returns 200 OK');
    const retryData = await retryRes.json();
    assert.deepEqual(retryData.result, dbImport.result, 'Client retry returns identical completed result');

    // Verify zero duplicate records in DB
    const { data: projs } = await admin.from('projects').select('id').eq('id', dbImport.result.projectId);
    assert.equal(projs.length, 1, 'Exactly one project exists');
    const { data: files } = await admin.from('files').select('id').eq('project_id', dbImport.result.projectId);
    assert.equal(files.length, 2, 'Exactly two file rows exist, zero duplicate files created');
    console.log('PASS 4.3: Deterministic lost-response fault injection and retry verified with zero duplicate records');
  });

  await t.test('4.4 Concurrent duplicate restore requests: Postgres FOR UPDATE row lock serializes final commit execution', async () => {
    // Note: PostgreSQL SELECT ... FOR UPDATE on recovery_imports during restore_recovery_import
    // serializes the final commit step for this import ID, ensuring single execution.
    const upRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: purgeArchiveBytes.length }),
    });
    const upData = await upRes.json();
    const concurrentImportId = tracker.trackImport(upData.id);

    await fetch(upData.url, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: purgeArchiveBytes });
    await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: concurrentImportId }),
    });

    // Run chunk 1 and chunk 2
    await fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: concurrentImportId }) });
    await fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: concurrentImportId }) });

    // Send 2 concurrent final commit requests simultaneously
    const [cRes1, cRes2] = await Promise.all([
      fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: concurrentImportId }) }),
      fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: concurrentImportId }) }),
    ]);

    assert.equal(cRes1.status, 200);
    assert.equal(cRes2.status, 200);
    const d1 = await cRes1.json();
    const d2 = await cRes2.json();

    assert.deepEqual(d1.result, d2.result, 'Both concurrent calls returned the identical result object');
    const concurrentProjectId = tracker.trackProject(d1.result.projectId);
    d1.result.fileIds?.forEach(id => tracker.trackFile(id));

    const projRows = await admin.from('projects').select('id').eq('id', concurrentProjectId);
    assert.equal(projRows.data.length, 1, 'Only 1 project row created despite concurrent commit requests');

    const fileRows = await admin.from('files').select('id').eq('project_id', concurrentProjectId);
    assert.equal(fileRows.data.length, 2, 'Only 2 file rows created despite concurrent commit requests');
    console.log('PASS 4.4: Concurrent restore calls safely serialized by row lock without duplicate rows');
  });

  await t.test('4.5 Parent client eligibility revocation: deactivation between preview and commit refuses restore safely', async () => {
    const upRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: purgeArchiveBytes.length }),
    });
    const upData = await upRes.json();
    const revokeImportId = tracker.trackImport(upData.id);

    await fetch(upData.url, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: purgeArchiveBytes });
    await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: revokeImportId }),
    });

    // Checkpoint both files
    await fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: revokeImportId }) });
    await fetch(`${ENV.APP_URL}/api/recovery`, { method: 'POST', headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', id: revokeImportId }) });

    // DEACTIVATE CLIENT PROFILE
    await admin.from('profiles').update({ is_active: false }).eq('id', clientUser);

    // Attempt final commit
    const refuseRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: revokeImportId }),
    });
    assert.equal(refuseRes.status, 400, 'Commit refused due to deactivated client profile');
    const errData = await refuseRes.json();
    assert.match(errData.error, /refused/i);

    const checkImp = (await admin.from('recovery_imports').select('result').eq('id', revokeImportId).single()).data;
    assert.equal(checkImp.result, null);

    // Reactivate client profile
    await admin.from('profiles').update({ is_active: true }).eq('id', clientUser);

    // Retry commit now succeeds
    const succeedRes = await fetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: revokeImportId }),
    });
    assert.equal(succeedRes.status, 200);
    const succData = await succeedRes.json();
    assert.ok(succData.result?.projectId);
    tracker.trackProject(succData.result.projectId);
    succData.result.fileIds?.forEach(id => tracker.trackFile(id));
    console.log('PASS 4.5: Parent eligibility revocation refused restore; reactivation permitted completion');
  });

  await t.test('4.6 Storage retention verification: original backup, upload staging, and sealed archive remain retained', async () => {
    // 1. Original backup archive in project_recovery
    const headOrig = await storage.send(new HeadObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: purgeArchiveKey }));
    assert.ok(headOrig.ContentLength > 0);

    // 2. Upload staging key in recovery_imports
    const headUp = await storage.send(new HeadObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: uploadKey }));
    assert.ok(headUp.ContentLength > 0);

    // 3. Sealed key in recovery_imports
    const headSeal = await storage.send(new HeadObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: sealedKey }));
    assert.ok(headSeal.ContentLength > 0);
    for (const key of [purgeArchiveKey, uploadKey, sealedKey]) {
      assert.equal(sha256(await readRecoveryBytes(key)), purgeDigest, 'Retained archive bytes must match the registered digest');
    }

    console.log('PASS 4.6: Zero purge of backups or staging; all storage artifacts remain retained');
  });
});
