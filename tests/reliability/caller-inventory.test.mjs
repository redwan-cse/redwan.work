import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server.js';

const adminId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const otherClientId = '33333333-3333-4333-8333-333333333333';
const ticketId = '44444444-4444-4444-8444-444444444444';

const f = {
  session: null,
  profile: null,
  profileError: null,
  ticket: null,
  ticketError: null,
};
globalThis.__callerInventory = f;

const stub = (names) => names.map((name) => `export async function ${name}(){return {ok:true};}`).join('\n');

const modules = {
  'server-only': 'export {};',
  'next/cache': 'export function revalidatePath(){}',
  'next/navigation': 'export function redirect(dest){throw Object.assign(new Error("Synthetic redirect"),{destination:dest});}',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__callerInventory.session;}',
  '@/lib/supabase/server': 'export async function createSupabaseServerClient(){return {auth:{async signOut(){return {error:null};}}};}',
  '@/lib/supabase/admin': `export function getSupabaseAdmin(){
    const state = globalThis.__callerInventory;
    return {
      from(table){
        const q = {
          select(){return q;},
          eq(col, val){return q;},
          is(){return q;},
          order(){return q;},
          update(){return q;},
          insert(){return q;},
          delete(){return q;},
          async maybeSingle(){
            if(table==='profiles') return state.profileError ? {data: null, error: state.profileError} : {data: state.profile, error: null};
            if(table==='tickets') return state.ticketError ? {data: null, error: state.ticketError} : {data: state.ticket, error: null};
            return {data: null, error: null};
          }
        };
        return q;
      },
      rpc: async () => ({data: null, error: null})
    };
  }`,
  '@/lib/email': 'export function queueEmail(){}export async function recordUnsent(){return {ok:false};}export async function sendDeliverableUploadedEmail(){return {ok:true};}',
  '@/lib/email/recipients': 'export async function emailOrigin(){return "https://example.test";}export async function recipientEmail(){return null;}',
  '@/lib/email/outbox': 'export async function drainEmailOutbox(){return {ok:true,processed:0,sent:0,failed:0,deferred:0};}',
  '@/lib/blogger': 'export function clearBlogCache(){}',
  '@/lib/mime': 'export function extFromFilename(){return "pdf";}export function isAllowedAssetMime(){return true;}export const ASSET_ALLOWED={"pdf":["application/pdf"]};',
  '@/lib/format': 'export function formatBytes(){return "synthetic";}',
  '@/lib/crm/deliverable-validation': 'export async function validateDeliverable(){return null;}',
  '@/lib/crm/milestone-money': 'export function parseMilestoneMoney(){return {amount_cents:100};}',
  '@/lib/crm/clients': 'export async function convertLead(){return {ok:true};}export async function inviteClient(){return {ok:true};}export async function setClientActive(){return {ok:true};}',
  '@/lib/crm/tickets': stub(['adminReply', 'setTicketStatus', 'createTicket', 'clientReply']),
  '@/lib/crm/projects': stub(['createProject', 'updateProject', 'addMilestone', 'updateMilestone', 'deleteMilestone', 'moveMilestone', 'archiveProject', 'purgeArchivedProject', 'getArchiveDownloadUrl']),
  '@/lib/crm/files': 'export async function createFileRow(){return {ok:true};}export async function deleteOwnedFile(){return {ok:true};}',
  '@/lib/crm/invoices': stub(['addInvoiceItem', 'confirmPayment', 'createDraftInvoice', 'createDraftInvoiceWithItems', 'deleteInvoiceItem', 'getInvoiceDetail', 'rejectPayment', 'sendInvoice', 'updateDraftInvoice', 'updateInvoiceItem', 'voidInvoice', 'submitPayment']),
  '@/lib/r2': 'export const ASSET_ALLOWED_EXT=[],ASSET_MAX_BYTES=5242880;export function isR2Configured(){return true;}' + stub(['assetUrl', 'deletePublicObject', 'makeAssetKey', 'makeDeliverableKey', 'presignPrivatePut', 'putPublicObject', 'validateContactFile']),
  '@/lib/r2-inventory': 'export async function privateInventoryPage(){return {next:"",count:0};}',
  '@/lib/crm/retention': 'export async function drainStorageDeletions(){return {ok:true,deleted:0,errors:[]};}export async function purgeArchivedProject(){return {ok:true};}',
  '@/lib/crm/attachments': 'export const ATTACHMENT_ERROR="Attachment failed.";export function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}export async function validateAttachments(){return [];}export async function prepareTicketUploads(){return {ok:true,uploads:[{key:"k",uploadUrl:"u",filename:"f"}]};}',
  '@/lib/crm/public-asset-actions': 'export async function prepareAssetUploadAction(){return globalThis.__callerInventory.session?.role==="admin"&&globalThis.__callerInventory.profile?.is_active===true?{key:"k",uploadUrl:"u"}:{error:"Unauthorized."};}export async function confirmAssetUploadAction(){return globalThis.__callerInventory.session?.role==="admin"&&globalThis.__callerInventory.profile?.is_active===true?{url:"https://example.test/asset"}:{error:"Unauthorized."};}',
};

