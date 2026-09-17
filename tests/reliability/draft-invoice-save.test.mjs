import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach } from 'node:test';

// Actual invoice service, validation, result and admin action; synthetic service
// boundaries only. No database, provider credentials, email, or network access.
const invoiceId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const conflict = 'Invoice could not be saved. It may have changed or been removed. Refresh and try again.';
const privateDiagnostic = 'synthetic-private-database-diagnostic';
const fixture = {};
globalThis.__draftInvoiceSave = fixture;

function reset() {
  Object.assign(fixture, {
    row: { id: invoiceId, project_id: projectId, status: 'draft', currency: 'USD', payment_note: null },
    session: { userId: adminId, role: 'admin' },
    profile: { role: 'admin', is_active: true },
    readError: null, writeError: null, beforeWrite: null,
    countOverride: false, count: undefined, writes: [], reads: [], revalidated: [],
  });
}
reset();
beforeEach(reset);

const unexpected = 'throw new Error("Unexpected dependency in draft-save test");';
function stubs(names) {
  return names.split(' ').map(name => `export function ${name}(){${unexpected}}`).join('\n');
}
const modules = {
  'server-only': 'export {};',
  'next/cache': 'export function revalidatePath(path){globalThis.__draftInvoiceSave.revalidated.push(path);}',
  '@/lib/auth/session': 'export async function getCurrentSession(){return globalThis.__draftInvoiceSave.session;}',
  '@/lib/supabase/admin': `export function getSupabaseAdmin(){return {from(table){
    const f=globalThis.__draftInvoiceSave;
    const filters=[]; let updates, options;
    const q={
      select(){return q;},
      eq(key,value){filters.push([key,value]);return q;},
      update(value,opts){updates=value;options=opts;return q;},
      async maybeSingle(){
        f.reads.push(table);
        if(table==='profiles') return {data:f.profile,error:null};
        if(table==='projects') return {data:{id:'${projectId}',client_id:'${adminId}',status:'active',archived_at:null},error:null};
        if(table==='invoices') return {data:f.row?{...f.row}:null,error:f.readError};
        throw new Error('Unexpected read table');
      },
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(table!=='invoices'||!updates) throw new Error('Unexpected write');
        if(f.beforeWrite){const transition=f.beforeWrite;f.beforeWrite=null;transition();}
        const matches=!!f.row&&filters.every(([key,value])=>f.row[key]===value);
        f.writes.push({filters:[...filters],updates:{...updates},options});
        if(matches&&!f.writeError) Object.assign(f.row,updates);
        return {error:f.writeError,count:f.countOverride?f.count:(matches?1:0)};
      }).then(resolve,reject);}
    };return q;
  }};}`,
  '@/lib/crm/invoice-contents': stubs('readInvoiceContents'),
  '@/lib/crm/invoice-math': stubs('calculateInvoiceTotalCents isSafeInvoiceLine roundInvoiceLineCents') + '\nexport const MAX_INVOICE_TOTAL_CENTS=9007199254740991;',
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
const actual = new Set(['@/lib/crm/invoices', '@/lib/crm/invoice-inputs', '@/lib/crm/result']);
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

for (const status of ['sent', 'paid', 'void']) {
  test(`draft status race to ${status} returns conflict rather than success`, async () => {
    fixture.beforeWrite = () => { fixture.row.status = status; };
    assert.deepEqual(await service.updateDraftInvoice(invoiceId, {payment_note:'Changed'}), {ok:false,error:conflict});
    assert.equal(fixture.row.payment_note, null);
    assert.equal(fixture.writes.length, 1);
  });
}
test('row removed between read and write returns conflict', async () => {
  fixture.beforeWrite = () => { fixture.row = null; };
  assert.deepEqual(await service.updateDraftInvoice(invoiceId, {currency:'EUR'}), {ok:false,error:conflict});
  assert.equal(fixture.writes.length, 1);
});
test('one matching draft saves normalized values with exact count and both predicates', async () => {
  assert.deepEqual(await service.updateDraftInvoice(invoiceId, {currency:' eur ',payment_note:' Updated ',due_at:''}), {ok:true});
  assert.deepEqual(fixture.writes, [{filters:[['id',invoiceId],['status','draft']],updates:{currency:'EUR',payment_note:'Updated',due_at:null},options:{count:'exact'}}]);
  assert.equal(fixture.row.currency,'EUR');
});
test('repeated identical save still succeeds when one draft matches', async () => {
  for(let attempt=0;attempt<2;attempt++) assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'USD'}),{ok:true});
  assert.equal(fixture.writes.length,2);
});
for (const [name,count] of [['null',null],['absent',undefined],['zero',0],['multiple',2],['negative',-1],['string','1']]) {
  test(`unconfirmed affected count ${name} never reports success`, async () => {
    fixture.countOverride=true; fixture.count=count;
    assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'EUR'}),{ok:false,error:conflict});
    assert.equal(fixture.writes.length,1);
  });
}
test('database failure wins over a claimed single row and stays generic', async () => {
  fixture.writeError={message:privateDiagnostic}; fixture.countOverride=true; fixture.count=1;
  assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'EUR'}),{ok:false,error:'Invoice operation failed.'});
  assert.equal(fixture.row.currency,'USD');
});
test('missing invoice before update refuses without a write', async () => {
  fixture.row=null;
  assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'EUR'}),{ok:false,error:'Invoice not found.'});
  assert.equal(fixture.writes.length,0);
});
test('read failure refuses without exposing provider diagnostics or writing', async () => {
  fixture.readError={message:privateDiagnostic};
  assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'EUR'}),{ok:false,error:'Invoice not found.'});
  assert.equal(fixture.writes.length,0);
});
test('already sent invoice remains noneditable', async () => {
  fixture.row.status='sent';
  assert.deepEqual(await service.updateDraftInvoice(invoiceId,{currency:'EUR'}),{ok:false,error:'Only draft invoices can be edited.'});
  assert.equal(fixture.writes.length,0);
});
test('invalid and empty patches preserve existing rejection before mutation', async () => {
  for(const patch of [null,{}, {currency:'bad-code'}, {due_at:'2026-02-30'}]) assert.equal((await service.updateDraftInvoice(invoiceId,patch)).ok,false);
  assert.equal(fixture.writes.length,0);
});
test('admin action propagates conflict without success revalidation', async () => {
  fixture.beforeWrite=()=>{fixture.row.status='sent';};
  assert.deepEqual(await actions.updateDraftInvoiceAction(invoiceId,{currency:'EUR'}),{error:conflict});
  assert.deepEqual(fixture.revalidated,[]);
});
test('admin action revalidates only a confirmed successful save', async () => {
  assert.deepEqual(await actions.updateDraftInvoiceAction(invoiceId,{currency:'EUR'}),{});
  assert.deepEqual(fixture.revalidated,['/admin','/admin/invoices',`/admin/invoices/${invoiceId}`,`/admin/projects/${projectId}`]);
});
for(const role of ['anonymous','client','inactive','changed-role']) {
  test(`admin action denies ${role} before invoice mutation`, async () => {
    if(role==='anonymous') fixture.session=null;
    if(role==='client') fixture.session.role='client';
    if(role==='inactive') fixture.profile.is_active=false;
    if(role==='changed-role') fixture.profile.role='client';
    assert.deepEqual(await actions.updateDraftInvoiceAction(invoiceId,{currency:'EUR'}),{error:'Unauthorized.'});
    assert.equal(fixture.writes.length,0);
    assert.equal(fixture.reads.includes('invoices'),false);
    assert.deepEqual(fixture.revalidated,[]);
  });
}
