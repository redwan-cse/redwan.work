// Investigation only: assertions prove current defects, not successful remediation.
// Actual application modules + real disposable PostgreSQL; synthetic storage and fluent client adapter.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
assert.equal(process.env.AUDIT_CAS_DISPOSABLE,'true');
const container=process.env.AUDIT_CAS_CONTAINER;assert.match(container,/^audit-cas-[0-9]+$/);
const sql=statement=>execFileSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','audit_cas'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function barrier(size){let arrived=0,release;const ready=new Promise(r=>release=r);return async()=>{arrived++;assert.ok(arrived<=size);if(arrived===size)release();await ready;};}
const state={mode:'single',barrier:async()=>{},updates:[],deleteCalls:0,objects:new Set(),physicalDeletes:0,reads:0};
const fixtures={
 from(table){let patch=null;const filters=[];let limit=100;
  const q={select(){return q;},update(value){patch=value;return q;},eq(key,value){filters.push(key+'='+literal(value));return q;},is(key,value){assert.equal(value,null);filters.push(key+' is null');return q;},lt(){return q;},gt(){return q;},order(){return q;},limit(value){limit=value;return q;},then(resolve,reject){return execute().then(resolve,reject);}};
  async function execute(){
   assert.ok(['storage_deletions','maintenance_cursors','projects'].includes(table));
   if(table==='projects')return {data:Array.from({length:10},(_,i)=>({id:'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0')})),error:null};
   if(patch){
    assert.ok(filters.length);assert.ok(Object.keys(patch).every(k=>['completed_at','last_key','updated_at'].includes(k)));
    const changes=Object.entries(patch).map(([k,v])=>k+'='+literal(v)).join(',');
    const affected=Number(sql(`with changed as (update public.${table} set ${changes} where ${filters.join(' and ')} returning 1) select count(*) from changed;`));
    state.updates.push({table,affected});
    // PostgREST default mutation response does not request rows/count. PostgreSQL accepts zero matches.
    return {data:null,count:null,error:null};
   }
   const rows=JSON.parse(sql(`select coalesce(json_agg(t),'[]'::json) from (select ${table==='storage_deletions'?'r2_key':'name,last_key'} from public.${table} ${filters.length?'where '+filters.join(' and '):''} ${table==='storage_deletions'?'order by created_at,r2_key limit '+limit:''}) t;`));
   state.reads++;
   if((table==='storage_deletions'&&state.mode==='drain-race')||(table==='maintenance_cursors'&&state.mode==='cursor-race'))await state.barrier();
   return {data:rows,error:null};
  }
  return q;
 },
 async rpc(name){assert.equal(name,'claim_expired_storage');return {data:false,error:null};}
};
globalThis.__auditCas={state,fixtures,async remove(keys){state.deleteCalls++;for(const key of keys)if(state.objects.delete(key))state.physicalDeletes++;}};
const modules={
 'server-only':'export {};',
 'archiver':'export {};',
 '@/lib/supabase/admin':'export function getSupabaseAdmin(){return globalThis.__auditCas.fixtures;}',
 '@/lib/r2':'export const ARCHIVE_MAX_BYTES=104857600;export function isR2Configured(){return true;}export async function deletePrivateObjects(keys){return globalThis.__auditCas.remove(keys);}export async function getPrivateObjectBytes(){throw Error("Unexpected archive read");}export async function putPrivateObject(){throw Error("Unexpected archive write");}',
 '@/lib/r2-inventory':'export async function privateInventoryPage(prefix){return {items:[],next:prefix+"001"};}',
 '@/lib/crm/retention':'export async function purgeArchivedProject(){return {ok:true};}export async function drainStorageDeletions(){return {completed:0,failed:0};}',
 'next/server':'export class NextRequest extends Request{};export class NextResponse{static json(body,init={}){return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json"}});}}'
};
registerHooks({resolve(s,c,n){if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};if(s.startsWith('@/lib/'))return {url:new URL('../'+s.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};return n(s,c);}});
const {drainStorageDeletions}=await import('../lib/crm/retention.ts');
const {GET}=await import('../app/api/cron/r2-retention/route.ts');
const result={setup:false,drainSingle:false,drainRace:false,cursorSingle:false,cursorRace:false,cursorAba:false,cleanup:false,observations:{}};
try{
 // Extract actual table definitions, not the unrelated destructive/trigger portions of the migration.
 const migration=readFileSync('supabase/migrations/0021_recoverable_storage_cleanup.sql','utf8');
 const tables=['project_recovery','storage_deletions'].map(name=>{const match=migration.match(new RegExp('create table public\\.'+name+' \\([\\s\\S]*?\\n\\);'));assert.ok(match);return match[0];}).join('\n');
 sql("create role anon;create role authenticated;create role service_role;"+tables+readFileSync('supabase/migrations/0024_maintenance_cursors.sql','utf8'));result.setup=true;
 function reset(mode){sql("truncate public.storage_deletions;update public.maintenance_cursors set last_key='';");Object.assign(state,{mode,barrier:async()=>{},updates:[],deleteCalls:0,objects:new Set(['fixture-key']),physicalDeletes:0,reads:0});}
 function seed(){sql("insert into public.storage_deletions(r2_key,source) values('fixture-key','contact');");}
 reset('single');seed();const single=await drainStorageDeletions();assert.deepEqual(single,{completed:1,failed:0});assert.equal(state.updates[0].affected,1);assert.equal(state.physicalDeletes,1);result.drainSingle=true;
 reset('drain-race');seed();state.barrier=barrier(2);
 const drains=await Promise.all([drainStorageDeletions(),drainStorageDeletions()]);
 const reported=drains.reduce((sum,r)=>sum+r.completed,0),changed=state.updates.reduce((sum,r)=>sum+r.affected,0);
 assert.equal(reported,2);assert.equal(changed,1);assert.equal(state.physicalDeletes,1);assert.deepEqual(state.updates.map(r=>r.affected).sort(),[0,1]);
 assert.equal(Number(sql('select count(*) from public.storage_deletions where completed_at is not null;')),1);
 result.drainRace=true;result.observations.drain={reported,changed,physicalDeletes:state.physicalDeletes,deleteAttempts:state.deleteCalls};
 process.env.CRON_SECRET='synthetic-cas';
 const request=()=>new Request('http://localhost/api/cron/r2-retention',{headers:{authorization:'Bearer synthetic-cas'}});
 reset('single');const one=await GET(request());assert.equal(one.status,200);assert.equal(state.updates.length,3);assert.ok(state.updates.every(r=>r.affected===1));result.cursorSingle=true;
 reset('cursor-race');state.barrier=barrier(2);const responses=await Promise.all([GET(request()),GET(request())]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(state.updates.length,6);assert.equal(state.updates.filter(r=>r.affected===0).length,3);
 assert.equal(Number(sql("select count(*) from public.maintenance_cursors where last_key<>'';")),3);
 result.cursorRace=true;result.observations.cursor={responses:responses.map(r=>r.status),writes:6,matched:3,zeroRows:3};
 // Real PostgreSQL ABA: value-only CAS cannot detect an intervening full cycle.
 reset('single');const old=sql("select last_key from public.maintenance_cursors where name='contact';");assert.equal(old,'');
 sql("update public.maintenance_cursors set last_key='contact/009' where name='contact';update public.maintenance_cursors set last_key='' where name='contact';");
 const aba=Number(sql("with changed as (update public.maintenance_cursors set last_key='contact/001' where name='contact' and last_key='' returning 1) select count(*) from changed;"));
 assert.equal(aba,1);result.cursorAba=true;result.observations.aba={staleValueMatched:aba};
}finally{
 try{sql('delete from public.storage_deletions;delete from public.project_recovery;delete from public.maintenance_cursors;');assert.equal(Number(sql('select (select count(*) from public.storage_deletions)+(select count(*) from public.project_recovery)+(select count(*) from public.maintenance_cursors);')),0);result.cleanup=true;}catch{result.cleanup=false;}
 writeFileSync(process.argv[2],JSON.stringify(result),{mode:0o600});
}
console.log('Investigation assertions complete; known-defect reproduction, not repaired application.');
process.exitCode=['setup','drainSingle','drainRace','cursorSingle','cursorRace','cursorAba','cleanup'].every(k=>result[k])?0:1;
