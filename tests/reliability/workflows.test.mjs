import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
const id='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
const f={session:null,profile:null,updates:[],rpcs:[]};globalThis.__workflowTest=f;
const modules={
 'server-only':'export {};',
 'next/cache':'export function revalidatePath() {}',
 '@/lib/auth/session':'export async function getCurrentSession(){return globalThis.__workflowTest.session;}',
 '@/lib/supabase/admin':`export function getSupabaseAdmin(){return {from(){const f=globalThis.__workflowTest;let updating=false;const q={select(){return q;},eq(){return q;},update(data){updating=true;f.updates.push(data);return q;},async maybeSingle(){return {data:updating?{id:'synthetic'}:f.profile,error:null};}};return q;},async rpc(name,args){globalThis.__workflowTest.rpcs.push({name,args});return {data:'synthetic-invoice',error:null};}};}`,
 '@/lib/crm/attachments':'export function validUuid(v){return typeof v==="string"&&/^[0-9a-f-]{36}$/.test(v);}',
};
const hooks=registerHooks({resolve(s,c,n){if(Object.hasOwn(modules,s))return {url:`data:text/javascript,${encodeURIComponent(modules[s])}`,shortCircuit:true};if(s==='@/lib/crm/workflow-access')return {url:new URL('../../lib/crm/workflow-access.ts',import.meta.url).href,shortCircuit:true};return n(s,c);}});
const {editClientProfileAction,invoiceMilestoneAction}=await import('../../lib/crm/workflow-actions.ts');hooks.deregister();
function setup(role='client',active=true){f.session={userId:id,email:'synthetic@example.test',role};f.profile={role,is_active:active};f.updates=[];f.rpcs=[];}
test('profile writes exclude auth and access fields',async()=>{setup();assert.equal((await editClientProfileAction(id,{full_name:' Name ',company:' Org ',role:'admin',is_active:true,email:'other@example.test'})).notice,'Profile updated.');assert.deepEqual(f.updates,[{full_name:'Name',company:'Org'}]);});
test('foreign clients and inactive accounts cannot edit profiles',async()=>{setup();assert.ok((await editClientProfileAction(other,{full_name:'Name',company:''})).error);assert.equal(f.updates.length,0);setup('client',false);assert.ok((await editClientProfileAction(id,{full_name:'Name',company:''})).error);assert.equal(f.updates.length,0);});
test('profile length and types fail before mutation',async()=>{setup();for(const input of [null,{full_name:1,company:''},{full_name:'x'.repeat(201),company:''}])assert.ok((await editClientProfileAction(id,input)).error);assert.equal(f.updates.length,0);});
test('milestone billing requires a current active admin',async()=>{setup();assert.ok((await invoiceMilestoneAction(other)).error);assert.equal(f.rpcs.length,0);setup('admin',false);assert.ok((await invoiceMilestoneAction(other)).error);assert.equal(f.rpcs.length,0);setup('admin');assert.equal((await invoiceMilestoneAction(other)).invoiceId,'synthetic-invoice');assert.deepEqual(f.rpcs,[{name:'invoice_milestone_atomic',args:{p_actor:id,p_milestone:other}}]);});
