import assert from 'node:assert/strict';import test from 'node:test';import {registerHooks} from 'node:module';
const f={session:{userId:'synthetic',role:'admin'},profile:{role:'admin',is_active:true},origins:[],validated:null,writes:0,originFails:false};globalThis.__adminBoundary=f;
const stub=(names)=>names.map(name=>`export async function ${name}(){return {ok:true};}`).join('\n');
const modules={
 'next/cache':'export function revalidatePath(){}',
 '@/lib/auth/session':'export async function getCurrentSession(){return globalThis.__adminBoundary.session;}',
 '@/lib/supabase/admin':'export function getSupabaseAdmin(){return {from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:globalThis.__adminBoundary.profile,error:null};}};return q;}};}',
 '@/lib/crm/clients':'export async function convertLead(id,origin){globalThis.__adminBoundary.origins.push(origin);return {ok:true};}export async function inviteClient(input){globalThis.__adminBoundary.origins.push(input.redirectToBase);return {ok:true};}export async function setClientActive(){return {ok:true};}',
 '@/lib/crm/tickets':stub(['adminReply','setTicketStatus']),
 '@/lib/crm/projects':stub(['addMilestone','archiveProject','createProject','deleteMilestone','getArchiveDownloadUrl','moveMilestone','purgeArchivedProject','updateMilestone','updateProject']),
 '@/lib/crm/files':'export async function createFileRow(){globalThis.__adminBoundary.writes++;return {ok:true};}export async function deleteOwnedFile(){return {ok:true};}',
 '@/lib/r2':'export const ASSET_ALLOWED_EXT=[],ASSET_MAX_BYTES=5242880;'+stub(['assetUrl','deletePublicObject','makeAssetKey','makeDeliverableKey','presignPrivatePut','putPublicObject','validateContactFile']),
 '@/lib/mime':stub(['extFromFilename','isAllowedAssetMime']),
 '@/lib/format':'export function formatBytes(){return "synthetic";}',
 '@/lib/email':'export function queueEmail(){}'+stub(['recordUnsent','sendDeliverableUploadedEmail']),
 '@/lib/email/recipients':'export async function emailOrigin(){if(globalThis.__adminBoundary.originFails)throw new Error("private-config");return "https://example.test";}export async function recipientEmail(){return null;}',
 '@/lib/crm/invoices':stub(['addInvoiceItem','confirmPayment','createDraftInvoice','createDraftInvoiceWithItems','deleteInvoiceItem','getInvoiceDetail','rejectPayment','sendInvoice','updateDraftInvoice','updateInvoiceItem','voidInvoice']),
 '@/lib/crm/deliverable-validation':'export async function validateDeliverable(){return globalThis.__adminBoundary.validated;}'
};
const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true}:n(s,c);}});
const {convertLeadAction,inviteClientAction,confirmDeliverableAction}=await import('../../lib/crm/admin-actions.ts');hooks.deregister();
test('onboarding actions use explicit configured origin and truthful notices',async()=>{const form=new FormData();form.set('email','synthetic@example.test');const converted=await convertLeadAction('synthetic');const invited=await inviteClientAction({},form);assert.deepEqual(f.origins,['https://example.test','https://example.test']);assert.match(converted.notice,/existing accounts/);assert.match(invited.notice,/existing accounts/);});
test('missing origin refuses without onboarding side effects',async()=>{f.originFails=true;const before=f.origins.length;assert.deepEqual(await convertLeadAction('synthetic'),{error:'Account email configuration unavailable.'});assert.equal(f.origins.length,before);f.originFails=false;});
test('unauthorized and invalid confirmations perform no file writes',async()=>{f.profile={role:'client',is_active:true};assert.deepEqual(await confirmDeliverableAction('synthetic',{}),{error:'Unauthorized.'});f.profile={role:'admin',is_active:true};assert.ok((await confirmDeliverableAction('synthetic',{})).error);assert.equal(f.writes,0);f.validated={key:'synthetic',filename:'fixture.pdf',mime:'application/pdf',size_bytes:17};assert.deepEqual(await confirmDeliverableAction('synthetic',f.validated),{});assert.equal(f.writes,1);});