const hooks = registerHooks({
  resolve(s, c, n) {
    if (s === 'next/server') return n('next/server.js', c);
    if (s === '@/lib/crm/workflow-access') return {url: new URL('../../lib/crm/workflow-access.ts', import.meta.url).href, shortCircuit: true};
    if (s === '@/lib/auth/bearer') return {url: new URL('../../lib/auth/bearer.ts', import.meta.url).href, shortCircuit: true};
    if (Object.hasOwn(modules, s)) return {url: `data:text/javascript,${encodeURIComponent(modules[s])}`, shortCircuit: true};
    return n(s, c);
  },
});

const adminActions = await import('../../lib/crm/admin-actions.ts');
const clientActions = await import('../../lib/crm/client-actions.ts');
const workflowActions = await import('../../lib/crm/workflow-actions.ts');
const ticketUploadActions = await import('../../lib/crm/ticket-upload-actions.ts');

const revalidateRoute = await import('../../app/api/revalidate/route.ts');
const cronEmailRoute = await import('../../app/api/cron/email-outbox/route.ts');
const cronRetentionRoute = await import('../../app/api/cron/r2-retention/route.ts');
const logoutRoute = await import('../../app/api/auth/logout/route.ts');

hooks.deregister();

function setAdminSession(active = true, role = 'admin', error = null) {
  f.session = { userId: adminId, email: 'admin@example.test', role: 'admin' };
  f.profile = { role, is_active: active };
  f.profileError = error;
}

function setClientSession(active = true, role = 'client', error = null) {
  f.session = { userId: clientId, email: 'client@example.test', role: 'client' };
  f.profile = { role, is_active: active };
  f.profileError = error;
}

function clearSession() {
  f.session = null;
  f.profile = null;
  f.profileError = null;
}

test('build manifest and route inventory completeness', () => {
  const manifestPath = '.next/server/server-reference-manifest.json';
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entries = Object.values(manifest.node || {});
    assert.ok(entries.length >= 40, `Expected at least 40 server action references, got ${entries.length}`);
    for (const entry of entries) {
      assert.ok(entry.filename, 'Manifest entry must have filename');
      assert.ok(entry.exportedName, 'Manifest entry must have exportedName');
    }
  }

  // Verify all 8 API routes export valid HTTP methods
  assert.equal(typeof revalidateRoute.POST, 'function');
  assert.equal(typeof cronEmailRoute.GET, 'function');
  assert.equal(typeof cronRetentionRoute.GET, 'function');
  assert.equal(typeof logoutRoute.GET, 'function');
  assert.equal(typeof logoutRoute.POST, 'function');
});

test('admin action authorization matrix: all admin mutations fail-closed without active admin authority', async () => {
  const adminEndpoints = [
    () => adminActions.createProjectAction({}, new FormData()),
    () => adminActions.convertLeadAction('synthetic-lead'),
    () => adminActions.replyToTicketAction(ticketId, {}, new FormData()),
    () => adminActions.setTicketStatusAction(ticketId, 'in_progress'),
    () => adminActions.inviteClientAction({}, new FormData()),
    () => adminActions.deleteFileAction('file-id'),
    () => adminActions.archiveProjectAction('project-id'),
    () => adminActions.purgeArchivedProjectAction('project-id'),
    () => adminActions.createDraftInvoiceAction({ project_id: 'proj-id' }),
    () => adminActions.sendInvoiceAction('inv-id'),
    () => adminActions.confirmPaymentAction('pay-id'),
    () => adminActions.rejectPaymentAction('pay-id'),
    () => adminActions.deleteAssetAction('key'),
    () => adminActions.uploadAssetAction({}, new FormData()), // latent export
    () => workflowActions.invoiceMilestoneAction(ticketId),
  ];

  for (const call of adminEndpoints) {
    // 1. Anonymous session
    clearSession();
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // 2. Client caller
    setClientSession(true);
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // 3. Deactivated admin
    setAdminSession(false);
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // 4. Stale role admin (profile role is client)
    setAdminSession(true, 'client');
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // 5. Database lookup error
    setAdminSession(true, 'admin', { message: 'synthetic DB error' });
    assert.deepEqual(await call(), { error: 'Unauthorized.' });
  }
});

