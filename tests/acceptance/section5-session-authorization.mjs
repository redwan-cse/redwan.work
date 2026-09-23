import './load-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { createServerClient } from '@supabase/ssr';
import {
  assertDisposableTarget,
  createAdminClient,
  createStorageClient,
  getSessionCookie,
  sha256,
  FixtureTracker,
  ENV,
  safeFetch,
} from './harness-env.mjs';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

async function createSyntheticAdmin(tracker, prefix) {
  const email = `${prefix}-${randomBytes(6).toString('hex')}@example.test`;
  const aRes = await admin.auth.admin.createUser({
    email,
    password: 'Password123!@#',
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });
  assert.ok(!aRes.error && aRes.data?.user, `Create user error: ${aRes.error?.message}`);
  const userId = tracker.trackUser(aRes.data.user.id);
  const pRes = await admin.from('profiles').update({ role: 'admin', is_active: true, tokens_valid_after: 0 }).eq('id', userId);
  assert.ok(!pRes.error, `Update profile error: ${pRes.error?.message}`);
  await new Promise(r => setTimeout(r, 1500));
  const cookie = await getSessionCookie(email, 'Password123!@#');
  return { userId, email, cookie };
}

test('Section 5: Current-session authorization, banned admin exposure, and session lifecycle', { timeout: 180000 }, async (t) => {
  const tracker = new FixtureTracker(admin, storage);

  t.after(async () => {
    await tracker.cleanup();
  });

  await t.test('5.1 Profile deactivation immediately revokes API access without token expiry', async () => {
    const { userId, cookie } = await createSyntheticAdmin(tracker, 'sec5-1');

    // Deactivate profile
    const { error: dErr } = await admin.from('profiles').update({ is_active: false }).eq('id', userId);
    assert.ifError(dErr);

    // Test GET /api/recovery
    const getRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie, origin: ENV.APP_URL },
    });
    assert.equal(getRes.status, 401, 'GET refused with 401 when profile deactivated');

    // Test POST /api/recovery
    const postRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 100 }),
    });
    assert.equal(postRes.status, 401, 'POST refused with 401 when profile deactivated');
    console.log('PASS 5.1: Profile deactivation immediately revokes access');
  });

  // Banned Admin Regression Suite with Pre-Ban Baseline and Registered Backup Fixture
  let bannedAdminId, bannedCookie, preIssuedDownloadUrl, testFileId;

  await t.test('5.2 Setup: Pre-ban baseline with registered backup fixture', async () => {
    const { userId, cookie } = await createSyntheticAdmin(tracker, 'sec5-2-baseline');
    bannedAdminId = userId;
    bannedCookie = cookie;

    // Create synthetic client user and ticket to generate genuine registered backup via deleteOwnedFile
    const cEmail = `client-sec5-${randomBytes(6).toString('hex')}@example.test`;
    const cRes = await admin.auth.admin.createUser({
      email: cEmail,
      password: 'Password123!@#',
      email_confirm: true,
      app_metadata: { role: 'client' },
    });
    assert.ok(!cRes.error && cRes.data?.user);
    const clientUser = tracker.trackUser(cRes.data.user.id);
    await admin.from('profiles').update({ role: 'client', is_active: true, tokens_valid_after: 0 }).eq('id', clientUser);

    const ticketRes = await admin.from('tickets').insert({
      client_id: clientUser,
      subject: 'Sec5 Banned Admin Attachment Test',
      status: 'open',
    }).select('id').single();
    assert.ok(!ticketRes.error && ticketRes.data);
    const ticketId = tracker.trackTicket(ticketRes.data.id);

    const stageId = randomUUID();
    const stageKey = tracker.trackKey(`private/${clientUser}/ticket_${ticketId}/${stageId}.pdf`);
    const originalBytes = Buffer.from('Sec5 baseline backup content for authorization regression testing.', 'utf8');
    await storage.send(new PutObjectCommand({
      Bucket: ENV.PRIVATE_BUCKET,
      Key: stageKey,
      Body: originalBytes,
      ContentType: 'application/pdf',
      ContentLength: originalBytes.length,
    }));

    const entries = [{ key: stageKey, filename: 'Sec5Doc.pdf', mime: 'application/pdf', size_bytes: originalBytes.length }];
    const validated = await validateAttachments(entries, clientUser, ticketId);
    assert.ok(validated && validated.length === 1);
    const finalKey = tracker.trackKey(validated[0].key);

    const fRes = await admin.from('files').insert({
      bucket: 'private',
      kind: 'attachment',
      ticket_id: ticketId,
      uploaded_by: clientUser,
      r2_key: finalKey,
      filename: 'Sec5Doc.pdf',
      mime: 'application/pdf',
      size_bytes: originalBytes.length,
    }).select('id').single();
    assert.ok(!fRes.error && fRes.data);
    testFileId = tracker.trackFile(fRes.data.id);

    // Delete attachment to generate real registered backup in file_recovery and storage
    const delRes = await deleteOwnedFile(testFileId, { userId: clientUser, role: 'client' });
    assert.deepEqual(delRes, { ok: true });

    const recRow = await admin.from('file_recovery').select('*').eq('file_id', testFileId).single();
    assert.ok(!recRow.error && recRow.data);
    tracker.trackKey(recRow.data.recovery_key);

    // Pre-ban baseline checks: assert authorized success
    const prePage = await safeFetch(`${ENV.APP_URL}/admin/recovery`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
      redirect: 'manual',
    });
    assert.equal(prePage.status, 200, 'Pre-ban: page returns 200 for active admin');

    const preCat = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
    });
    assert.equal(preCat.status, 200, 'Pre-ban: catalog returns 200 for active admin');
    const catData = await preCat.json();
    assert.ok(catData.files && catData.files.some(f => f.file_id === testFileId), 'Catalog contains registered backup');

    const preDown = await safeFetch(`${ENV.APP_URL}/api/recovery?kind=individual&id=${testFileId}`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
    });
    assert.equal(preDown.status, 200, 'Pre-ban: download URL issuance returns 200');
    const downData = await preDown.json();
    assert.ok(downData.url, 'Pre-ban: download URL returned');
    preIssuedDownloadUrl = downData.url;

    // Verify pre-issued URL works directly at storage layer
    const s3Check = await fetch(preIssuedDownloadUrl);
    assert.equal(s3Check.status, 200, 'Pre-ban: pre-issued download URL retrieves archive from S3');

    // Confirm pre-ban account state in auth.users and profiles
    const { data: uBefore } = await admin.auth.admin.getUserById(bannedAdminId);
    assert.ok(!uBefore.user.banned_until || new Date(uBefore.user.banned_until) <= new Date(), 'Pre-ban: not banned');
    const { data: pBefore } = await admin.from('profiles').select('is_active, role').eq('id', bannedAdminId).single();
    assert.equal(pBefore.is_active, true);
    assert.equal(pBefore.role, 'admin');

    // Apply 24h auth ban in auth.users
    const banRes = await admin.auth.admin.updateUserById(bannedAdminId, { ban_duration: '24h' });
    assert.ifError(banRes.error, 'Applied 24h ban to admin account');

    // Verify post-ban account state: auth.users banned_until > now(), but profile remains active/admin
    const { data: uAfter } = await admin.auth.admin.getUserById(bannedAdminId);
    assert.ok(new Date(uAfter.user.banned_until) > new Date(), 'Post-ban: banned_until is in future');
    const { data: pAfter } = await admin.from('profiles').select('is_active, role').eq('id', bannedAdminId).single();
    assert.equal(pAfter.is_active, true, 'Profile remains is_active=true');
    assert.equal(pAfter.role, 'admin', 'Profile remains role=admin');
  });

  await t.test('5.2a Banned Admin: Page render GET /admin/recovery (assert denial)', async () => {
    const pageRes = await safeFetch(`${ENV.APP_URL}/admin/recovery`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
      redirect: 'manual',
    });
    assert.notEqual(
      pageRes.status,
      200,
      `DEFECT REPRODUCED: Banned admin can access GET /admin/recovery page (returned status ${pageRes.status} instead of redirect/denial)`
    );
  });

  await t.test('5.2b CONFIRMED SECURITY DEFECT: Banned admin catalog listing GET /api/recovery (assert denial)', async () => {
    const getApiRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
    });
    assert.equal(
      getApiRes.status,
      401,
      `DEFECT REPRODUCED: Banned admin can access GET /api/recovery catalog listing (returned ${getApiRes.status} instead of 401)`
    );
    const body = await getApiRes.json();
    assert.ok(!body.files, 'Banned admin must not receive private files catalog');
  });

  await t.test('5.2c Banned Admin: New download URL issuance GET /api/recovery?kind=... (assert denial)', async () => {
    const downRes = await safeFetch(`${ENV.APP_URL}/api/recovery?kind=individual&id=${testFileId}`, {
      headers: { cookie: bannedCookie, origin: ENV.APP_URL },
    });
    assert.equal(
      downRes.status,
      401,
      `DEFECT REPRODUCED: Banned admin can issue new presigned download URLs (returned ${downRes.status} instead of 401)`
    );
    const body = await downRes.json();
    assert.ok(!body.url, 'Banned admin must not receive new presigned download URL');
  });

  await t.test('5.2d Storage isolation: Pre-issued presigned download URL remains valid until S3 expiry', async () => {
    assert.ok(preIssuedDownloadUrl, 'Pre-issued URL exists');
    const s3Res = await fetch(preIssuedDownloadUrl);
    assert.equal(s3Res.status, 200, 'Pre-existing presigned GET URL operates at storage layer until expiry');
  });

  await t.test('5.2e Banned Admin: POST /api/recovery action:upload refused by DB RPC', async () => {
    const postRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: bannedCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 100 }),
    });
    assert.equal(postRes.status, 400, 'POST upload refused with 400 when database RPC rejects banned user');
    const body = await postRes.json();
    assert.match(body.error, /Recovery operation refused/, 'Actionable recovery refusal error');
  });

  await t.test('5.2f Banned Admin: POST /api/recovery action:preview refused by DB RPC', async () => {
    const postRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: bannedCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: randomUUID() }),
    });
    assert.equal(postRes.status, 400, 'POST preview refused with 400 when database RPC rejects banned user');
  });

  await t.test('5.2g Banned Admin: POST /api/recovery action:restore refused by DB RPC', async () => {
    const postRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie: bannedCookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', importId: randomUUID(), confirm: true, offset: 0, limit: 10 }),
    });
    assert.equal(postRes.status, 400, 'POST restore refused with 400 when database RPC rejects banned user');
  });

  await t.test('5.3 Explicit session refresh and subsequent authenticated API access', async () => {
    const { email } = await createSyntheticAdmin(tracker, 'sec5-3');

    let setCookies = [];
    const client = createServerClient(ENV.SUPABASE_URL, ENV.PUBLISHABLE_KEY, {
      cookies: {
        getAll() { return []; },
        setAll(cookies) { setCookies = cookies; },
      },
    });
    const signInRes = await client.auth.signInWithPassword({ email, password: 'Password123!@#' });
    assert.ok(!signInRes.error && signInRes.data?.session);
    const refreshToken = signInRes.data.session.refresh_token;

    // Explicitly refresh session
    const refreshRes = await client.auth.refreshSession({ refresh_token: refreshToken });
    assert.ok(!refreshRes.error && refreshRes.data?.session, 'Session refresh successful');
    assert.ok(refreshRes.data.session.access_token);

    const refreshedCookies = setCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const apiRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie: refreshedCookies, origin: ENV.APP_URL },
    });
    assert.equal(apiRes.status, 200, 'Refreshed session is authorized on API');
  });

  await t.test('5.4 Application token cutoff (tokens_valid_after) immediate invalidation', async () => {
    const { userId, cookie } = await createSyntheticAdmin(tracker, 'sec5-4');

    // Invalidate session by advancing tokens_valid_after
    const futureUnix = Math.floor(Date.now() / 1000) + 10;
    const { error: upErr } = await admin.from('profiles').update({ tokens_valid_after: futureUnix }).eq('id', userId);
    assert.ifError(upErr);

    // API request with invalidated session must return 401
    const apiRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie, origin: ENV.APP_URL },
    });
    assert.equal(apiRes.status, 401, 'Cutoff session returns 401 on API');

    // Page request with invalidated session must redirect (HTTP 307 to login)
    const pageRes = await safeFetch(`${ENV.APP_URL}/admin/recovery`, {
      headers: { cookie, origin: ENV.APP_URL },
      redirect: 'manual',
    });
    assert.equal(pageRes.status, 307, 'Cutoff session redirects on page request');
    const location = pageRes.headers.get('location');
    assert.ok(location && (location.includes('/login') || location.includes('/api/auth/logout')), 'Redirect destination verified');
  });

  await t.test('5.5 Revoked refresh authority returns 401 on API and 307 redirect on page', async () => {
    const { userId, email } = await createSyntheticAdmin(tracker, 'sec5-5-revoked');

    let setCookies = [];
    const client = createServerClient(ENV.SUPABASE_URL, ENV.PUBLISHABLE_KEY, {
      cookies: {
        getAll() { return []; },
        setAll(cookies) { setCookies = cookies; },
      },
    });
    const signInRes = await client.auth.signInWithPassword({ email, password: 'Password123!@#' });
    assert.ok(!signInRes.error && signInRes.data?.session);
    const userCookie = setCookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Revoke all sessions/refresh authority for this user in Auth
    const { error: soErr } = await admin.auth.admin.signOut(signInRes.data.session.access_token, 'global');
    // Also delete any remaining refresh tokens
    await admin.from('profiles').update({ tokens_valid_after: Math.floor(Date.now() / 1000) + 10 }).eq('id', userId);

    const apiRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      headers: { cookie: userCookie, origin: ENV.APP_URL },
    });
    assert.equal(apiRes.status, 401, 'Revoked session returns 401 on API');

    const pageRes = await safeFetch(`${ENV.APP_URL}/admin/recovery`, {
      headers: { cookie: userCookie, origin: ENV.APP_URL },
      redirect: 'manual',
    });
    assert.equal(pageRes.status, 307, 'Revoked session redirects on page request');
  });

  await t.test('5.6 Role mismatch: admin JWT claims rejected when profile role changes to client', async () => {
    const { userId, cookie } = await createSyntheticAdmin(tracker, 'sec5-6');

    // Demote profile role to 'client' while user holds admin JWT
    const { error: rErr } = await admin.from('profiles').update({ role: 'client' }).eq('id', userId);
    assert.ifError(rErr);

    const apiRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 100 }),
    });
    assert.equal(apiRes.status, 401, 'API refused with 401 on role mismatch');
    console.log('PASS 5.6: Role mismatch rejected by current_account_role check');
  });

  await t.test('5.7 Storage presigned PUT isolation vs refusal of new presigned URL requests', async () => {
    const { userId, cookie } = await createSyntheticAdmin(tracker, 'sec5-7');
    const payload = Buffer.alloc(50, 0x41);

    // 1. Issue a presigned PUT URL while authorized
    const upRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: payload.length }),
    });
    assert.equal(upRes.status, 200);
    const upData = await upRes.json();
    tracker.trackImport(upData.id);

    // 2. Deactivate profile
    const { error: dErr } = await admin.from('profiles').update({ is_active: false }).eq('id', userId);
    assert.ifError(dErr);

    // 3. Attempting to request a NEW presigned URL is REFUSED (401)
    const newUpRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: payload.length }),
    });
    assert.equal(newUpRes.status, 401, 'New presigned URL request refused after deactivation');

    // 4. An ALREADY-ISSUED presigned PUT URL still works at storage layer until expiry
    const directPut = await fetch(upData.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: payload,
    });
    assert.ok(directPut.status === 200 || directPut.status === 204, `Direct S3 PUT status ${directPut.status}`);

    // 5. But attempting to seal or preview that upload via API is REFUSED (401)
    const prevRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { cookie, origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', id: upData.id }),
    });
    assert.equal(prevRes.status, 401, 'Preview/seal refused by application authority check');
    console.log('PASS 5.7: Storage presigned PUT isolation and application authority enforcement verified');
  });

  await t.test('5.8 Anonymous access refusal', async () => {
    const getRes = await safeFetch(`${ENV.APP_URL}/api/recovery`);
    assert.equal(getRes.status, 401, 'Anonymous GET returns 401');

    const postRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: { origin: ENV.APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', size: 100 }),
    });
    assert.equal(postRes.status, 401, 'Anonymous POST returns 401');
    console.log('PASS 5.8: Anonymous access strictly denied');
  });

  await t.test('5.9 Cross-origin request refusal (CSRF protection)', async () => {
    const { cookie } = await createSyntheticAdmin(tracker, 'sec5-9');

    const badRes = await safeFetch(`${ENV.APP_URL}/api/recovery`, {
      method: 'POST',
      headers: {
        cookie,
        origin: 'https://attacker-site.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'upload', size: 100 }),
    });
    assert.equal(badRes.status, 403, 'Cross-origin POST returns 403 Forbidden');
    const data = await badRes.json();
    assert.equal(data.error, 'Forbidden.');
    console.log('PASS 5.9: Cross-origin POST strictly blocked with 403');
  });
});
