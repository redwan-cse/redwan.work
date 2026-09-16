import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

// Actual invoice service, validation, result and admin action; synthetic service
// boundaries only. No database, provider credentials, email, or network access.
const invoiceId = '11111111-1111-4111-8111-111111111111';
const itemId = '44444444-4444-4444-8444-444444444444';
const projectId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const conflictSave = 'Invoice item could not be saved. It may have changed or been removed. Refresh and try again.';
const conflictDelete = 'Invoice item could not be deleted. It may have changed or been removed. Refresh and try again.';
const privateDiagnostic = 'synthetic-private-database-diagnostic';
const fixture = {};
globalThis.__invoiceItemMutation = fixture;

function reset() {
  Object.assign(fixture, {
    invoice: { id: invoiceId, project_id: projectId, status: 'draft', currency: 'USD' },
    item: { id: itemId, invoice_id: invoiceId, description: 'Initial item', qty: 1, unit_price_cents: 1000, position: 0 },
    session: { userId: adminId, role: 'admin' },
    profile: { role: 'admin', is_active: true },
    readError: null, writeError: null, beforeWrite: null,
    countOverride: false, count: undefined, writes: [], reads: [], revalidated: [],
  });
}
reset();
beforeEach(reset);

const unexpected = 'throw new Error("Unexpected dependency in invoice-item-mutation test");';
function stubs(names) {
  return names.split(' ').map(name => `export function ${name}(){${unexpected}}`).join('\n');
}
const modules = {
  'server-only': 'export {};',
  'next/cache': 'export function revalidatePath(path){globalThis.__invoiceItemMutation.revalidated.push(path);}',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__invoiceItemMutation.session;}',
  '@/lib/supabase/admin': `export function getSupabaseAdmin(){return {from(table){
    const f=globalThis.__invoiceItemMutation;
    const filters=[]; let updates, options, isDelete=false;
    const q={
      select(){return q;},
      eq(key,value){filters.push([key,value]);return q;},
      update(value,opts){updates=value;options=opts;return q;},
      delete(opts){isDelete=true;options=opts;return q;},
      async maybeSingle(){
        f.reads.push(table);
        if(table==='profiles') return {data:f.profile,error:null};
        if(table==='projects') return {data:{id:'${projectId}',client_id:'${adminId}',status:'active',archived_at:null},error:null};
        if(table==='invoices') return {data:f.invoice?{...f.invoice}:null,error:f.readError};
        if(table==='invoice_items') return {data:f.item?{...f.item}:null,error:f.readError};
        throw new Error('Unexpected read table: '+table);
      },
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(table!=='invoice_items') throw new Error('Unexpected write table: '+table);
        if(f.beforeWrite){const transition=f.beforeWrite;f.beforeWrite=null;transition();}
        const matches=!!f.item&&filters.every(([key,value])=>f.item[key]===value);
        f.writes.push({table,filters:[...filters],updates:updates?{...updates}:null,isDelete,options});
        if(matches&&!f.writeError){
          if(isDelete) f.item=null;
          else if(updates) Object.assign(f.item,updates);
        }
        return {error:f.writeError,count:f.countOverride?f.count:(matches?1:0)};
      }).then(resolve,reject);}
    };return q;
  }};}`,
  '@/lib/crm/invoice-contents': stubs('readInvoiceContents'),
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
  '@/lib/email': stubs('queueEmail recordUnsent sendInvoiceIssuedEmail sendPaymentConfirmedEmail sendDeliverableUploadedEmail'),
  '@/lib/email/recipients': stubs('emailOrigin formatMoney recipientEmail'),
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

// ── updateInvoiceItem concurrency & count verification ──

test('update: item removed between read and write returns conflict', async () => {
  fixture.beforeWrite = () => { fixture.item = null; };
  assert.deepEqual(await service.updateInvoiceItem(itemId, { description: 'Updated' }), { ok: false, error: conflictSave });
  assert.equal(fixture.writes.length, 1);
});

test('update: one matching draft item saves normalized values with exact count and both predicates', async () => {
  assert.deepEqual(await service.updateInvoiceItem(itemId, { description: ' Updated description ', qty: 2, unit_price_cents: 2000 }), { ok: true });
  assert.deepEqual(fixture.writes, [{
    table: 'invoice_items',
    filters: [['id', itemId], ['invoice_id', invoiceId]],
    updates: { description: 'Updated description', qty: 2, unit_price_cents: 2000 },
    isDelete: false,
    options: { count: 'exact' },
  }]);
  assert.equal(fixture.item.description, 'Updated description');
  assert.equal(fixture.item.qty, 2);
  assert.equal(fixture.item.unit_price_cents, 2000);
});