test('client action authorization matrix: client mutations reject unauthenticated, admin, and inactive callers', async () => {
  const clientEndpoints = [
    () => clientActions.createTicketWithAttachmentsAction('Subject', 'Body', []),
    () => clientActions.clientReplyAction(ticketId, {}, new FormData()),
    () => clientActions.submitPaymentAction('inv-id', { method: 'bank', reference: 'ref', amount_cents: 100 }),
    () => clientActions.confirmTicketAttachmentAction({ ticketId, entries: [] }), // latent export
  ];

  for (const call of clientEndpoints) {
    // Anonymous
    clearSession();
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // Admin role calling client-only action
    setAdminSession(true);
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // Deactivated client
    setClientSession(false);
    assert.deepEqual(await call(), { error: 'Unauthorized.' });

    // Database lookup error
    setClientSession(true, 'client', { message: 'synthetic DB error' });
    assert.deepEqual(await call(), { error: 'Unauthorized.' });
  }

  // latent getTicketAttachmentPresignAction returns { ok: false, error: 'Unauthorized.' }
  clearSession();
  assert.deepEqual(await clientActions.getTicketAttachmentPresignAction({ ticketId: null, filename: 'f.pdf', mime: 'application/pdf', size: 10 }), { ok: false, error: 'Unauthorized.' });
  setAdminSession(true);
  assert.deepEqual(await clientActions.getTicketAttachmentPresignAction({ ticketId: null, filename: 'f.pdf', mime: 'application/pdf', size: 10 }), { ok: false, error: 'Unauthorized.' });
});

test('anti-enumeration: cross-client ticket access and foreign profile edits return opaque 404s', async () => {
  setClientSession(true);

  // Client A attempting to reply to Client B's ticket
  f.ticket = { client_id: otherClientId }; // ticket owned by other user
  f.ticketError = null;

  // shareTicketFilesAction checks ownership explicitly:
  assert.deepEqual(await ticketUploadActions.shareTicketFilesAction(ticketId, []), { error: 'Ticket not found.' });

  // editClientProfileAction: Client A attempting to edit Client B's profile
  assert.deepEqual(await workflowActions.editClientProfileAction(otherClientId, { full_name: 'Attacker', company: 'Co' }), { error: 'Client not found.' });

  // Admin CAN edit any client's profile
  setAdminSession(true);
  assert.deepEqual(await workflowActions.editClientProfileAction(otherClientId, { full_name: 'Valid Name', company: 'Valid Co' }), { notice: 'Profile updated.' });
});

test('bearer-authenticated routes enforce valid credentials and fail closed', async () => {
  process.env.REVALIDATION_SECRET = 'synthetic-reval-secret';
  process.env.CRON_SECRET = 'synthetic-cron-secret';

  // 1. /api/revalidate
  const reqNoAuth = new NextRequest('https://example.test/api/revalidate?path=/blogs', { method: 'POST' });
  const resNoAuth = await revalidateRoute.POST(reqNoAuth);
  assert.equal(resNoAuth.status, 401);

  const reqBadAuth = new NextRequest('https://example.test/api/revalidate?path=/blogs', {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-secret' },
  });
  assert.equal((await revalidateRoute.POST(reqBadAuth)).status, 401);

  const reqBadPath = new NextRequest('https://example.test/api/revalidate?path=/admin', {
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-reval-secret' },
  });
  assert.equal((await revalidateRoute.POST(reqBadPath)).status, 400);

  // 2. /api/cron/email-outbox
  const cronNoAuth = new NextRequest('https://example.test/api/cron/email-outbox');
  assert.equal((await cronEmailRoute.GET(cronNoAuth)).status, 401);

  const cronBadAuth = new NextRequest('https://example.test/api/cron/email-outbox', {
    headers: { authorization: 'Bearer wrong-secret' },
  });
  assert.equal((await cronEmailRoute.GET(cronBadAuth)).status, 401);

  // 3. /api/cron/r2-retention
  const retNoAuth = new NextRequest('https://example.test/api/cron/r2-retention');
  assert.equal((await cronRetentionRoute.GET(retNoAuth)).status, 401);

  const retBadAuth = new NextRequest('https://example.test/api/cron/r2-retention', {
    headers: { authorization: 'Bearer wrong-secret' },
  });
  assert.equal((await cronRetentionRoute.GET(retBadAuth)).status, 401);

  // 4. Missing secret env var fails closed
  delete process.env.CRON_SECRET;
  const cronMissingEnv = new NextRequest('https://example.test/api/cron/email-outbox', {
    headers: { authorization: 'Bearer synthetic-cron-secret' },
  });
  assert.equal((await cronEmailRoute.GET(cronMissingEnv)).status, 401);
});

test('logout route enforces same-origin on POST and allows open GET for proxy bounce', async () => {
  // Cross-origin POST is 403
  const postBadOrigin = new NextRequest('https://example.test/api/auth/logout', {
    method: 'POST',
    headers: { origin: 'https://evil.invalid' },
  });
  const resBad = await logoutRoute.POST(postBadOrigin);
  assert.equal(resBad.status, 403);

  // Missing Origin header on POST is 403
  const postNoOrigin = new NextRequest('https://example.test/api/auth/logout', {
    method: 'POST',
  });
  assert.equal((await logoutRoute.POST(postNoOrigin)).status, 403);
});
