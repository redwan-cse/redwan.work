import assert from 'node:assert/strict';
import test, {beforeEach, after} from 'node:test';
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const id='11111111-1111-4111-8111-111111111111';
const f={};
globalThis.__recoveryReadAuthority=f;
beforeEach(()=>Object.assign(f,{
  session:{userId:id,email:'synthetic@example.test',role:'admin'},
  profile:{role:'admin',is_active:true}, profileError:null,
  user:{id,banned_until:null},authError:null,throws:false,
  authCalls:[],profileCalls:0,reads:0,signs:0,storage:0,
  archiveHash:createHash('sha256').update('synthetic archive').digest('hex')
}));
const modules={
 'server-only':'export {};',
 '@/lib/auth/session':'export async function getCurrentSession(){return globalThis.__recoveryReadAuthority.session;}',
 '@/lib/supabase/admin':`export function getSupabaseAdmin(){
   const f=globalThis.__recoveryReadAuthority;
   return {auth:{admin:{async getUserById(id){f.authCalls.push(id);if(f.throws)throw Error('private provider error');return {data:{user:f.user},error:f.authError};}}},
   from(table){const q={select(){return q;},eq(){return q;},order(){return q;},
     async maybeSingle(){if(table==='profiles'){f.profileCalls++;return {data:f.profile,error:f.profileError};}
       f.reads++;return {data:{recovery_key:'synthetic.zip',sha256:f.archiveHash},error:null};},
     async range(){f.reads++;return {data:[],error:null};}};return q;}};}`,
 'next/server':'export class NextRequest {} export const NextResponse={json:(body,init)=>Response.json(body,init)};',
 'next/navigation':`export function redirect(path){throw new Error('REDIRECT:'+path);}`,
 '@/lib/r2':`export async function presignPrivateGet(){globalThis.__recoveryReadAuthority.signs++;return 'http://storage.test/download';}export async function presignPrivatePut(){throw Error('unexpected write');}`,
 '@/lib/crm/recovery-storage':`export async function readRecoveryBytes(){globalThis.__recoveryReadAuthority.storage++;return Buffer.from('synthetic archive');}export async function writeRecoveryBytes(){throw Error('unexpected write');}export async function writeRestoredObject(){throw Error('unexpected write');}`,
 '@/lib/crm/recovery-archive':'export const RECOVERY_MAX_BYTES=104857600;export function decodeRecoveryArchive(){throw Error("unexpected archive");}',
};
const hooks=registerHooks({
 resolve(s,c,n){
  if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};
  if(s==='@/lib/crm/workflow-access')return {url:new URL('../../lib/crm/workflow-access.ts',import.meta.url).href,shortCircuit:true};
  return n(s,c);
 },
 load(url,c,n){
  if(url.endsWith('/admin/recovery/layout.tsx'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(new URL(url),'utf8')),shortCircuit:true};
  return n(url,c);
 }
});
after(()=>{hooks.deregister();delete globalThis.__recoveryReadAuthority;});
const {workflowSession}=await import('../../lib/crm/workflow-access.ts');
const options={requireUnbannedAuthUser:true};
const request=(query='')=>({nextUrl:new URL('http://app.test/api/recovery'+query)});

