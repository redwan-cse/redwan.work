import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
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

const { deleteOwnedFile } = await import('../../lib/crm/file-deletion.ts');
const { validateAttachments } = await import('../../lib/crm/attachments.ts');
const { validateDeliverable } = await import('../../lib/crm/deliverable-validation.ts');
const { archiveProject } = await import('../../lib/crm/projects.ts');
const { purgeArchivedProject } = await import('../../lib/crm/retention.ts');
const { decodeRecoveryArchive } = await import('../../lib/crm/recovery-archive.ts');
const { readRecoveryBytes } = await import('../../lib/crm/recovery-storage.ts');
const { presignPrivatePut } = await import('../../lib/r2.ts');

function makeKeyPair(dir, ext) {
  const raw = randomUUID();
  const sourceId = `${raw.slice(0, 14)}4${raw.slice(15, 19)}a${raw.slice(20)}`;
  const finalId = `${raw.slice(0, 14)}5${raw.slice(15, 19)}a${raw.slice(20)}`;
  return {
    sourceId,
    finalId,
    sourceKey: `${dir}/${sourceId}.${ext}`,
    finalKey: `${dir}/${finalId}.${ext}`,
  };
}

test('Section 3: Real backup creation, deletion holding, and restore round trips', { timeout: 240000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);
  let adminUser, clientUser, adminCookie;
  const adminPassword = 'Password123!@#';
  const clientPassword = 'Password123!@#';

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('Setup synthetic users and tracker', async () => {
    const adminEmail = `admin-rbr-${randomBytes(6).toString('hex')}@example.test`;
    const aRes = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    assert.ok(!aRes.error && aRes.data?.user);
    adminUser = tracker.trackUser(aRes.data.user.id);
    const profAdmin = await admin.from('profiles').update({ role: 'admin', is_active: true, tokens_valid_after: 0 }).eq('id', adminUser);
    assert.ok(!profAdmin.error);

    const clientEmail = `client-rbr-${randomBytes(6).toString('hex')}@example.test`;
    const cRes = await admin.auth.admin.createUser({
      email: clientEmail,
      password: clientPassword,
      email_confirm: true,
      app_metadata: { role: 'client' },
    });
    assert.ok(!cRes.error && cRes.data?.user);
    clientUser = tracker.trackUser(cRes.data.user.id);
    const profClient = await admin.from('profiles').update({ role: 'client', is_active: true, tokens_valid_after: 0 }).eq('id', clientUser);
    assert.ok(!profClient.error);

    await new Promise(r => setTimeout(r, 1500));
    adminCookie = await getSessionCookie(adminEmail, adminPassword);
  });

  await t.test('3.1 Helper/database/storage integration: Ticket attachment backup on delete and privileged RPC restore', async () => {
    // 1. Create ticket
    const ticketRes = await admin.from('tickets').insert({
      client_id: clientUser,
      subject: 'Synthetic attachment ticket (DB helper)',
      status: 'open',
    }).select('id').single();
    assert.ok(!ticketRes.error && ticketRes.data);
    const ticketId = tracker.trackTicket(ticketRes.data.id);

    // 2. Upload staging file
    const stageId = randomUUID();
    const stageKey = tracker.trackKey(`private/${clientUser}/ticket_${ticketId}/${stageId}.pdf`);
    const originalBytes = Buffer.from('Original ticket attachment content for backup test 2026.', 'utf8');
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: stageKey,
      Body: originalBytes,
      ContentType: 'application/pdf',
      ContentLength: originalBytes.length,
    }));

    // 3. Finalize attachment via validateAttachments
    const entries = [{ key: stageKey, filename: 'Attachment.pdf', mime: 'application/pdf', size_bytes: originalBytes.length }];
    const validated = await validateAttachments(entries, clientUser, ticketId);
    assert.ok(validated && validated.length === 1);
    const finalKey = tracker.trackKey(validated[0].key);

    const fRes = await admin.from('files').insert({
      bucket: 'private',
      kind: 'attachment',
      ticket_id: ticketId,
      uploaded_by: clientUser,
      r2_key: finalKey,
      filename: 'Attachment.pdf',
      mime: 'application/pdf',
      size_bytes: originalBytes.length,
    }).select('id').single();
    assert.ok(!fRes.error && fRes.data);
    const fileId = tracker.trackFile(fRes.data.id);

    // 4. Delete attachment to trigger backup
    const delRes = await deleteOwnedFile(fileId, { userId: clientUser, role: 'client' });
    assert.deepEqual(delRes, { ok: true });

    const recRow = await admin.from('file_recovery').select('*').eq('file_id', fileId).single();
    assert.ok(!recRow.error && recRow.data);
    const archiveKey = tracker.trackKey(recRow.data.recovery_key);

    // 5. Verify archive contents
    const archiveBytes = await readRecoveryBytes(archiveKey);
    const archiveEntries = decodeRecoveryArchive(archiveBytes);
    const archivedPayload = archiveEntries.get(`files/${fileId}`);
    assert.deepEqual(archivedPayload, originalBytes);
    assert.equal(archivedPayload.length, originalBytes.length);
    assert.equal(sha256(archivedPayload), sha256(originalBytes));

    // 6. Direct database RPC restoration (Privileged Database Integration)
    const openRes = await admin.rpc('open_recovery_import', { p_actor: adminUser, p_id: randomUUID() });
    assert.ok(!openRes.error && openRes.data);
    const importId = tracker.trackImport(openRes.data.id);
    const importUploadKey = tracker.trackKey(openRes.data.upload_key);
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: importUploadKey,
      Body: archiveBytes,
      ContentType: 'application/zip',
      ContentLength: archiveBytes.length,
    }));

    const sealRes = await admin.rpc('seal_recovery_import', { p_actor: adminUser, p_id: importId, p_sha256: recRow.data.sha256 });
    assert.ok(!sealRes.error && sealRes.data);

    // Robust UUIDv5 generation preserving exact parent path
    const pair = makeKeyPair(`private/${clientUser}/ticket_${ticketId}`, 'pdf');
    const newFileId = pair.finalId;
    const restoredKey = tracker.trackKey(pair.finalKey);

    const plan = {
      files: [{ source_id: fileId, id: newFileId, key: restoredKey }]
    };
    const planRes = await admin.rpc('plan_recovery_objects', { p_actor: adminUser, p_id: importId, p_plan: plan });
    assert.ok(!planRes.error);

    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: restoredKey,
      Body: archivedPayload,
      ContentType: 'application/pdf',
      ContentLength: archivedPayload.length,
      IfNoneMatch: '*',
    }));
    const regRes = await admin.rpc('register_immutable_upload', {
      p_source: pair.sourceKey,
      p_key: restoredKey,
      p_sha256: sha256(archivedPayload),
      p_size: archivedPayload.length
    });
    assert.ok(!regRes.error, regRes.error?.message);

    const cpRes = await admin.rpc('checkpoint_recovery_object', { p_actor: adminUser, p_id: importId, p_source_id: fileId });
    assert.ok(!cpRes.error);

    const restoreRes = await admin.rpc('restore_recovery_import', { p_actor: adminUser, p_id: importId, p_mapping: plan });
    assert.ok(!restoreRes.error && restoreRes.data);

    tracker.trackFile(newFileId);

    // 7. Verify restored file record
    const restoredRow = await admin.from('files').select('*').eq('id', newFileId).single();
    assert.ok(!restoredRow.error && restoredRow.data);
    assert.equal(restoredRow.data.ticket_id, ticketId);
    assert.equal(restoredRow.data.r2_key, restoredKey);
    assert.equal(Number(restoredRow.data.size_bytes), originalBytes.length);

    // 8. Compare hashes & lengths across all 3 stages
    const restoredBytes = await readRecoveryBytes(restoredKey);
    assert.equal(originalBytes.length, archivedPayload.length);
    assert.equal(archivedPayload.length, restoredBytes.length);
    assert.equal(sha256(originalBytes), sha256(archivedPayload));
    assert.equal(sha256(archivedPayload), sha256(restoredBytes));

    const outboxAfterRes = await admin.from('email_outbox').select('id, state, entity_id');
    assert.ok(!outboxAfterRes.error && outboxAfterRes.data);
    const outboxForRestoredFile = outboxAfterRes.data.filter(r => r.entity_id === newFileId);
    assert.equal(outboxForRestoredFile.filter(r => ['pending', 'processing', 'sent'].includes(r.state)).length, 0, 'No active email event for restored file');
    console.log('PASS 3.1: Ticket attachment direct RPC restore hash match:', sha256(restoredBytes));
  });

  await t.test('3.2 Helper/database/storage integration: Project deliverable backup on delete and privileged RPC restore', async () => {
    // 1. Create project
    const projRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Deliverable Test Project (DB helper)',
      status: 'active',
      description: 'Synthetic project for deliverable backup verification',
    }).select('id').single();
    assert.ok(!projRes.error && projRes.data);
    const projectId = tracker.trackProject(projRes.data.id);

    // 2. Upload staging deliverable
    const stageId = randomUUID();
    const stageKey = tracker.trackKey(`private/${clientUser}/project_${projectId}/${stageId}.pdf`);
    const deliverableBytes = Buffer.from('Synthetic project deliverable content for backup test 2026.', 'utf8');
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: stageKey,
      Body: deliverableBytes,
      ContentType: 'application/pdf',
      ContentLength: deliverableBytes.length,
    }));

    // 3. Finalize and confirm deliverable
    const valRes = await validateDeliverable(projectId, { key: stageKey, filename: 'Deliverable.pdf', mime: 'application/pdf', size_bytes: deliverableBytes.length });
    const finalKey = tracker.trackKey(valRes.key);
    const confRes = await admin.rpc('confirm_project_deliverable', {
      p_actor: adminUser,
      p_project: projectId,
      p_file: { r2_key: finalKey, filename: 'Deliverable.pdf', mime: 'application/pdf', size_bytes: deliverableBytes.length }
    });
    assert.ok(!confRes.error && confRes.data);
    const fileId = tracker.trackFile(typeof confRes.data === 'string' ? confRes.data : confRes.data.id);

    // 4. Delete deliverable to trigger backup
    const delRes = await deleteOwnedFile(fileId, { userId: adminUser, role: 'admin' });
    assert.deepEqual(delRes, { ok: true });

    const recRow = await admin.from('file_recovery').select('*').eq('file_id', fileId).single();
    assert.ok(!recRow.error && recRow.data);
    const archiveKey = tracker.trackKey(recRow.data.recovery_key);
    const archiveBytes = await readRecoveryBytes(archiveKey);
    const entries = decodeRecoveryArchive(archiveBytes);
    const archivedPayload = entries.get(`files/${fileId}`);
    assert.deepEqual(archivedPayload, deliverableBytes);

    // 5. Restore deliverable through privileged RPCs
    const importId = tracker.trackImport(randomUUID());
    const openRes = await admin.rpc('open_recovery_import', { p_actor: adminUser, p_id: importId });
    assert.ok(!openRes.error);
    const importUploadKey = tracker.trackKey(`archive/project_${projectId}/import_${importId}.zip`);
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: importUploadKey,
      Body: archiveBytes,
      ContentType: 'application/zip',
    }));
    const sealRes = await admin.rpc('seal_recovery_import', { p_actor: adminUser, p_id: importId, p_sha256: recRow.data.sha256 });
    assert.ok(!sealRes.error);

    const pair = makeKeyPair(`private/${clientUser}/project_${projectId}`, 'pdf');
    const newFileId = pair.finalId;
    const restoredKey = tracker.trackKey(pair.finalKey);
    const plan = { files: [{ source_id: fileId, id: newFileId, key: restoredKey }] };
    const planRes = await admin.rpc('plan_recovery_objects', { p_actor: adminUser, p_id: importId, p_plan: plan });
    assert.ok(!planRes.error);

    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: restoredKey,
      Body: archivedPayload,
      ContentType: 'application/pdf',
      ContentLength: archivedPayload.length,
      IfNoneMatch: '*',
    }));
    const regRes = await admin.rpc('register_immutable_upload', {
      p_source: pair.sourceKey,
      p_key: restoredKey,
      p_sha256: sha256(archivedPayload),
      p_size: archivedPayload.length,
    });
    assert.ok(!regRes.error, regRes.error?.message);

    const cpRes = await admin.rpc('checkpoint_recovery_object', { p_actor: adminUser, p_id: importId, p_source_id: fileId });
    assert.ok(!cpRes.error);

    const resResult = await admin.rpc('restore_recovery_import', { p_actor: adminUser, p_id: importId, p_mapping: plan });
    assert.ok(!resResult.error && resResult.data);
    tracker.trackFile(newFileId);

    // 6. Verify restored deliverable and hash equality
    const restoredRow = await admin.from('files').select('*').eq('id', newFileId).single();
    assert.ok(!restoredRow.error && restoredRow.data);
    assert.equal(restoredRow.data.project_id, projectId);
    const restoredBytes = await readRecoveryBytes(restoredKey);
    assert.equal(sha256(deliverableBytes), sha256(restoredBytes));
    assert.equal(deliverableBytes.length, restoredBytes.length);

    const outboxAfterRes = await admin.from('email_outbox').select('id, state, entity_id, error_code, template');
    assert.ok(!outboxAfterRes.error && outboxAfterRes.data);
    const outboxForRestoredDeliverable = outboxAfterRes.data.filter(r => r.entity_id === newFileId);
    assert.equal(outboxForRestoredDeliverable.filter(r => ['pending', 'processing', 'sent'].includes(r.state)).length, 0, 'No active email event for restored deliverable');
    const suppressedEvent = outboxForRestoredDeliverable.find(r => r.state === 'suppressed');
    assert.ok(suppressedEvent, 'Suppressed outbox event created for restored deliverable');
    assert.equal(suppressedEvent.error_code, 'recovery_restore');
    assert.equal(suppressedEvent.template, 'deliverable-uploaded');
    console.log('PASS 3.2: Project deliverable direct RPC restore hash match:', sha256(restoredBytes));
  });

  await t.test('3.3 Helper/database/storage integration: Multi-file project backup, purge, and privileged RPC restore', async () => {
    // 1. Create project with milestones
    const projRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Multi-Deliverable Project (DB helper)',
      status: 'active',
      description: 'Project to be archived and restored via direct RPC',
    }).select('id').single();
    assert.ok(!projRes.error && projRes.data);
    const projectId = tracker.trackProject(projRes.data.id);

    const mRes = await admin.from('milestones').insert([
      { project_id: projectId, title: 'Milestone 1', amount_cents: 10000, position: 0, status: 'done' },
      { project_id: projectId, title: 'Milestone 2', amount_cents: 20000, position: 1, status: 'pending' },
    ]).select('id');
    assert.ok(!mRes.error);

    // 2. Create 2 deliverables
    const file1Bytes = Buffer.from('File 1 content for project archive test', 'utf8');
    const file2Bytes = Buffer.from('File 2 content for project archive test', 'utf8');
    const stageKey1 = tracker.trackKey(`private/${clientUser}/project_${projectId}/${randomUUID()}.pdf`);
    const stageKey2 = tracker.trackKey(`private/${clientUser}/project_${projectId}/${randomUUID()}.docx`);
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: stageKey1, Body: file1Bytes, ContentType: 'application/pdf' }));
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: stageKey2, Body: file2Bytes, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

    const v1 = await validateDeliverable(projectId, { key: stageKey1, filename: 'Spec1.pdf', mime: 'application/pdf', size_bytes: file1Bytes.length });
    const v2 = await validateDeliverable(projectId, { key: stageKey2, filename: 'Spec2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: file2Bytes.length });
    tracker.trackKey(v1.key);
    tracker.trackKey(v2.key);

    const c1 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: projectId, p_file: { r2_key: v1.key, filename: 'Spec1.pdf', mime: 'application/pdf', size_bytes: file1Bytes.length } });
    const c2 = await admin.rpc('confirm_project_deliverable', { p_actor: adminUser, p_project: projectId, p_file: { r2_key: v2.key, filename: 'Spec2.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: file2Bytes.length } });
    assert.ok(!c1.error && c1.data && !c2.error && c2.data);
    const f1Id = tracker.trackFile(typeof c1.data === 'string' ? c1.data : c1.data.id);
    const f2Id = tracker.trackFile(typeof c2.data === 'string' ? c2.data : c2.data.id);

    // 3. Archive project
    const arcRes = await archiveProject(projectId);
    assert.equal(arcRes.ok, true);

    // 4. Purge project
    const purgeRes = await purgeArchivedProject(projectId);
    assert.equal(purgeRes.ok, true);

    const projRecRow = await admin.from('project_recovery').select('*').eq('project_id', projectId).single();
    assert.ok(!projRecRow.error && projRecRow.data);
    const recoveryKey = tracker.trackKey(projRecRow.data.recovery_key);

    const projCheck = await admin.from('projects').select('id').eq('id', projectId);
    assert.ok(!projCheck.error && projCheck.data.length === 0);

    // 5. Restore multi-file project backup via direct RPC
    const projectZipBytes = await readRecoveryBytes(recoveryKey);
    const importId = tracker.trackImport(randomUUID());
    const openRes = await admin.rpc('open_recovery_import', { p_actor: adminUser, p_id: importId });
    assert.ok(!openRes.error);
    const importUploadKey = tracker.trackKey(`archive/project_${projectId}/import_${importId}.zip`);
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: importUploadKey,
      Body: projectZipBytes,
      ContentType: 'application/zip',
    }));
    const sealRes = await admin.rpc('seal_recovery_import', { p_actor: adminUser, p_id: importId, p_sha256: projRecRow.data.sha256 });
    assert.ok(!sealRes.error && sealRes.data);

    const newProjectId = tracker.trackProject(randomUUID());
    const pair1 = makeKeyPair(`private/${clientUser}/project_${newProjectId}`, 'pdf');
    const pair2 = makeKeyPair(`private/${clientUser}/project_${newProjectId}`, 'docx');
    const newF1Id = pair1.finalId;
    const newF2Id = pair2.finalId;
    const newKey1 = tracker.trackKey(pair1.finalKey);
    const newKey2 = tracker.trackKey(pair2.finalKey);

    const projectPlan = {
      project_id: newProjectId,
      files: [
        { source_id: f1Id, id: newF1Id, key: newKey1 },
        { source_id: f2Id, id: newF2Id, key: newKey2 },
      ]
    };
    const planRes = await admin.rpc('plan_recovery_objects', { p_actor: adminUser, p_id: importId, p_plan: projectPlan });
    assert.ok(!planRes.error);

    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: newKey1, Body: file1Bytes, ContentType: 'application/pdf', IfNoneMatch: '*' }));
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: newKey2, Body: file2Bytes, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', IfNoneMatch: '*' }));

    const r1 = await admin.rpc('register_immutable_upload', { p_source: pair1.sourceKey, p_key: newKey1, p_sha256: sha256(file1Bytes), p_size: file1Bytes.length });
    const r2 = await admin.rpc('register_immutable_upload', { p_source: pair2.sourceKey, p_key: newKey2, p_sha256: sha256(file2Bytes), p_size: file2Bytes.length });
    assert.ok(!r1.error && !r2.error);

    await admin.rpc('checkpoint_recovery_object', { p_actor: adminUser, p_id: importId, p_source_id: f1Id });
    await admin.rpc('checkpoint_recovery_object', { p_actor: adminUser, p_id: importId, p_source_id: f2Id });

    const finalRestore = await admin.rpc('restore_recovery_import', { p_actor: adminUser, p_id: importId, p_mapping: projectPlan });
    assert.ok(!finalRestore.error && finalRestore.data);
    assert.equal(finalRestore.data.projectId, newProjectId);
    tracker.trackFile(newF1Id);
    tracker.trackFile(newF2Id);

    // 6. Verify recreated project, milestones, deliverables
    const restoredProject = await admin.from('projects').select('*').eq('id', newProjectId).single();
    assert.ok(!restoredProject.error && restoredProject.data);
    assert.equal(restoredProject.data.client_id, clientUser);
    assert.equal(restoredProject.data.name, 'Multi-Deliverable Project (DB helper)');

    const restoredMilestones = await admin.from('milestones').select('*').eq('project_id', newProjectId).order('position');
    assert.ok(!restoredMilestones.error && restoredMilestones.data.length === 2);
    assert.equal(restoredMilestones.data[0].title, 'Milestone 1');
    assert.equal(restoredMilestones.data[1].title, 'Milestone 2');

    const restoredFiles = await admin.from('files').select('*').eq('project_id', newProjectId);
    assert.ok(!restoredFiles.error && restoredFiles.data.length === 2);

    assert.deepEqual(await readRecoveryBytes(newKey1), file1Bytes);
    assert.deepEqual(await readRecoveryBytes(newKey2), file2Bytes);
    console.log('PASS 3.3: Multi-file project restore via direct RPC succeeded with new ID:', newProjectId);
  });

  await t.test('3.4 Helper/database/storage integration: Legacy mutable-file deletion refusal without immutable upload proof', async () => {
    // 1. Create project
    const pRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Legacy Project (DB helper)',
      status: 'active',
    }).select('id').single();
    assert.ok(!pRes.error && pRes.data);
    const pId = tracker.trackProject(pRes.data.id);

    // 2. Directly insert unfinalized mutable file into files table
    const legacyKey = tracker.trackKey(`private/${clientUser}/project_${pId}/${randomUUID()}.pdf`);
    const legacyBytes = Buffer.from('Legacy mutable file bytes without immutable upload proof', 'utf8');
    await storage.send(new PutObjectCommand({ Bucket: ENV.PRIVATE_BUCKET, Key: legacyKey, Body: legacyBytes, ContentType: 'application/pdf' }));

    const fRes = await admin.from('files').insert({
      bucket: 'private',
      kind: 'deliverable',
      project_id: pId,
      uploaded_by: adminUser,
      r2_key: legacyKey,
      filename: 'Legacy.pdf',
      mime: 'application/pdf',
      size_bytes: legacyBytes.length,
    }).select('id').single();
    assert.ok(!fRes.error && fRes.data);
    const legacyFileId = tracker.trackFile(fRes.data.id);

    // 3. Attempt deleteOwnedFile on mutable file without immutable_uploads entry
    const delResult = await deleteOwnedFile(legacyFileId, { userId: adminUser, role: 'admin' });
    assert.equal(delResult.ok, false);
    assert.match(delResult.error, /held/);

    const fileCheck = await admin.from('files').select('id').eq('id', legacyFileId);
    assert.ok(!fileCheck.error && fileCheck.data.length === 1);
    const storageBytes = await readRecoveryBytes(legacyKey);
    assert.deepEqual(storageBytes, legacyBytes);
    console.log('PASS 3.4: Legacy unfinalized file deletion refused and bytes preserved intact');
  });

  await t.test('3.5 End-to-end HTTP API round trip: Ticket attachment restore via authenticated /api/recovery', async () => {
    // 1. Create ticket
    const ticketRes = await admin.from('tickets').insert({
      client_id: clientUser,
      subject: 'Ticket Attachment HTTP Round Trip',
      status: 'open',
    }).select('id').single();
    assert.ok(!ticketRes.error && ticketRes.data);
    const ticketId = tracker.trackTicket(ticketRes.data.id);

    // 2. Staging upload via presigned URL
    const stageId = randomUUID();
    const stageKey = tracker.trackKey(`private/${clientUser}/ticket_${ticketId}/${stageId}.pdf`);
    const originalBytes = Buffer.from('HTTP API Round Trip Ticket Attachment Content 2026', 'utf8');

    const presignedUrl = await presignPrivatePut(stageKey, 'application/pdf', originalBytes.length, 300);
    const putRes = await safeFetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: originalBytes,
    });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    // 3. Finalize attachment (copies to deterministic UUIDv5 key and registers immutable_uploads)
    const entries = [{ key: stageKey, filename: 'HttpDoc.pdf', mime: 'application/pdf', size_bytes: originalBytes.length }];
    const validated = await validateAttachments(entries, clientUser, ticketId);
    assert.ok(validated && validated.length === 1);
    const finalKey = tracker.trackKey(validated[0].key);

    const fRes = await admin.from('files').insert({
      bucket: 'private',
      kind: 'attachment',
      ticket_id: ticketId,
      uploaded_by: clientUser,
      r2_key: finalKey,
      filename: 'HttpDoc.pdf',
      mime: 'application/pdf',
      size_bytes: originalBytes.length,
    }).select('id').single();
    assert.ok(!fRes.error && fRes.data);
    const fileId = tracker.trackFile(fRes.data.id);

    // 4. Delete attachment to produce registered backup
    const delRes = await deleteOwnedFile(fileId, { userId: clientUser, role: 'client' });
    assert.deepEqual(delRes, { ok: true });

    const recRow = await admin.from('file_recovery').select('*').eq('file_id', fileId).single();
    assert.ok(!recRow.error && recRow.data);
    const archiveKey = tracker.trackKey(recRow.data.recovery_key);
    const archiveBytes = await readRecoveryBytes(archiveKey);
    assert.equal(sha256(archiveBytes), recRow.data.sha256);

    // 5. Restore through HTTP /api/recovery endpoints
    // Step A: Upload request
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: archiveBytes.length }),
    });
    assert.equal(upRes.status, 200);
    const upData = await upRes.json();
    assert.ok(upData.id && upData.url);
    const importId = tracker.trackImport(upData.id);

    // Step B: Direct PUT to presigned upload URL
    const uploadPutRes = await safeFetch(upData.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: archiveBytes,
    });
    assert.ok(uploadPutRes.status === 200 || uploadPutRes.status === 204);

    // Step C: Preview (seals archive and creates plan)
    const prevRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: importId }),
    });
    assert.equal(prevRes.status, 200);
    const prevData = await prevRes.json();
    assert.equal(prevData.files, 1);
    assert.equal(prevData.kind, 'individual');

    // Step D: Restore chunk execution (bounded loop with monotonic progress)
    let restoreData;
    let attempts = 0;
    let lastCompleted = 0;
    while (true) {
      assert.ok(++attempts <= 10, 'Restore loop exceeded maximum expected attempts');
      const rRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
        method: 'POST',
        headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id: importId }),
      });
      assert.equal(rRes.status, 200);
      restoreData = await rRes.json();
      if (!restoreData.pending) break;
      assert.equal(restoreData.id, importId, 'Restore response returned stable import ID');
      assert.ok(restoreData.completed > lastCompleted, 'Restore chunk advanced completed count monotonically');
      lastCompleted = restoreData.completed;
    }
    assert.ok(restoreData.result);
    assert.ok(Array.isArray(restoreData.result.fileIds) && restoreData.result.fileIds.length === 1);
    const restoredFileId = tracker.trackFile(restoreData.result.fileIds[0]);

    // 6. Verify restored file record in DB and storage
    const restoredRow = await admin.from('files').select('*').eq('id', restoredFileId).single();
    assert.ok(!restoredRow.error && restoredRow.data);
    assert.equal(restoredRow.data.ticket_id, ticketId);
    tracker.trackKey(restoredRow.data.r2_key);

    const restoredBytes = await readRecoveryBytes(restoredRow.data.r2_key);
    assert.equal(restoredBytes.length, originalBytes.length);
    assert.equal(sha256(restoredBytes), sha256(originalBytes));

    // 7. Verify outbox: no active email queued for restored file (filtered directly in SQL)
    const outboxRes = await admin.from('email_outbox').select('id, state, entity_id').eq('entity_id', restoredFileId);
    assert.ok(!outboxRes.error && outboxRes.data);
    const activeEmails = outboxRes.data.filter(r => ['pending', 'processing', 'sent'].includes(r.state));
    assert.equal(activeEmails.length, 0);

    console.log('PASS 3.5: Ticket attachment full HTTP /api/recovery round trip verified. Restored hash:', sha256(restoredBytes));
  });

  await t.test('3.6 End-to-end HTTP API round trip: Project deliverable restore via authenticated /api/recovery', async () => {
    // 1. Create project and milestone
    const projRes = await admin.from('projects').insert({
      client_id: clientUser,
      name: 'Deliverable HTTP Round Trip Project',
      status: 'active',
      description: 'Synthetic project for HTTP API deliverable round trip',
    }).select('id').single();
    assert.ok(!projRes.error && projRes.data);
    const projectId = tracker.trackProject(projRes.data.id);

    // 2. Upload staging deliverable
    const stageId = randomUUID();
    const stageKey = tracker.trackKey(`private/${clientUser}/project_${projectId}/${stageId}.pdf`);
    const deliverableBytes = Buffer.from('HTTP Deliverable Round Trip Content 2026', 'utf8');

    const presignedUrl = await presignPrivatePut(stageKey, 'application/pdf', deliverableBytes.length, 300);
    const putRes = await safeFetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: deliverableBytes,
    });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    // 3. Finalize and confirm deliverable
    const valRes = await validateDeliverable(projectId, { key: stageKey, filename: 'DeliverableHTTP.pdf', mime: 'application/pdf', size_bytes: deliverableBytes.length });
    tracker.trackKey(valRes.key);
    const confRes = await admin.rpc('confirm_project_deliverable', {
      p_actor: adminUser,
      p_project: projectId,
      p_file: { r2_key: valRes.key, filename: 'DeliverableHTTP.pdf', mime: 'application/pdf', size_bytes: deliverableBytes.length }
    });
    assert.ok(!confRes.error && confRes.data);
    const fileId = tracker.trackFile(typeof confRes.data === 'string' ? confRes.data : confRes.data.id);

    // 4. Delete deliverable to trigger backup
    const delRes = await deleteOwnedFile(fileId, { userId: adminUser, role: 'admin' });
    assert.deepEqual(delRes, { ok: true });

    const recRow = await admin.from('file_recovery').select('*').eq('file_id', fileId).single();
    assert.ok(!recRow.error && recRow.data);
    const archiveKey = tracker.trackKey(recRow.data.recovery_key);
    const archiveBytes = await readRecoveryBytes(archiveKey);
    assert.equal(sha256(archiveBytes), recRow.data.sha256);

    // 5. Restore deliverable through HTTP /api/recovery endpoints
    // Step A: Upload
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: archiveBytes.length }),
    });
    assert.equal(upRes.status, 200);
    const upData = await upRes.json();
    assert.ok(upData.id && upData.url);
    const importId = tracker.trackImport(upData.id);

    // Step B: Put archive bytes
    const uploadPutRes = await safeFetch(upData.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: archiveBytes,
    });
    assert.ok(uploadPutRes.status === 200 || uploadPutRes.status === 204);

    // Step C: Preview
    const prevRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: importId }),
    });
    assert.equal(prevRes.status, 200);
    const prevData = await prevRes.json();
    assert.equal(prevData.files, 1);
    assert.equal(prevData.kind, 'individual');

    // Step D: Restore chunk (bounded loop with monotonic progress)
    let restoreData;
    let attempts = 0;
    let lastCompleted = 0;
    while (true) {
      assert.ok(++attempts <= 10, 'Restore loop exceeded maximum expected attempts');
      const rRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
        method: 'POST',
        headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id: importId }),
      });
      assert.equal(rRes.status, 200);
      restoreData = await rRes.json();
      if (!restoreData.pending) break;
      assert.equal(restoreData.id, importId, 'Restore response returned stable import ID');
      assert.ok(restoreData.completed > lastCompleted, 'Restore chunk advanced completed count monotonically');
      lastCompleted = restoreData.completed;
    }
    assert.ok(restoreData.result);
    assert.ok(Array.isArray(restoreData.result.fileIds) && restoreData.result.fileIds.length === 1);
    const restoredFileId = tracker.trackFile(restoreData.result.fileIds[0]);

    // 6. Verify restored file record and storage bytes
    const restoredRow = await admin.from('files').select('*').eq('id', restoredFileId).single();
    assert.ok(!restoredRow.error && restoredRow.data);
    assert.equal(restoredRow.data.project_id, projectId);
    tracker.trackKey(restoredRow.data.r2_key);

    const restoredBytes = await readRecoveryBytes(restoredRow.data.r2_key);
    assert.equal(restoredBytes.length, deliverableBytes.length);
    assert.equal(sha256(restoredBytes), sha256(deliverableBytes));

    // 7. Verify outbox: 0 active delivery emails, 1 suppressed event (filtered directly in SQL)
    const outboxRes = await admin.from('email_outbox').select('id, state, entity_id, error_code, template').eq('entity_id', restoredFileId);
    assert.ok(!outboxRes.error && outboxRes.data);
    const activeEmails = outboxRes.data.filter(r => ['pending', 'processing', 'sent'].includes(r.state));
    assert.equal(activeEmails.length, 0);

    const suppressedEvent = outboxRes.data.find(r => r.state === 'suppressed');
    assert.ok(suppressedEvent, 'Suppressed outbox event exists for restored deliverable');
    assert.equal(suppressedEvent.error_code, 'recovery_restore');
    assert.equal(suppressedEvent.template, 'deliverable-uploaded');

    console.log('PASS 3.6: Project deliverable full HTTP /api/recovery round trip verified. Restored hash:', sha256(restoredBytes));
  });
});
