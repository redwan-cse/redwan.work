import assert from 'node:assert/strict';
import test, {after, afterEach, beforeEach} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const root=new URL('../../',import.meta.url);
const lock=JSON.parse(readFileSync(new URL('package-lock.json',root),'utf8'));
const versions=['supabase-js','auth-js','ssr'].map(name=>{
 const entry=lock.packages[`node_modules/@supabase/${name}`];
 const installed=JSON.parse(readFileSync(new URL(`node_modules/@supabase/${name}/package.json`,root),'utf8'));
 assert.match(entry?.version??'',/^\d+\.\d+\.\d+$/);assert.equal(installed.version,entry.version);return entry.version;
});
const f={};globalThis.__passwordChange=f;
const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','LEAD_IP_HASH_SALT'];
const saved=new Map(keys.map(key=>[key,process.env[key]]));
const modules={
 'server-only':'export {};',
 'next/headers':'export async function headers(){return new Headers({"x-forwarded-for":"192.0.2.10"});}',
 '@/lib/contact/lead-schema':'import {createHash} from "node:crypto";export async function sha256Hex(s){return createHash("sha256").update(s).digest("hex");}',
 '@/lib/crm/workflow-access':'export async function workflowSession(...args){const f=globalThis.__passwordChange;f.authorities.push(args);return f.authorities.length>1&&f.recheckDenied?null:f.actor;}',
 '@/lib/supabase/admin':'export function getSupabaseAdmin(){return {rpc:async(name,p)=>{const f=globalThis.__passwordChange;f.rates.push({name,p});if(f.rateThrows)throw Error("private-sentinel");return {data:f.allowed,error:null};}};}',
 '@/lib/supabase/server':'export async function createSupabaseServerClient(){return {auth:globalThis.__passwordChange.original};}',
 '@supabase/supabase-js':'export function createClient(url,key,options){const f=globalThis.__passwordChange;f.options=options;f.created++;return {auth:f.verifier};}',
};
let action;
async function invoke(data=form()){
 assert.ok(existsSync(new URL('lib/auth/password-change.ts',root)),'authenticated own-account password change is not implemented');
 if(!action){const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true}:n(s,c);}});try{action=(await import('../../lib/auth/password-change.ts')).changePasswordAction;}finally{hooks.deregister();}}
 return action({},data);
}
function form(overrides={}){const d=new FormData();for(const [k,v]of Object.entries({currentPassword:'original-password',password:'replacement-password',confirm:'replacement-password',...overrides}))d.set(k,v);return d;}
function response(claims){return {data:{claims},error:null};}
beforeEach(t=>{
 Object.assign(f,{actor:{userId:'actor',email:'old@example.test',role:'client'},authorities:[],rates:[],allowed:true,rateThrows:false,recheckDenied:false,created:0,events:[],logs:[],signError:false,cleanupError:false,cleanupThrows:false,updateError:false,updateThrows:false,othersError:false,continuityLost:false,verifierId:'actor',verifierSid:'temporary'});
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.example.test';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';process.env.LEAD_IP_HASH_SALT='synthetic-salt';
 f.original={
  getClaims:async()=>response({sub:'actor',session_id:f.continuityLost&&f.events.includes('update')?'changed':'original'}),
  getUser:async()=>({data:{user:{id:'actor',email:'current@example.test'}},error:null}),
  updateUser:async input=>{f.events.push('update');f.updateInput=input;if(f.updateThrows)throw Error('private-sentinel');return {data:{user:{id:'actor'}},error:f.updateError?{message:'private-sentinel',status:400}:null};},
  signOut:async input=>{assert.equal(input.scope,'others');f.events.push('others');return {error:f.othersError?{message:'private-sentinel'}:null};},
 };
 f.verifier={
  signInWithPassword:async input=>{f.events.push('verify');f.signInput=input;return {data:f.signError?{user:null,session:null}:{user:{id:f.verifierId},session:{access_token:'synthetic'}},error:f.signError?{message:'private-sentinel'}:null};},
  getClaims:async()=>response({sub:f.verifierId,session_id:f.verifierSid}),
  signOut:async input=>{assert.equal(input.scope,'local');f.events.push('cleanup');if(f.cleanupThrows)throw Error('private-sentinel');return {error:f.cleanupError?{message:'private-sentinel'}:null};},
 };
 for(const method of ['error','warn','log'])t.mock.method(console,method,(...args)=>f.logs.push(args));
});
afterEach(()=>{assert.equal(JSON.stringify(f.logs).includes('private-sentinel'),false);for(const [key,value]of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
after(()=>{delete globalThis.__passwordChange;});

test(`P1C SDK ${versions.join(' / ')} requires authenticated password change`,async()=>{const r=await invoke();assert.equal(r.status,'complete');assert.deepEqual(f.events,['verify','cleanup','update','others']);assert.equal(f.signInput.email,'current@example.test');assert.deepEqual(f.updateInput,{password:'replacement-password',current_password:'original-password'});assert.equal(f.created,1);assert.deepEqual(f.options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,debug:false});assert.ok(f.authorities.length>=2);for(const args of f.authorities)assert.deepEqual(args,['client',{requireUnbannedAuthUser:true}]);});
test('locked SDK declares current_password but application does not trust field enforcement',()=>{const types=readFileSync(new URL('node_modules/@supabase/auth-js/src/lib/types.ts',root),'utf8');assert.match(types,/current_password\??\s*:\s*string/);});
for(const [label,values]of [['missing current',{currentPassword:''}],['short replacement',{password:'short',confirm:'short'}],['mismatch',{confirm:'different'}],['same password',{password:'original-password',confirm:'original-password'}],['oversize',{currentPassword:'x'.repeat(4097)}]])test(`validation refuses ${label} before credential requests`,async()=>{const r=await invoke(form(values));assert.equal(r.status,'denied');assert.equal(f.created,0);assert.deepEqual(f.events,[]);});
test('anonymous, inactive and banned authority fails closed',async()=>{f.actor=null;assert.equal((await invoke()).status,'denied');assert.equal(f.created,0);});
for(const mode of ['denied','throws','missing salt'])test(`rate control fails closed: ${mode}`,async()=>{if(mode==='denied')f.allowed=false;if(mode==='throws')f.rateThrows=true;if(mode==='missing salt')delete process.env.LEAD_IP_HASH_SALT;assert.equal((await invoke()).status,'denied');assert.equal(f.created,0);});
test('account and IP budgets use opaque keys and existing RPC kind',async()=>{await invoke();assert.equal(f.rates.length,2);assert.notEqual(f.rates[0].p.p_key_hash,f.rates[1].p.p_key_hash);for(const {name,p}of f.rates){assert.equal(name,'consume_rate_limit');assert.equal(p.p_kind,'otp-ip');assert.equal(p.p_window_seconds,300);assert.equal(p.p_max_count,5);assert.match(p.p_key_hash,/^[a-f0-9]{64}$/);}});
test('wrong credentials never update or revoke other sessions',async()=>{f.signError=true;const r=await invoke();assert.equal(r.status,'denied');assert.equal(f.events.includes('update'),false);assert.equal(JSON.stringify(r).includes('private-sentinel'),false);});
for(const mode of ['foreign user','same session'])test(`verifier identity isolation rejects ${mode} and cleans up`,async()=>{if(mode==='foreign user')f.verifierId='other';else f.verifierSid='original';assert.equal((await invoke()).status,'denied');assert.ok(f.events.includes('cleanup'));assert.equal(f.events.includes('update'),false);});
for(const mode of ['error','throw'])test(`cleanup ${mode} prevents mutation`,async()=>{f.cleanupError=mode==='error';f.cleanupThrows=mode==='throw';assert.equal((await invoke()).status,'verification-unconfirmed');assert.equal(f.events.includes('update'),false);});
test('account authority is rechecked after verifier cleanup',async()=>{f.recheckDenied=true;assert.equal((await invoke()).status,'denied');assert.deepEqual(f.events,['verify','cleanup']);});
for(const mode of ['error','throw'])test(`unknown update ${mode} is not success or retried`,async()=>{f.updateError=mode==='error';f.updateThrows=mode==='throw';const r=await invoke();assert.equal(r.status,'update-unconfirmed');assert.equal(f.events.filter(e=>e==='update').length,1);assert.equal(f.events.includes('others'),false);assert.equal(JSON.stringify(r).includes('private-sentinel'),false);});
test('known change and failed revocation is explicitly partial',async()=>{f.othersError=true;assert.equal((await invoke()).status,'changed-unconfirmed');assert.equal(f.events.filter(e=>e==='update').length,1);});
test('lost original session cannot produce complete success',async()=>{f.continuityLost=true;assert.equal((await invoke()).status,'changed-unconfirmed');});
test('posted actor/email cannot select the account',async()=>{await invoke(form({email:'attacker@example.test',userId:'other'}));assert.equal(f.signInput.email,'current@example.test');});
test('legacy or missing publishable key fails before verification',async()=>{process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='legacy-key';assert.equal((await invoke()).status,'denied');assert.equal(f.created,0);});
