import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

// Actual attachment services, validation, and actions; synthetic service boundaries only.
// No live S3/R2 credentials, external databases, or network calls.
const clientId = '11111111-1111-4111-8111-111111111111';
const otherClientId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const ticketId = '44444444-4444-4444-8444-444444444444';
const otherTicketId = '55555555-5555-4555-8555-555555555555';
const fileUuid1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fileUuid2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const fixture = {};
globalThis.__ticketAttachmentFixture = fixture;

function reset() {
  process.env.LEAD_IP_HASH_SALT = 'synthetic-salt';
  Object.assign(fixture, {
    session: { userId: clientId, role: 'client' },
    profile: { id: clientId, role: 'client', is_active: true },
    ticket: { id: ticketId, client_id: clientId },
    existingAttachmentCount: 0,
    r2Configured: true,
    rateLimitAllowed: true,
    rateLimitError: null,
    storedObjects: new Map(), // key -> size_bytes
    atomicAttachError: null,
    atomicAttachCalls: [],
    createTicketCalls: [],
    revalidated: [],
    redirected: null,
  });
}
reset();
beforeEach(reset);

const unexpected = 'throw new Error("Unexpected dependency call in ticket-attachments test");';
const r2Url = new URL('../../lib/r2.ts', import.meta.url).href;

