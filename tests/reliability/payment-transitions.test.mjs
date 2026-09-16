import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

// Actual invoice service, validation, result and admin action; synthetic service
// boundaries only. No database, provider credentials, email, or network access.
const invoiceId = '11111111-1111-4111-8111-111111111111';
const paymentId = '55555555-5555-4555-8555-555555555555';
const projectId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const clientId = '66666666-6666-4666-8666-666666666666';

const conflictPending = 'Payment is no longer pending. Refresh and try again.';
const exceedTotal = 'Payment exceeds invoice total.';
const notAllowed = 'Payment transition is not allowed.';
const privateDiagnostic = 'synthetic-private-database-diagnostic';

const fixture = {};
globalThis.__paymentTransitions = fixture;

function reset() {
  Object.assign(fixture, {
    invoice: { id: invoiceId, project_id: projectId, client_id: clientId, status: 'sent', currency: 'USD', number: 1001, outstanding_cents: 5000 },
    payment: { id: paymentId, invoice_id: invoiceId, amount_cents: 5000, status: 'submitted' },
    session: { userId: adminId, role: 'admin' },
    profile: { role: 'admin', is_active: true },
    readError: null,
    rpcError: null,
    rpcs: [],
    queuedEmails: [],
    revalidated: [],
  });
}
reset();
beforeEach(reset);

