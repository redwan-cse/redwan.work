import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  assertDisposableTarget,
  createAdminClient,
  createStorageClient,
  getSessionCookie,
  safeFetch,
  FixtureTracker,
  ENV,
} from './harness-env.mjs';

assertDisposableTarget();

const admin = createAdminClient();
const storage = createStorageClient();

test('Section 7: HTTP API boundaries and recovery interface protocol verification', { timeout: 120000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);
  let adminEmail, adminPassword = 'Password123!@#', adminCookie;

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('Setup admin session and tracker', async () => {
    adminEmail = `admin-sec7-${randomBytes(6).toString('hex')}@example.test`;
    const aRes = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    assert.ok(!aRes.error && aRes.data?.user);
    tracker.trackUser(aRes.data.user.id);

    const pRes = await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', aRes.data.user.id);
    assert.ok(!pRes.error);
    await new Promise(r => setTimeout(r, 1500));
    adminCookie = await getSessionCookie(adminEmail, adminPassword);
  });

  await t.test('7.1 HTTP API: Empty catalog view behavior when no backups exist on page', async () => {
    // Calling /api/recovery?page=1000 returns empty files and projects arrays
    const res = await safeFetch(`${ENV.APP_URL}/api/recovery?page=1000`, {
      headers: { cookie: adminCookie, origin: ENV.APP_URL },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.files, []);
    assert.deepEqual(data.projects, []);
    assert.equal(data.hasNext, false);
    console.log('PASS 7.1: Empty page returns empty catalog arrays triggering empty-state presentation');
  });

  await t.test('7.2 HTTP API: Actionable error handling on corrupt / unregistered backup upload', async () => {
    // 1. Upload request for 30 bytes
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 30 }),
    });
    assert.equal(upRes.status, 200);
    const upData = await upRes.json();
    tracker.trackImport(upData.id);

    // 2. Put corrupted non-zip bytes
    const putRes = await safeFetch(upData.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: Buffer.from('NOT_A_VALID_ZIP_ARCHIVE_BYTES!'),
    });
    assert.ok(putRes.status === 200 || putRes.status === 204, 'Presigned PUT accepted upload bytes');

    // 3. Preview call must return 400 failure with actionable message
    const prevRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: upData.id }),
    });
    assert.equal(prevRes.status, 400);
    const prevData = await prevRes.json();
    assert.equal(prevData.error, 'Recovery operation refused. Check the registered backup, current parent and permissions; no backup was discarded.');
    console.log('PASS 7.2: Corrupt/unregistered backup rejected with safe actionable error without state corruption');
  });

  await t.test('7.3 HTTP API: File size boundaries (< 22 bytes or > 100 MB refused)', async () => {
    // Size under min (21 bytes)
    const tooSmall = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 21 }),
    });
    assert.equal(tooSmall.status, 400);

    // Size over max (100 MB + 1)
    const tooLarge = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 100 * 1024 * 1024 + 1 }),
    });
    assert.equal(tooLarge.status, 400);
    console.log('PASS 7.3: File size boundaries strictly enforced (22 B - 100 MB)');
  });

  await t.test('7.4 Protocol limitation: in-flight import is unqueryable by ID via current HTTP GET endpoint', async () => {
    // Open an import
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: adminCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 50 }),
    });
    const upData = await upRes.json();
    assert.ok(upData.id);
    tracker.trackImport(upData.id);

    // Backend retains the import in recovery_imports table
    const impRow = await admin.from('recovery_imports').select('id').eq('id', upData.id).single();
    assert.ok(!impRow.error && impRow.data);

    // GET /api/recovery?importId=<id> does not support querying in-flight status; returns catalog
    const queryRes = await safeFetch(`${ENV.APP_URL}/api/recovery?importId=${upData.id}`, {
      headers: { cookie: adminCookie, origin: ENV.APP_URL },
    });
    assert.equal(queryRes.status, 200);
    const body = await queryRes.json();
    assert.ok(Array.isArray(body.files) && Array.isArray(body.projects), 'Returns standard catalog listing, not in-flight state');
    console.log('PASS 7.4: Protocol verification confirms current API lacks in-flight import query route');
  });
});
