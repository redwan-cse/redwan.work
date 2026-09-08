import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
const id='11111111-1111-4111-8111-111111111111';
const f={rpcCalls:[],deletes:[],updates:[],invoiceCount:0,existing:null,snapshot:null,rows:[],deleteFails:false};globalThis.__retentionTest=f;
const modules={
 'server-only':'export {};',
 'archiver':'export {};',
 '@/lib/crm/result':'export {};',
 '@/lib/r2':`export const ARCHIVE_MAX_BYTES=104857600;export async function getPrivateObjectBytes(){throw new Error('unexpected storage read');}export async function putPrivateObject(){throw new Error('unexpected storage write');}export async function deletePrivateObjects(keys){const f=globalThis.__retentionTest;f.deletes.push(keys);if(f.deleteFails)throw new Error('synthetic-private-error');return keys.length;}`,
 '@/lib/supabase/admin':`export function getSupabaseAdmin(){const f=globalThis.__retentionTest;return {async rpc(name,args){f.rpcCalls.push(name);return {data:f.snapshot,error:null};},from(table){const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},limit(){return q;},update(patch){f.updates.push(patch);return q;},async maybeSingle(){return {data:f.existing,error:null};},then(resolve){return Promise.resolve(table==='invoices'?{count:f.invoiceCount,error:null}:{data:f.rows,error:null}).then(resolve);}};return q;}};}`,
};
const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:`data:text/javascript,${encodeURIComponent(modules[s])}`,shortCircuit:true}:n(s,c);}});
const {purgeArchivedProject,drainStorageDeletions}=await import('../../lib/crm/retention.ts');hooks.deregister();
function setup(){f.rpcCalls=[];f.deletes=[];f.updates=[];f.invoiceCount=0;f.existing=null;f.rows=[];f.deleteFails=false;f.snapshot={project:{id,archived_at:new Date().toISOString()},milestones:[],files:[]};}
test('linked invoices refuse before archive construction or source deletion',async()=>{setup();f.invoiceCount=1;const result=await purgeArchivedProject(id);assert.equal(result.ok,false);assert.match(result.error,/retained invoices/);assert.deepEqual(f.deletes,[]);assert.deepEqual(f.rpcCalls,['project_cleanup_snapshot']);});
test('unavailable recovery construction never prepares database deletion',async()=>{setup();const result=await purgeArchivedProject(id);assert.equal(result.ok,false);assert.match(result.error,/verify recovery backup/);assert.deepEqual(f.deletes,[]);assert.deepEqual(f.rpcCalls,['project_cleanup_snapshot']);});
test('already prepared cleanup is idempotent',async()=>{setup();f.existing={project_id:id};assert.equal((await purgeArchivedProject(id)).ok,true);assert.deepEqual(f.rpcCalls,[]);assert.deepEqual(f.deletes,[]);});
test('storage failures preserve pending deletion tracking',async()=>{setup();f.rows=[{r2_key:'synthetic-key'}];f.deleteFails=true;assert.deepEqual(await drainStorageDeletions(),{completed:0,failed:1});assert.deepEqual(f.updates,[]);f.deleteFails=false;assert.deepEqual(await drainStorageDeletions(),{completed:1,failed:0});assert.equal(f.updates.length,1);assert.ok(f.updates[0].completed_at);});