const unexpected = 'throw new Error("Unexpected dependency in payment-transitions test");';
function stubs(names) {
  return names.split(' ').map(name => `export function ${name}(){${unexpected}}`).join('\n');
}
const modules = {
  'server-only': 'export {};',
  'next/cache': 'export function revalidatePath(path){globalThis.__paymentTransitions.revalidated.push(path);}',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__paymentTransitions.session;}',
  '@/lib/supabase/admin': `export function getSupabaseAdmin(){return {
    from(table){
      const f=globalThis.__paymentTransitions;
      const filters=[];
      const q={
        select(){return q;},
        eq(key,value){filters.push([key,value]);return q;},
        async maybeSingle(){
          if(table==='profiles') return {data:f.profile,error:null};
          if(table==='projects') return {data:{id:'${projectId}',client_id:'${adminId}',status:'active',archived_at:null},error:null};
          if(table==='invoices') return {data:f.invoice?{...f.invoice}:null,error:f.readError};
          if(table==='payments') return {data:f.payment?{...f.payment}:null,error:f.readError};
          throw new Error('Unexpected read table: '+table);
        },
      };return q;
    },
    rpc(name, params){
      const f=globalThis.__paymentTransitions;
      f.rpcs.push({name, params});
      return Promise.resolve({error: f.rpcError, data: null});
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: 'client@example.test' } } }) } }
  };}`,
  '@/lib/crm/invoice-contents': 'export async function readInvoiceContents(){return {items:[],payments:[]};}',
  '@/lib/crm/compatibility-readers': stubs('listInvoices countUnpaidInvoices countOwnOutstandingInvoices'),
  '@/lib/crm/milestone-money': stubs('parseMilestoneMoney'),
  '@/lib/crm/deliverable-validation': stubs('validateDeliverable'),
  '@/lib/crm/clients': stubs('convertLead inviteClient setClientActive'),
  '@/lib/crm/tickets': stubs('adminReply setTicketStatus'),
  '@/lib/crm/projects': stubs('addMilestone archiveProject createProject deleteMilestone getArchiveDownloadUrl moveMilestone purgeArchivedProject updateMilestone updateProject'),
  '@/lib/crm/files': stubs('createFileRow deleteOwnedFile'),
  '@/lib/r2': stubs('assetUrl deletePublicObject makeAssetKey makeDeliverableKey presignPrivatePut putPublicObject validateContactFile') + '\nexport const ASSET_ALLOWED_EXT=[]; export const ASSET_MAX_BYTES=1;',
  '@/lib/mime': stubs('extFromFilename isAllowedAssetMime'),
  '@/lib/format': stubs('formatBytes'),
  '@/lib/email': `export function queueEmail(fn){globalThis.__paymentTransitions.queuedEmails.push(fn); fn();}
export function recordUnsent(){return {ok:true};}
export function sendPaymentConfirmedEmail(){return {ok:true};}
export function sendInvoiceIssuedEmail(){return {ok:true};}
export function sendDeliverableUploadedEmail(){return {ok:true};}`,
  '@/lib/email/recipients': `export async function emailOrigin(){return 'https://redwan.work';}
export function formatMoney(cents, currency){return '$' + (cents/100).toFixed(2) + ' ' + currency;}
export async function recipientEmail(id){return 'client@example.test';}`,
};
const actual = new Set(['@/lib/crm/invoices', '@/lib/crm/invoice-inputs', '@/lib/crm/invoice-math', '@/lib/crm/result']);
const hooks = registerHooks({resolve(specifier, context, next){
  if(Object.hasOwn(modules,specifier)) return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
  if(actual.has(specifier)) return {url:new URL('../../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
let service, actions;
try {
  service = await import('../../lib/crm/invoices.ts');
  actions = await import('../../lib/crm/admin-actions.ts');
} finally {
  hooks.deregister();
}

// ── confirmPayment concurrency & error classification ──

test('confirm: successful transition invokes atomic RPC and succeeds', async () => {
  assert.deepEqual(await service.confirmPayment(paymentId, adminId), { ok: true });
  assert.deepEqual(fixture.rpcs, [{
    name: 'confirm_invoice_payment_atomic',
    params: { p_payment_id: paymentId, p_confirmed_by: adminId }
  }]);
});

test('confirm: payment is no longer pending returns conflict rather than generic failure', async () => {
  fixture.rpcError = { message: 'Payment is no longer pending' };
  assert.deepEqual(await service.confirmPayment(paymentId, adminId), { ok: false, error: conflictPending });
});

test('confirm: payment exceeds invoice total returns specific error', async () => {
  fixture.rpcError = { message: 'Payment exceeds invoice total' };
  assert.deepEqual(await service.confirmPayment(paymentId, adminId), { ok: false, error: exceedTotal });
});

test('confirm: payment transition not allowed returns specific error', async () => {
  fixture.rpcError = { message: 'Payment transition is not allowed' };
  assert.deepEqual(await service.confirmPayment(paymentId, adminId), { ok: false, error: notAllowed });
});

test('confirm: unexpected database failure stays generic without leaking diagnostics', async () => {
  fixture.rpcError = { message: privateDiagnostic };
  assert.deepEqual(await service.confirmPayment(paymentId, adminId), { ok: false, error: 'Invoice operation failed.' });
});

test('confirm: invalid payment UUID or admin UUID is rejected before RPC', async () => {
  for (const [p, a] of [['bad-uuid', adminId], [paymentId, 'bad-uuid'], ['', ''], [null, adminId]]) {
    assert.equal((await service.confirmPayment(p, a)).ok, false);
  }
  assert.equal(fixture.rpcs.length, 0);
});

// ── rejectPayment concurrency & error classification ──

test('reject: successful transition invokes atomic RPC and succeeds', async () => {
  assert.deepEqual(await service.rejectPayment(paymentId), { ok: true });
  assert.deepEqual(fixture.rpcs, [{
    name: 'reject_invoice_payment_atomic',
    params: { p_payment_id: paymentId }
  }]);
});

test('reject: payment is no longer pending returns conflict rather than generic failure', async () => {
  fixture.rpcError = { message: 'Payment is no longer pending' };
  assert.deepEqual(await service.rejectPayment(paymentId), { ok: false, error: conflictPending });
});

test('reject: payment transition not allowed returns specific error', async () => {
  fixture.rpcError = { message: 'Payment transition is not allowed' };
  assert.deepEqual(await service.rejectPayment(paymentId), { ok: false, error: notAllowed });
});

test('reject: unexpected database failure stays generic without leaking diagnostics', async () => {
  fixture.rpcError = { message: privateDiagnostic };
  assert.deepEqual(await service.rejectPayment(paymentId), { ok: false, error: 'Invoice operation failed.' });
});

test('reject: invalid payment UUID is rejected before RPC', async () => {
  for (const bad of ['bad-uuid', '', null, undefined]) {
    assert.equal((await service.rejectPayment(bad)).ok, false);
  }
  assert.equal(fixture.rpcs.length, 0);
});

// ── admin action propagation & authorization ──

test('admin action: confirmPaymentAction propagates conflict without success revalidation', async () => {
  fixture.rpcError = { message: 'Payment is no longer pending' };
  assert.deepEqual(await actions.confirmPaymentAction(paymentId), { error: conflictPending });
  assert.deepEqual(fixture.revalidated, []);
});

test('admin action: rejectPaymentAction propagates conflict without success revalidation', async () => {
  fixture.rpcError = { message: 'Payment is no longer pending' };
  assert.deepEqual(await actions.rejectPaymentAction(paymentId), { error: conflictPending });
  assert.deepEqual(fixture.revalidated, []);
});

test('admin action: confirmPaymentAction revalidates invoice on success', async () => {
  assert.deepEqual(await actions.confirmPaymentAction(paymentId), {});
  assert.deepEqual(fixture.revalidated, ['/admin', '/admin/invoices', `/admin/invoices/${invoiceId}`, `/admin/projects/${projectId}`]);
});

test('admin action: rejectPaymentAction revalidates invoice on success', async () => {
  assert.deepEqual(await actions.rejectPaymentAction(paymentId), {});
  assert.deepEqual(fixture.revalidated, ['/admin', '/admin/invoices', `/admin/invoices/${invoiceId}`, `/admin/projects/${projectId}`]);
});

for (const role of ['anonymous', 'client', 'inactive', 'changed-role']) {
  test(`admin action: payment decisions deny ${role} before mutation`, async () => {
    if (role === 'anonymous') fixture.session = null;
    if (role === 'client') fixture.session.role = 'client';
    if (role === 'inactive') fixture.profile.is_active = false;
    if (role === 'changed-role') fixture.profile.role = 'client';
    assert.deepEqual(await actions.confirmPaymentAction(paymentId), { error: 'Unauthorized.' });
    assert.deepEqual(await actions.rejectPaymentAction(paymentId), { error: 'Unauthorized.' });
    assert.equal(fixture.rpcs.length, 0);
    assert.deepEqual(fixture.revalidated, []);
  });
}
