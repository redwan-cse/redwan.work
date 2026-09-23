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

const { validateAttachments } = await import('../../lib/crm/attachments.ts');
const { deleteOwnedFile } = await import('../../lib/crm/file-deletion.ts');
const { readRecoveryBytes } = await import('../../lib/crm/recovery-storage.ts');
const { decodeRecoveryArchive } = await import('../../lib/crm/recovery-archive.ts');
const { presignPrivatePut } = await import('../../lib/r2.ts');

test('Section 6: Staging replay safety and finalized object immutability', { timeout: 120000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);
  let clientUser, ticketId;

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('Setup synthetic client, ticket, and tracker', async () => {
    const cRes = await admin.auth.admin.createUser({
      email: `client-sec6-${randomBytes(6).toString('hex')}@example.test`,
      password: 'Password123!@#',
      email_confirm: true,
      app_metadata: { role: 'client' },
    });
    assert.ok(!cRes.error && cRes.data?.user);
    clientUser = tracker.trackUser(cRes.data.user.id);
    const pRes = await admin.from('profiles').update({ role: 'client', is_active: true }).eq('id', clientUser);
    assert.ok(!pRes.error);

    const ticketRes = await admin.from('tickets').insert({
      client_id: clientUser,
      subject: 'Staging replay test ticket',
      status: 'open',
    }).select('id').single();
    assert.ok(!ticketRes.error && ticketRes.data);
    ticketId = tracker.trackTicket(ticketRes.data.id);
  });

  let stageKey, finalKey, fileId, stagingPresignedUrl;
  const bytesA = Buffer.from('Immutable Original Payload A - 2026 Test', 'utf8');
  const bytesB = Buffer.from('Tampered Attack Payload B - Overwrite!!!', 'utf8'); // Exactly 40 bytes, identical length
  assert.equal(bytesA.length, bytesB.length, 'Payload A and B have identical length but distinct contents');
  assert.notEqual(sha256(bytesA), sha256(bytesB));

  await t.test('6.1 Staging upload via presigned PUT, finalization to UUIDv5, and proof registration', async () => {
    const stageId = randomUUID();
    stageKey = tracker.trackKey(`private/${clientUser}/ticket_${ticketId}/${stageId}.pdf`);

    // 1. Obtain presigned PUT URL for staging key
    stagingPresignedUrl = await presignPrivatePut(stageKey, 'application/pdf', bytesA.length, 300);

    // 2. Upload bytes A using presigned PUT URL
    const putRes = await safeFetch(stagingPresignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: bytesA,
    });
    assert.ok(putRes.status === 200 || putRes.status === 204);

    // 3. Finalize via validateAttachments (copies staging to UUIDv5 and registers immutable_uploads)
    const entries = [{ key: stageKey, filename: 'Document.pdf', mime: 'application/pdf', size_bytes: bytesA.length }];
    const validated = await validateAttachments(entries, clientUser, ticketId);
    assert.ok(validated && validated.length === 1);
    finalKey = tracker.trackKey(validated[0].key);
    assert.notEqual(finalKey, stageKey);
    assert.match(finalKey, /-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);

    // Insert into files table
    const fRes = await admin.from('files').insert({
      bucket: 'private',
      kind: 'attachment',
      ticket_id: ticketId,
      uploaded_by: clientUser,
      r2_key: finalKey,
      filename: 'Document.pdf',
      mime: 'application/pdf',
      size_bytes: bytesA.length,
    }).select('id').single();
    assert.ok(!fRes.error && fRes.data);
    fileId = tracker.trackFile(fRes.data.id);

    // Verify immutable_uploads record
    const proof = await admin.from('immutable_uploads').select('*').eq('r2_key', finalKey).single();
    assert.ok(!proof.error && proof.data);
    assert.equal(proof.data.sha256, sha256(bytesA));
    assert.equal(Number(proof.data.size_bytes), bytesA.length);
    console.log('PASS 6.1: Payload A uploaded via presigned PUT, finalized to UUIDv5, verified in immutable_uploads');
  });

  await t.test('6.2 Presigned PUT replay of bytes B on still-valid staging URL; finalized key and backup retain bytes A', async () => {
    // Replay attack: An attacker or late network retransmission uses the STILL-VALID presigned staging PUT URL
    // to overwrite the staging key with bytes B (same byte length).
    const replayPutRes = await safeFetch(stagingPresignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: bytesB,
    });
    assert.ok(replayPutRes.status === 200 || replayPutRes.status === 204, 'Staging presigned URL accepted replay PUT');

    // Verify staging key in storage now contains tampered bytes B
    const readStaging = await readRecoveryBytes(stageKey);
    assert.deepEqual(readStaging, bytesB, 'Staging key now reflects overwritten bytes B');

    // CRITICAL SECURITY ASSERTION: Finalized UUIDv5 destination object MUST STILL contain bytes A!
    const readFinalized = await readRecoveryBytes(finalKey);
    assert.deepEqual(readFinalized, bytesA, 'Finalized UUIDv5 key is completely immune to staging replay');
    assert.equal(sha256(readFinalized), sha256(bytesA));

    // Delete file through application path to trigger backup creation
    const delRes = await deleteOwnedFile(fileId, { userId: clientUser, role: 'client' });
    assert.deepEqual(delRes, { ok: true });

    // Verify backup in file_recovery captures bytes A, NOT tampered bytes B
    const recRow = await admin.from('file_recovery').select('*').eq('file_id', fileId).single();
    assert.ok(!recRow.error && recRow.data);
    tracker.trackKey(recRow.data.recovery_key);

    const archiveBytes = await readRecoveryBytes(recRow.data.recovery_key);
    assert.equal(recRow.data.sha256, sha256(archiveBytes));

    const archiveMap = decodeRecoveryArchive(archiveBytes);
    const archivedPayload = archiveMap.get(`files/${fileId}`);
    assert.deepEqual(archivedPayload, bytesA, 'Backup archive preserves authentic bytes A');
    assert.notDeepEqual(archivedPayload, bytesB, 'Backup archive does NOT contain tampered bytes B');
    console.log('PASS 6.2: Presigned PUT staging replay did not alter finalized object or application backup');
  });

  await t.test('6.3 Presigned PUT policy rejects signing finalized UUIDv5 keys and archive keys', async () => {
    // Attempt to presign PUT for finalized UUIDv5 key
    await assert.rejects(
      async () => { await presignPrivatePut(finalKey, 'application/pdf', 100, 60); },
      /Invalid upload destination\./
    );

    // Attempt to presign PUT for archive key
    await assert.rejects(
      async () => { await presignPrivatePut(`archive/project_${randomUUID()}/test.zip`, 'application/zip', 100, 60); },
      /Invalid upload destination\./
    );
    console.log('PASS 6.3: presigned PUT strictly refuses finalized keys and archive keys');
  });

  await t.test('6.4 Conditional PUT prevents replacing finalized UUIDv5 storage bytes', async () => {
    // Scope note: If-None-Match: * is a storage-level precondition check that prevents overwriting
    // an existing object at the finalized destination during copy/restore (returns 412 Precondition Failed).
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: finalKey,
      Body: bytesA,
      ContentType: 'application/pdf',
    }));

    // Attempting to overwrite existing finalKey with IfNoneMatch: '*' returns 412 Precondition Failed
    await assert.rejects(
      async () => {
        await storage.send(new PutObjectCommand({
          Bucket: ENV.PRIVATE_BUCKET,
          Key: finalKey,
          Body: bytesB,
          ContentType: 'application/pdf',
          IfNoneMatch: '*',
        }));
      },
      (err) => {
        return err.name === 'PreconditionFailed' || err.$metadata?.httpStatusCode === 412;
      }
    );

    // Verify storage bytes still match bytes A
    const finalBytesAfter = await readRecoveryBytes(finalKey);
    assert.deepEqual(finalBytesAfter, bytesA);
    console.log('PASS 6.4: Conditional PUT (If-None-Match: *) prevents replacing finalized object bytes');
  });
});