const modules = {
  'server-only': 'export {};',
  'next/server': 'export class NextRequest extends Request {} export class NextResponse { static json(body,init={}) { return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...init?.headers}}); } }',
  'next/cache': 'export function revalidatePath(path){globalThis.__ticketAttachmentFixture.revalidated.push(path);}',
  'next/navigation': 'export function redirect(url){globalThis.__ticketAttachmentFixture.redirected=url;const err=new Error("NEXT_REDIRECT");err.digest="NEXT_REDIRECT";throw err;}',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__ticketAttachmentFixture.session;}',
  '@/lib/email': 'export function queueEmail(){}\n' + ['recordUnsent', 'sendNewTicketEmail', 'sendReplyPostedEmail', 'sendStatusChangedEmail', 'sendDeliverableUploadedEmail', 'sendInvoiceIssuedEmail', 'sendPaymentConfirmedEmail', 'sendToAll'].map(n => `export async function ${n}(){${unexpected}}`).join('\n'),
  '@/lib/email/recipients': 'export function formatMoney(a,c){return String(a);}\n' + ['adminRecipients', 'emailOrigin', 'recipientEmail', 'recipientName', 'ticketEmailContext'].map(n => `export async function ${n}(){${unexpected}}`).join('\n'),
  '@/lib/r2': `
    import { validateContactFile, makePendingAttachmentKey, makeTicketAttachmentKey } from '${r2Url}';
    export { validateContactFile, makePendingAttachmentKey, makeTicketAttachmentKey };
    export function isR2Configured() {
      return globalThis.__ticketAttachmentFixture.r2Configured !== false;
    }
    export async function presignPrivatePut(key, mime, size, ttl) {
      return 'https://synthetic-r2.test/' + key + '?signed=true';
    }
    export async function verifyStoredObjectSize(key, declared) {
      if (!Number.isSafeInteger(declared) || declared < 1 || declared > 10485760) return false;
      return globalThis.__ticketAttachmentFixture.storedObjects.get(key) === declared;
    }
  `,
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    return {
      from(table) {
        const f = globalThis.__ticketAttachmentFixture;
        const filters = [];
        let countMode = null;
        let isHead = false;
        const q = {
          select(_cols, opts) {
            if (opts?.count) countMode = opts.count;
            if (opts?.head) isHead = true;
            return q;
          },
          eq(key, value) {
            filters.push([key, value]);
            return q;
          },
          async maybeSingle() {
            if (table === 'profiles') {
              const id = filters.find(([k]) => k === 'id')?.[1];
              if (f.profile && f.profile.id === id) return { data: { ...f.profile }, error: null };
              return { data: null, error: null };
            }
            if (table === 'tickets') {
              const id = filters.find(([k]) => k === 'id')?.[1];
              if (f.ticket && f.ticket.id === id) return { data: { ...f.ticket }, error: null };
              return { data: null, error: null };
            }
            throw new Error('Unexpected table maybeSingle: ' + table);
          },
          then(resolve, reject) {
            if (table === 'files' && countMode === 'exact' && isHead) {
              return Promise.resolve({ count: f.existingAttachmentCount, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
        };
        return q;
      },
      async rpc(name, args) {
        const f = globalThis.__ticketAttachmentFixture;
        if (name === 'consume_rate_limit') {
          if (f.rateLimitError) return { data: null, error: f.rateLimitError };
          return { data: f.rateLimitAllowed, error: null };
        }
        if (name === 'attach_ticket_files_atomic') {
          f.atomicAttachCalls.push(args);
          if (f.atomicAttachError) return { data: null, error: f.atomicAttachError };
          return { data: null, error: null };
        }
        if (name === 'create_ticket_atomic') {
          f.createTicketCalls.push(args);
          return { data: '44444444-4444-4444-8444-444444444444', error: null };
        }
        throw new Error('Unexpected RPC: ' + name);
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

const { prepareTicketUploads, validateAttachments, ATTACHMENT_ERROR } = await import('../../lib/crm/attachments.ts');
const { shareTicketFilesAction } = await import('../../lib/crm/ticket-upload-actions.ts');
const { createTicketWithAttachmentsAction, confirmTicketAttachmentAction } = await import('../../lib/crm/client-actions.ts');
const { NextRequest } = await import('next/server');
const { POST: ticketPresignPost } = await import('../../app/api/uploads/ticket-presign/route.ts');

// -----------------------------------------------------------------------------
// 1. prepareTicketUploads: Presign Preparation & Boundary Controls
// -----------------------------------------------------------------------------

test('prepare: rejects invalid actor userId or malformed ticketId UUID', async () => {
  const badActor = { userId: 'not-a-uuid', role: 'client' };
  const res1 = await prepareTicketUploads(badActor, null, [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res1.ok, false);
  assert.equal(res1.status, 400);

  const res2 = await prepareTicketUploads({ userId: clientId, role: 'client' }, 'malformed-ticket-id', [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 400);
});

test('prepare: rejects if actor profile is missing, inactive, or role mismatches', async () => {
  fixture.profile = null;
  const res1 = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res1.ok, false);
  assert.equal(res1.status, 401);

  fixture.profile = { id: clientId, role: 'client', is_active: false };
  const res2 = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 401);

  fixture.profile = { id: clientId, role: 'client', is_active: true };
  const res3 = await prepareTicketUploads({ userId: clientId, role: 'admin' }, null, [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res3.ok, false);
  assert.equal(res3.status, 401);
});

test('prepare: admin cannot request uploads without a ticketId ("Choose a ticket first.")', async () => {
  fixture.profile = { id: adminId, role: 'admin', is_active: true };
  const res = await prepareTicketUploads({ userId: adminId, role: 'admin' }, null, [{ filename: 'test.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(res.error, 'Choose a ticket first.');
});

test('prepare: client can request pending uploads without a ticketId', async () => {
  const res = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'doc.pdf', mime: 'application/pdf', size: 1024 }]);
  assert.equal(res.ok, true);
  assert.equal(res.uploads.length, 1);
  assert.ok(res.uploads[0].key.startsWith(`private/${clientId}/pending/`));
  assert.ok(res.uploads[0].key.endsWith('.pdf'));
  assert.ok(res.uploads[0].uploadUrl.includes(res.uploads[0].key));
});

test('prepare: client requesting foreign ticketId returns 404', async () => {
  fixture.ticket = { id: ticketId, client_id: otherClientId };
  const res = await prepareTicketUploads({ userId: clientId, role: 'client' }, ticketId, [{ filename: 'doc.pdf', mime: 'application/pdf', size: 1024 }]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  assert.equal(res.error, 'Ticket not found.');
});

test('prepare: admin requesting any valid ticket succeeds with ticket-scoped keys', async () => {
  fixture.profile = { id: adminId, role: 'admin', is_active: true };
  fixture.ticket = { id: ticketId, client_id: clientId };
  const res = await prepareTicketUploads({ userId: adminId, role: 'admin' }, ticketId, [{ filename: 'receipt.png', mime: 'image/png', size: 2048 }]);
  assert.equal(res.ok, true);
  assert.equal(res.uploads.length, 1);
  assert.ok(res.uploads[0].key.startsWith(`private/${clientId}/ticket_${ticketId}/`));
  assert.ok(res.uploads[0].key.endsWith('.png'));
});

test('prepare: existing ticket with attachments exceeding 10 cap returns 400', async () => {
  fixture.existingAttachmentCount = 9;
  const res = await prepareTicketUploads({ userId: clientId, role: 'client' }, ticketId, [
    { filename: 'doc1.pdf', mime: 'application/pdf', size: 100 },
    { filename: 'doc2.pdf', mime: 'application/pdf', size: 100 },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(res.error, 'A ticket can have at most 10 attachments.');
});

test('prepare: files count out of bounds (0 or > 10) returns 400', async () => {
  const empty = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, []);
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 400);

  const eleven = Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.pdf`, mime: 'application/pdf', size: 100 }));
  const tooMany = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, eleven);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.status, 400);
});

test('prepare: invalid file metadata fails before storage or rate limit consumption', async () => {
  for (const badFile of [
    { filename: 'bad.exe', mime: 'application/x-msdownload', size: 100 },
    { filename: 'fake.pdf', mime: 'image/png', size: 100 },
    { filename: 'toolarge.pdf', mime: 'application/pdf', size: 10 * 1024 * 1024 + 1 },
    { filename: 'zero.pdf', mime: 'application/pdf', size: 0 },
    { filename: 'fractional.pdf', mime: 'application/pdf', size: 10.5 },
  ]) {
    const res = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [badFile]);
    assert.equal(res.ok, false);
    assert.equal(res.status, 400);
  }
});

test('prepare: rate limit exhaustion returns 429', async () => {
  fixture.rateLimitAllowed = false;
  const res = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.equal(res.error, 'Too many upload requests. Please try again later.');
});

test('prepare: rate limit error or missing salt returns 503 fail-closed', async () => {
  fixture.rateLimitError = { message: 'db error' };
  const res1 = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res1.ok, false);
  assert.equal(res1.status, 503);

  delete process.env.LEAD_IP_HASH_SALT;
  const res2 = await prepareTicketUploads({ userId: clientId, role: 'client' }, null, [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }]);
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 503);
});

// -----------------------------------------------------------------------------
// 2. validateAttachments: Scoped Key, Byte Verification & Atomicity
// -----------------------------------------------------------------------------

test('validate: invalid owner UUID or ticketId UUID returns null', async () => {
  assert.equal(await validateAttachments([], 'invalid-uuid', ticketId), null);
  assert.equal(await validateAttachments([], clientId, 'invalid-ticket-uuid'), null);
});

test('validate: entries not an array or exceeding 10 returns null', async () => {
  assert.equal(await validateAttachments(null, clientId, ticketId), null);
  assert.equal(await validateAttachments('string', clientId, ticketId), null);
  assert.equal(await validateAttachments(Array.from({ length: 11 }, () => ({})), clientId, ticketId), null);
});

test('validate: empty entries returns [] without error', async () => {
  const res = await validateAttachments([], clientId, ticketId);
  assert.deepEqual(res, []);
});

test('validate: pending key submitted against existing ticket returns null', async () => {
  const pendingKey = `private/${clientId}/pending/${fileUuid1}.pdf`;
  fixture.storedObjects.set(pendingKey, 500);
  const res = await validateAttachments([{ key: pendingKey, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }], clientId, ticketId);
  assert.equal(res, null);
});

test('validate: ticket key submitted against pending (ticketId=null) returns null', async () => {
  const ticketKey = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(ticketKey, 500);
  const res = await validateAttachments([{ key: ticketKey, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }], clientId, null);
  assert.equal(res, null);
});

test('validate: cross-ticket key or foreign ownerId returns null', async () => {
  const crossTicketKey = `private/${clientId}/ticket_${otherTicketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(crossTicketKey, 500);
  assert.equal(await validateAttachments([{ key: crossTicketKey, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }], clientId, ticketId), null);

  const foreignOwnerKey = `private/${otherClientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(foreignOwnerKey, 500);
  assert.equal(await validateAttachments([{ key: foreignOwnerKey, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }], clientId, ticketId), null);
});

test('validate: directory traversal attempt in key returns null', async () => {
  const traversalKey = `private/${clientId}/ticket_${ticketId}/../../etc/passwd.pdf`;
  assert.equal(await validateAttachments([{ key: traversalKey, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }], clientId, ticketId), null);
});

test('validate: duplicate keys in same batch returns null', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 500);
  const entry = { key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 };
  assert.equal(await validateAttachments([entry, entry], clientId, ticketId), null);
});

test('validate: missing object in R2 (HEAD size mismatch) returns null', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  // Object not placed into fixture.storedObjects
  const entry = { key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 };
  assert.equal(await validateAttachments([entry], clientId, ticketId), null);
});

test('validate: stored object byte count mismatch returns null', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 501); // 501 in storage vs 500 declared
  const entry = { key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 };
  assert.equal(await validateAttachments([entry], clientId, ticketId), null);
});

test('validate: single corrupt/missing file in batch fails all-or-nothing', async () => {
  const key1 = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  const key2 = `private/${clientId}/ticket_${ticketId}/${fileUuid2}.png`;
  fixture.storedObjects.set(key1, 500);
  fixture.storedObjects.set(key2, 999); // stored 999, entry declares 800
  const batch = [
    { key: key1, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 },
    { key: key2, filename: 'pic.png', mime: 'image/png', size_bytes: 800 },
  ];
  assert.equal(await validateAttachments(batch, clientId, ticketId), null);
});

test('validate: valid entries matching R2 stored bytes succeed and normalize mime', async () => {
  const key1 = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  const key2 = `private/${clientId}/ticket_${ticketId}/${fileUuid2}.png`;
  fixture.storedObjects.set(key1, 500);
  fixture.storedObjects.set(key2, 800);
  const batch = [
    { key: key1, filename: 'doc.pdf', mime: 'APPLICATION/PDF; charset=utf-8', size_bytes: 500 },
    { key: key2, filename: 'pic.png', mime: 'image/png', size_bytes: 800 },
  ];
  const res = await validateAttachments(batch, clientId, ticketId);
  assert.ok(Array.isArray(res));
  assert.equal(res.length, 2);
  assert.equal(res[0].mime, 'application/pdf');
  assert.equal(res[1].mime, 'image/png');
});

// -----------------------------------------------------------------------------
// 3. shareTicketFilesAction: Server Action Security & Atomic Attachment
// -----------------------------------------------------------------------------

test('share: anonymous caller returns Unauthorized without DB reads', async () => {
  fixture.session = null;
  const res = await shareTicketFilesAction(ticketId, []);
  assert.equal(res.error, 'Unauthorized.');
  assert.equal(fixture.atomicAttachCalls.length, 0);
});

test('share: inactive profile or role mismatch returns Unauthorized', async () => {
  fixture.profile = { id: clientId, role: 'client', is_active: false };
  const res = await shareTicketFilesAction(ticketId, []);
  assert.equal(res.error, 'Unauthorized.');
  assert.equal(fixture.atomicAttachCalls.length, 0);
});

test('share: invalid ticket UUID returns Ticket not found without DB reads', async () => {
  const res = await shareTicketFilesAction('malformed-uuid', []);
  assert.equal(res.error, 'Ticket not found.');
  assert.equal(fixture.atomicAttachCalls.length, 0);
});

test('share: foreign client returns Ticket not found without RPC', async () => {
  fixture.ticket = { id: ticketId, client_id: otherClientId };
  const res = await shareTicketFilesAction(ticketId, []);
  assert.equal(res.error, 'Ticket not found.');
  assert.equal(fixture.atomicAttachCalls.length, 0);
});

test('share: validation failure returns ATTACHMENT_ERROR without RPC', async () => {
  const res = await shareTicketFilesAction(ticketId, [{ key: 'bad-key', filename: 'f.pdf', mime: 'application/pdf', size_bytes: 10 }]);
  assert.equal(res.error, ATTACHMENT_ERROR);
  assert.equal(fixture.atomicAttachCalls.length, 0);
});

test('share: successful share calls attach_ticket_files_atomic and revalidates paths', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 500);
  const entries = [{ key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }];
  const res = await shareTicketFilesAction(ticketId, entries);
  assert.deepEqual(res, {});
  assert.equal(fixture.atomicAttachCalls.length, 1);
  assert.equal(fixture.atomicAttachCalls[0].p_actor, clientId);
  assert.equal(fixture.atomicAttachCalls[0].p_ticket, ticketId);
  assert.equal(fixture.atomicAttachCalls[0].p_entries.length, 1);
  assert.ok(fixture.revalidated.includes(`/admin/tickets/${ticketId}`));
  assert.ok(fixture.revalidated.includes(`/portal/tickets/${ticketId}`));
});

test('share: Attachment limit reached maps to user-friendly copy', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 500);
  fixture.atomicAttachError = { message: 'Attachment limit reached' };
  const entries = [{ key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }];
  const res = await shareTicketFilesAction(ticketId, entries);
  assert.equal(res.error, 'A ticket can have at most 10 attachments.');
});

test('share: unhandled RPC error stays generic ATTACHMENT_ERROR without leaking diagnostics', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 500);
  fixture.atomicAttachError = { message: 'synthetic_db_column_leak_error' };
  const entries = [{ key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }];
  const res = await shareTicketFilesAction(ticketId, entries);
  assert.equal(res.error, ATTACHMENT_ERROR);
  assert.ok(!JSON.stringify(res).includes('synthetic_db_column_leak_error'));
});

// -----------------------------------------------------------------------------
// 4. Client Actions: Ticket Creation with Attachments & Attachment Confirmation
// -----------------------------------------------------------------------------

test('createTicketWithAttachmentsAction: validates client session and pending files', async () => {
  const pendingKey = `private/${clientId}/pending/${fileUuid1}.pdf`;
  fixture.storedObjects.set(pendingKey, 1000);
  const entries = [{ key: pendingKey, filename: 'specs.pdf', mime: 'application/pdf', size_bytes: 1000 }];

  // Next.js redirect() throws a digest error
  await assert.rejects(
    createTicketWithAttachmentsAction('Subject', 'Body', entries),
    err => err.digest === 'NEXT_REDIRECT'
  );
  assert.equal(fixture.redirected, `/portal/tickets/${ticketId}`);
  assert.equal(fixture.createTicketCalls.length, 1);
  assert.equal(fixture.createTicketCalls[0].p_client, clientId);
  assert.equal(fixture.createTicketCalls[0].p_subject, 'Subject');
  assert.equal(fixture.createTicketCalls[0].p_body, 'Body');
  assert.equal(fixture.createTicketCalls[0].p_entries.length, 1);
});

test('confirmTicketAttachmentAction: verifies client ownership and calls attach_ticket_files_atomic', async () => {
  const key = `private/${clientId}/ticket_${ticketId}/${fileUuid1}.pdf`;
  fixture.storedObjects.set(key, 500);
  const entries = [{ key, filename: 'doc.pdf', mime: 'application/pdf', size_bytes: 500 }];

  const res = await confirmTicketAttachmentAction({ ticketId, entries });
  assert.deepEqual(res, { notice: 'Files shared with this ticket.' });
  assert.equal(fixture.atomicAttachCalls.length, 1);
  assert.ok(fixture.revalidated.includes(`/portal/tickets/${ticketId}`));
});

// -----------------------------------------------------------------------------
// 5. POST /api/uploads/ticket-presign: HTTP Route Boundary
// -----------------------------------------------------------------------------

test('route: cross-origin or missing same-origin headers returns 403', async () => {
  const req = new NextRequest('https://redwan.work/api/uploads/ticket-presign', {
    method: 'POST',
    headers: { origin: 'https://evil.test', host: 'redwan.work' },
    body: JSON.stringify({ ticketId: null, files: [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }] }),
  });
  const res = await ticketPresignPost(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'Request origin not allowed.');
});

test('route: anonymous request returns 401 Unauthorized', async () => {
  fixture.session = null;
  const req = new NextRequest('https://redwan.work/api/uploads/ticket-presign', {
    method: 'POST',
    headers: { origin: 'https://redwan.work', host: 'redwan.work', 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: null, files: [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }] }),
  });
  const res = await ticketPresignPost(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'Unauthorized.');
});

test('route: malformed JSON returns 400', async () => {
  const req = new NextRequest('https://redwan.work/api/uploads/ticket-presign', {
    method: 'POST',
    headers: { origin: 'https://redwan.work', host: 'redwan.work', 'content-type': 'application/json' },
    body: 'not-valid-json',
  });
  const res = await ticketPresignPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'Invalid request.');
});

test('route: valid same-origin presign returns 200 with uploads array', async () => {
  const req = new NextRequest('https://redwan.work/api/uploads/ticket-presign', {
    method: 'POST',
    headers: { origin: 'https://redwan.work', host: 'redwan.work', 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: null, files: [{ filename: 'doc.pdf', mime: 'application/pdf', size: 100 }] }),
  });
  const res = await ticketPresignPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.uploads));
  assert.equal(data.uploads.length, 1);
  assert.ok(data.uploads[0].key.startsWith(`private/${clientId}/pending/`));
});