for(const [name,ban] of [['future', '2999-01-01T00:00:00Z'],['malformed','not-a-date'],['empty',''],['non-string',123]]){
 test(`recovery authority denies ${name} ban state`,async()=>{
  f.user.banned_until=ban;
  assert.equal(await workflowSession('admin',options),null);
  assert.deepEqual(f.authCalls,[id]);
 });
}
for(const [name,ban] of [['no ban',null],['omitted ban',undefined],['expired ban','2000-01-01T00:00:00Z']]){
 test(`recovery authority allows active admin with ${name}`,async()=>{
  f.user.banned_until=ban;
  assert.deepEqual(await workflowSession('admin',options),f.session);
  assert.deepEqual(f.authCalls,[id]);
 });
}
for(const mode of ['error','throw','missing','mismatch'])test(`Auth ${mode} fails closed`,async()=>{
 if(mode==='error')f.authError={message:'private provider error'};
 if(mode==='throw')f.throws=true;
 if(mode==='missing')f.user=null;
 if(mode==='mismatch')f.user.id='22222222-2222-4222-8222-222222222222';
 assert.equal(await workflowSession('admin',options),null);
});
for(const mode of ['anonymous','client','inactive','role-change','profile-error'])test(`${mode} denied before privileged Auth lookup`,async()=>{
 if(mode==='anonymous')f.session=null;
 if(mode==='client')f.session.role='client';
 if(mode==='inactive')f.profile.is_active=false;
 if(mode==='role-change')f.profile.role='client';
 if(mode==='profile-error')f.profileError={message:'unavailable'};
 assert.equal(await workflowSession('admin',options),null);
 assert.equal(f.authCalls.length,0);
});
test('existing workflow callers retain their current contract',async()=>{
 f.user.banned_until='2999-01-01T00:00:00Z';
 assert.deepEqual(await workflowSession('admin'),f.session);
 assert.equal(f.authCalls.length,0);
});
test('ban changes are rechecked on the next request, not cached',async()=>{
 assert.deepEqual(await workflowSession('admin',options),f.session);
 f.user.banned_until='2999-01-01T00:00:00Z';
 assert.equal(await workflowSession('admin',options),null);
 f.user.banned_until=null;
 assert.deepEqual(await workflowSession('admin',options),f.session);
 assert.equal(f.authCalls.length,3);
});
for(const query of ['',`?kind=individual&id=${id}`,`?kind=project&id=${id}`])test(`banned GET ${query||'catalog'} denies before recovery reads or signing`,async()=>{
 const {GET}=await import('../../app/api/recovery/route.ts');
 f.user.banned_until='2999-01-01T00:00:00Z';
 const response=await GET(request(query));
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{error:'Unauthorized.'});
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(f.reads+f.storage+f.signs,0);
});
test('active admin catalog remains available',async()=>{
 const {GET}=await import('../../app/api/recovery/route.ts');
 const response=await GET(request());
 assert.equal(response.status,200);
 assert.equal(f.reads,2);
 assert.equal(f.authCalls.length,1);
});
for(const kind of ['individual','project'])test(`active admin ${kind} download still verifies bytes and signs`,async()=>{
 const {GET}=await import('../../app/api/recovery/route.ts');
 const response=await GET(request(`?kind=${kind}&id=${id}`));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{url:'http://storage.test/download'});
 assert.equal(f.authCalls.length,1);
 assert.equal(f.reads,1);
 assert.equal(f.storage,1);
 assert.equal(f.signs,1);
});
test('active admin cannot get a signed URL for corrupt archive bytes',async()=>{
 const {GET}=await import('../../app/api/recovery/route.ts');
 f.archiveHash='wrong';
 assert.equal((await GET(request(`?kind=individual&id=${id}`))).status,400);
 assert.equal(f.signs,0);
});
test('Auth outage returns safe 401 without reading the catalog',async()=>{
 const {GET}=await import('../../app/api/recovery/route.ts');
 f.throws=true;
 const response=await GET(request());
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{error:'Unauthorized.'});
 assert.equal(f.reads+f.storage+f.signs,0);
});
test('recovery layout denies banned users before rendering children',async()=>{
 const {default:layout}=await import('../../app/(admin)/admin/recovery/layout.tsx');
 f.user.banned_until='2999-01-01T00:00:00Z';
 await assert.rejects(layout({children:'private-ui'}),/REDIRECT:\/login/);
});
test('recovery layout renders children for an active admin',async()=>{
 const {default:layout}=await import('../../app/(admin)/admin/recovery/layout.tsx');
 assert.equal(await layout({children:'private-ui'}),'private-ui');
 assert.equal(f.authCalls.length,1);
});
for(const mode of ['anonymous','Auth outage'])test(`recovery layout denies ${mode}`,async()=>{
 const {default:layout}=await import('../../app/(admin)/admin/recovery/layout.tsx');
 if(mode==='anonymous')f.session=null;
 else f.throws=true;
 await assert.rejects(layout({children:'private-ui'}),/REDIRECT:\/login/);
});
