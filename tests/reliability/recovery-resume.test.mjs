import assert from 'node:assert/strict';
import test,{beforeEach,after} from 'node:test';
import {registerHooks} from 'node:module';
import fs from 'node:fs';

const actor='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const source='33333333-3333-4333-8333-333333333333';
const project='44444444-4444-4444-8444-444444444444';
const f={};globalThis.__resumeTest=f;
beforeEach(()=>Object.assign(f,{
 session:{userId:actor,role:'admin'},error:null,filters:[],tables:[],auth:[],writes:0,
 row:{id,actor,upload_key:'SECRET_UPLOAD',sealed_key:'SECRET_SEALED',sha256:'a'.repeat(64),kind:'individual',
  snapshot:{id:source,r2_key:'SECRET_KEY',filename:'Recovered.pdf',mime:'application/pdf',size_bytes:10,project_id:project,ticket_id:null},
  result:null,created_at:new Date().toISOString(),object_plan:null,completed_files:[source]}
}));
const modules={
 'next/server':'export class NextRequest {} export const NextResponse={json:(b,i)=>Response.json(b,i)};',
 '@/lib/crm/workflow-access':'export async function workflowSession(role,options){const f=globalThis.__resumeTest;f.auth.push({role,options});return f.session;}',
 '@/lib/supabase/admin':`export function getSupabaseAdmin(){const f=globalThis.__resumeTest;return {
  from(table){f.tables.push(table);const eqs=[];const q={select(){return q;},eq(k,v){eqs.push([k,v]);f.filters.push([k,v]);return q;},order(){return q;},
   async range(){return {data:[],error:null};},async maybeSingle(){return {data:f.row&&eqs.every(([k,v])=>f.row[k]===v)?f.row:null,error:f.error};}};return q;},
  async rpc(){f.writes++;throw Error('No mutations allowed during inspection');}};}`,
 '@/lib/r2':'export async function presignPrivateGet(){throw Error("No signing during inspection");}export async function presignPrivatePut(){throw Error("No signing during inspection");}',
 '@/lib/crm/recovery-storage':'export async function readRecoveryBytes(){throw Error("No storage during inspection");}export async function writeRecoveryBytes(){throw Error("No storage during inspection");}export async function writeRestoredObject(){throw Error("No storage during inspection");}',
 '@/lib/crm/recovery-archive':'export const RECOVERY_MAX_BYTES=104857600;export function decodeRecoveryArchive(){throw Error("No decoding during inspection");}'
};
const hooks=registerHooks({resolve(s,c,n){if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};return n(s,c);}});
after(()=>{hooks.deregister();delete globalThis.__resumeTest;});
const {GET}=await import('../../app/api/recovery/route.ts');
const req=(query=`importId=${id}`)=>({nextUrl:new URL('http://app.test/api/recovery?'+query)});
test('reload reads the same owned import and durable checkpoint without mutation',async()=>{
 const r=await GET(req());assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.id,id);assert.equal(data.state,'ready');assert.equal(data.completed,1);assert.equal(data.files,1);
 assert.equal(data.name,'Recovered.pdf');assert.equal(r.headers.get('cache-control'),'no-store');
 assert.deepEqual(f.tables,['recovery_imports']);assert.deepEqual(f.filters,[['id',id],['actor',actor]]);
 assert.deepEqual(f.auth,[{role:'admin',options:{requireUnbannedAuthUser:true}}]);assert.equal(f.writes,0);
 assert.doesNotMatch(JSON.stringify(data),/SECRET|sha256|snapshot|object_plan|upload_key|sealed_key/);
});
test('a new request observes the current checkpoint rather than client memory',async()=>{
 f.row.completed_files=[];assert.equal((await (await GET(req())).json()).completed,0);
 f.row.completed_files=[source];assert.equal((await (await GET(req())).json()).completed,1);
});
test('project imports report checkpoint counts and display name',async()=>{
 const file=f.row.snapshot;f.row.kind='project';f.row.snapshot={project:{name:'Original project'},files:[file,{...file,id:project}]};
 const data=await (await GET(req())).json();assert.equal(data.files,2);assert.equal(data.completed,1);assert.equal(data.name,'Original project');
});
test('empty projects can still resume finalization',async()=>{
 f.row.kind='project';f.row.snapshot={project:{name:'Empty project'},files:[]};f.row.completed_files=[];
 const data=await (await GET(req())).json();assert.equal(data.state,'ready');assert.equal(data.files,0);
});
test('completed result survives expiry and does not trigger another restore',async()=>{
 f.row.created_at='2000-01-01T00:00:00Z';f.row.result={projectId:project,fileIds:[source],private_key:'SECRET_RESULT'};
 const r=await GET(req());assert.equal(r.status,200);const data=await r.json();assert.equal(data.state,'completed');
 assert.deepEqual(data.result,{projectId:project,fileIds:[source]});assert.equal(f.writes,0);assert.doesNotMatch(JSON.stringify(data),/SECRET/);
});
test('individual completed result permits a null project',async()=>{
 f.row.result={projectId:null,fileIds:[source]};const data=await (await GET(req())).json();assert.equal(data.state,'completed');assert.equal(data.result.projectId,null);
});
test('unfinished expired import returns non-resumable status without metadata',async()=>{
 f.row.created_at='2000-01-01T00:00:00Z';const data=await (await GET(req())).json();assert.equal(data.state,'expired');assert.equal(data.name,undefined);assert.equal(data.result,undefined);
});
test('unsealed upload has an explicit state instead of a false preview',async()=>{
 f.row.sha256=null;f.row.kind=null;f.row.snapshot=null;const data=await (await GET(req())).json();assert.equal(data.state,'uploading');assert.equal(data.files,undefined);
});
for(const mode of ['foreign','missing','db-error'])test(`${mode} import yields the same safe refusal`,async()=>{
 if(mode==='foreign')f.row.actor=project;if(mode==='missing')f.row=null;if(mode==='db-error')f.error={message:'SECRET_DB'};
 const r=await GET(req());assert.equal(r.status,400);const data=await r.json();assert.ok(data.error);assert.doesNotMatch(JSON.stringify(data),/SECRET|actor|snapshot/);
});
test('denied current authority performs no import lookup',async()=>{f.session=null;const r=await GET(req());assert.equal(r.status,401);assert.equal(f.tables.length,0);});
for(const query of ['importId=bad','importId=','importId='+id+'&importId='+id,'importId='+id+'&id='+source,'importId='+id+'&kind=project','importId='+id+'&page=1'])test(`ambiguous or malformed query ${query} fails before lookup`,async()=>{
 assert.equal((await GET(req(query))).status,400);assert.equal(f.tables.length,0);
});
for(const mode of ['date','kind','checkpoint','duplicate','result'])test(`corrupt ${mode} state fails closed`,async()=>{
 if(mode==='date')f.row.created_at='invalid';if(mode==='kind')f.row.kind='other';
 if(mode==='checkpoint')f.row.completed_files=[project];if(mode==='duplicate')f.row.completed_files=[source,source];
 if(mode==='result')f.row.result={projectId:'https://evil.invalid',fileIds:[]};
 assert.equal((await GET(req())).status,400);
});
test('UI source contract persists only the import ID and exposes explicit resume controls',()=>{
 const ui=fs.readFileSync(new URL('../../app/(admin)/admin/recovery/page.tsx',import.meta.url),'utf8');
 assert.match(ui,/sessionStorage\.setItem\(IMPORT_KEY,id\)/);
 assert.match(ui,/sessionStorage\.getItem\(IMPORT_KEY\)/);
 assert.match(ui,/importId=/);assert.match(ui,/Load saved import/);assert.match(ui,/Check uploaded ZIP/);assert.match(ui,/Resume restore/);
 assert.match(ui,/if\(!preview\|\|!confirm\)return/);
 assert.doesNotMatch(ui,/localStorage/);
});
