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
  signInWithPassword:async input=>{f.events.push('verify');f.signInput=input;return {data:f.signError?{user:null,session:null}:{user:{id:f.verifierId},session:{access_token:'synthetic'}},error:f.signError?{message:'private-sentinel',status:400}:null};},
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
test('foreign verifier identity is denied and cleaned',async()=>{f.verifierId='other';assert.equal((await invoke()).status,'denied');assert.ok(f.events.includes('cleanup'));assert.equal(f.events.includes('update'),false);});
test('unexpected original-session alias is never signed out or updated',async()=>{f.verifierSid='original';assert.equal((await invoke()).status,'verification-unconfirmed');assert.deepEqual(f.events,['verify']);});
for(const mode of ['error','throw'])test(`cleanup ${mode} prevents mutation`,async()=>{f.cleanupError=mode==='error';f.cleanupThrows=mode==='throw';assert.equal((await invoke()).status,'verification-unconfirmed');assert.equal(f.events.includes('update'),false);});
test('account authority is rechecked after verifier cleanup',async()=>{f.recheckDenied=true;assert.equal((await invoke()).status,'denied');assert.deepEqual(f.events,['verify','cleanup']);});
for(const mode of ['error','throw'])test(`unknown update ${mode} is not success or retried`,async()=>{f.updateError=mode==='error';f.updateThrows=mode==='throw';const r=await invoke();assert.equal(r.status,'update-unconfirmed');assert.equal(f.events.filter(e=>e==='update').length,1);assert.equal(f.events.includes('others'),false);assert.equal(JSON.stringify(r).includes('private-sentinel'),false);});
test('known change and failed revocation is explicitly partial',async()=>{f.othersError=true;assert.equal((await invoke()).status,'changed-unconfirmed');assert.equal(f.events.filter(e=>e==='update').length,1);});
test('lost original session cannot produce complete success',async()=>{f.continuityLost=true;assert.equal((await invoke()).status,'changed-unconfirmed');});
test('posted actor/email cannot select the account',async()=>{await invoke(form({email:'attacker@example.test',userId:'other'}));assert.equal(f.signInput.email,'current@example.test');});
test('legacy or missing publishable key fails before verification',async()=>{process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='legacy-key';assert.equal((await invoke()).status,'denied');assert.equal(f.created,0);});
test('verification response loss is uncertain, with no update',async()=>{f.verifier.signInWithPassword=async()=>{throw Error('private-sentinel');};assert.equal((await invoke()).status,'verification-unconfirmed');assert.equal(f.events.includes('update'),false);});
test('claim-verification failure still cleans the temporary session',async()=>{f.verifier.getClaims=async()=>{throw Error('private-sentinel');};assert.equal((await invoke()).status,'denied');assert.deepEqual(f.events,['verify','cleanup']);});

// Component execution with synthetic hooks/DOM, separate from real browser acceptance.
let Component;
const ui={};globalThis.__passwordUI=ui;
after(()=>{delete globalThis.__passwordUI;});
async function setupUI(t){
 Object.assign(ui,{slots:[],cursor:0,calls:0,resets:0,result:{status:'complete',notice:'Synthetic success'},reject:false,hold:null});
 ui.state=initial=>{const i=ui.cursor++;if(!(i in ui.slots))ui.slots[i]=initial;return [ui.slots[i],v=>{ui.slots[i]=v;}];};
 ui.ref=initial=>{const i=ui.cursor++;if(!(i in ui.slots))ui.slots[i]={current:initial};return ui.slots[i];};
 ui.submit=async()=>{ui.calls++;if(ui.hold)await ui.hold;if(ui.reject)throw Error('private-sentinel');return ui.result;};
 if(!Component){
  assert.ok(existsSync(new URL('components/password-change-form.tsx',root)),'password form is not implemented');
  const ts=await import('typescript');
  const source=readFileSync(new URL('components/password-change-form.tsx',root),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const stubs={
   react:'export const useState=v=>globalThis.__passwordUI.state(v),useRef=v=>globalThis.__passwordUI.ref(v);',
   'react/jsx-runtime':'export const Fragment="fragment";export function jsx(type,props){return {type,props};}export const jsxs=jsx;',
   'next/link':'export default "a";',
   '@/components/ui/button':'export const Button="button";',
   '@/components/ui/input':'export const Input="input";',
   '@/components/ui/label':'export const Label="label";',
   '@/lib/auth/password-change':'export async function changePasswordAction(){return globalThis.__passwordUI.submit();}',
  };
  const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(stubs,s)?{url:'data:text/javascript,'+encodeURIComponent(stubs[s]),shortCircuit:true}:n(s,c);}});
  try{Component=(await import('data:text/javascript,'+encodeURIComponent(compiled))).PasswordChangeForm;}finally{hooks.deregister();}
 }
 const data=form();ui.data=data;
 t.mock.method(globalThis,'FormData',function(){return data;});
}
function renderUI(){ui.cursor=0;return Component();}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
function submitUI(tree){return nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{reset(){ui.resets++;}}});}
test('password form labels, autofill, policy and recovery remain accessible',async t=>{await setupUI(t);const all=nodes(renderUI());const inputs=all.filter(n=>n.type==='input');assert.equal(inputs.length,3);for(const input of inputs){assert.equal(input.props.type,'password');assert.equal(input.props.required,true);assert.ok(all.some(n=>n.type==='label'&&n.props.htmlFor===input.props.id));}assert.deepEqual(inputs.map(n=>n.props.autoComplete),['current-password','new-password','new-password']);assert.ok(all.some(n=>n.type==='a'&&n.props.href==='/login'));assert.ok(all.some(n=>n.props.id==='password-policy'));});
test('password form guards synchronous duplicate submissions and clears credentials',async t=>{await setupUI(t);let release;ui.hold=new Promise(r=>{release=r;});const tree=renderUI();const first=submitUI(tree);await submitUI(tree);assert.equal(ui.calls,1);const pending=nodes(renderUI());assert.equal(pending.find(n=>n.type==='form').props['aria-busy'],true);assert.ok(pending.filter(n=>n.type==='input'||n.type==='button').every(n=>n.props.disabled));release();await first;assert.equal(ui.resets,1);assert.equal([...ui.data.keys()].length,0);assert.ok(nodes(renderUI()).some(n=>n.props.role==='status'));});
test('password form announces rejection and allows a deliberate retry',async t=>{await setupUI(t);ui.result={status:'denied',error:'Synthetic rejection'};await submitUI(renderUI());const all=nodes(renderUI());assert.ok(all.some(n=>n.props.role==='alert'));assert.equal(all.find(n=>n.type==='button').props.disabled,false);assert.equal(ui.resets,1);});
for(const result of ['update-unconfirmed','changed-unconfirmed','verification-unconfirmed','transport'])test(`password form stops blind retry after ${result}`,async t=>{await setupUI(t);if(result==='transport')ui.reject=true;else ui.result={status:result,error:'Synthetic uncertainty'};await submitUI(renderUI());await submitUI(renderUI());const all=nodes(renderUI());assert.equal(ui.calls,1);assert.equal(all.find(n=>n.type==='button').props.disabled,true);assert.ok(all.some(n=>n.props.role==='alert'));assert.equal(JSON.stringify(ui.slots).includes('private-sentinel'),false);});