for (const [name, count] of [['null', null], ['absent', undefined], ['zero', 0], ['multiple', 2], ['negative', -1], ['string', '1']]) {
  test(`update: unconfirmed affected count ${name} never reports success`, async () => {
    fixture.countOverride = true; fixture.count = count;
    assert.deepEqual(await service.updateInvoiceItem(itemId, { description: 'Updated' }), { ok: false, error: conflictSave });
    assert.equal(fixture.writes.length, 1);
  });
}

test('update: database failure wins over single row and stays generic', async () => {
  fixture.writeError = { message: privateDiagnostic }; fixture.countOverride = true; fixture.count = 1;
  assert.deepEqual(await service.updateInvoiceItem(itemId, { description: 'Updated' }), { ok: false, error: 'Invoice operation failed.' });
  assert.equal(fixture.item.description, 'Initial item');
});

test('update: missing item before update refuses without a write', async () => {
  fixture.item = null;
  assert.deepEqual(await service.updateInvoiceItem(itemId, { description: 'Updated' }), { ok: false, error: 'Item not found.' });
  assert.equal(fixture.writes.length, 0);
});

test('update: non-draft invoice refuses without a write', async () => {
  fixture.invoice.status = 'sent';
  assert.deepEqual(await service.updateInvoiceItem(itemId, { description: 'Updated' }), { ok: false, error: 'Only draft invoices can be edited.' });
  assert.equal(fixture.writes.length, 0);
});

test('update: invalid patch preserves rejection before mutation', async () => {
  for (const patch of [null, {}, { description: '' }, { qty: -1 }, { unit_price_cents: -5 }]) {
    assert.equal((await service.updateInvoiceItem(itemId, patch)).ok, false);
  }
  assert.equal(fixture.writes.length, 0);
});

// ── deleteInvoiceItem concurrency & count verification ──

test('delete: item removed between read and write returns conflict', async () => {
  fixture.beforeWrite = () => { fixture.item = null; };
  assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: false, error: conflictDelete });
  assert.equal(fixture.writes.length, 1);
});

test('delete: one matching draft item deletes with exact count and both predicates', async () => {
  assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: true });
  assert.deepEqual(fixture.writes, [{
    table: 'invoice_items',
    filters: [['id', itemId], ['invoice_id', invoiceId]],
    updates: null,
    isDelete: true,
    options: { count: 'exact' },
  }]);
  assert.equal(fixture.item, null);
});

for (const [name, count] of [['null', null], ['absent', undefined], ['zero', 0], ['multiple', 2], ['negative', -1], ['string', '1']]) {
  test(`delete: unconfirmed affected count ${name} never reports success`, async () => {
    fixture.countOverride = true; fixture.count = count;
    assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: false, error: conflictDelete });
    assert.equal(fixture.writes.length, 1);
  });
}

test('delete: database failure wins over single row and stays generic', async () => {
  fixture.writeError = { message: privateDiagnostic }; fixture.countOverride = true; fixture.count = 1;
  assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: false, error: 'Invoice operation failed.' });
  assert.notEqual(fixture.item, null);
});

test('delete: missing item before delete refuses without a write', async () => {
  fixture.item = null;
  assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: false, error: 'Item not found.' });
  assert.equal(fixture.writes.length, 0);
});

test('delete: non-draft invoice refuses without a write', async () => {
  fixture.invoice.status = 'sent';
  assert.deepEqual(await service.deleteInvoiceItem(itemId), { ok: false, error: 'Only draft invoices can be edited.' });
  assert.equal(fixture.writes.length, 0);
});

// ── admin actions propagation & authorization ──

test('admin action: update propagates conflict without success revalidation', async () => {
  fixture.beforeWrite = () => { fixture.item = null; };
  assert.deepEqual(await actions.updateInvoiceItemAction(itemId, { description: 'Updated' }), { error: conflictSave });
  assert.deepEqual(fixture.revalidated, []);
});

test('admin action: delete propagates conflict without success revalidation', async () => {
  fixture.beforeWrite = () => { fixture.item = null; };
  assert.deepEqual(await actions.deleteInvoiceItemAction(itemId), { error: conflictDelete });
  assert.deepEqual(fixture.revalidated, []);
});

for (const role of ['anonymous', 'client', 'inactive', 'changed-role']) {
  test(`admin actions deny ${role} before item mutation`, async () => {
    if (role === 'anonymous') fixture.session = null;
    if (role === 'client') fixture.session.role = 'client';
    if (role === 'inactive') fixture.profile.is_active = false;
    if (role === 'changed-role') fixture.profile.role = 'client';
    assert.deepEqual(await actions.updateInvoiceItemAction(itemId, { description: 'Updated' }), { error: 'Unauthorized.' });
    assert.deepEqual(await actions.deleteInvoiceItemAction(itemId), { error: 'Unauthorized.' });
    assert.equal(fixture.writes.length, 0);
    assert.deepEqual(fixture.revalidated, []);
  });
}
