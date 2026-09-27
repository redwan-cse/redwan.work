import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const state = { snapshot: null, error: null, insertError: null, inserted: [], calls: [], clock: 0 };
globalThis.__f20Route = state;
const modules = {
  'server-only': 'export {};',
  'next/server': 'export class NextRequest extends Request {} export class NextResponse { static json(body,init={}) { return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...init.headers}}); } }',
  '@/lib/supabase/admin': `export function getSupabaseAdmin() {
    const f=globalThis.__f20Route;
    return {
      async rpc(name) { f.calls.push(name);
        return name==='contact_consent_control' ? {data:f.snapshot,error:f.error} : {data:true,error:null}; },
      from(table) { return { insert(lead) {
        f.calls.push(table+':insert'); f.inserted.push(lead);
        if(f.afterInsert)f.snapshot=f.afterInsert;
        return {select(){return {async single(){return {data:f.insertError?null:{ticket_number:1000},error:f.insertError};}}}};
      }}; }
    };
  }`,
  '@/lib/r2': `export const CONTACT_MAX_FILES=5,CONTACT_MAX_SIZE_BYTES=10485760;
    export function isValidContactKey(key){return /^contact\\//.test(key);}
    export async function verifyStoredObjectSize(){globalThis.__f20Route.calls.push('storage');return true;}`,
  // Phone parsing is not exercised by these cases; unexpected use fails.
  'libphonenumber-js': 'export function parsePhoneNumberFromString(){throw Error("Unexpected phone parser");}',
};
const hooks = registerHooks({ resolve(s,c,next) {
  if (Object.hasOwn(modules,s)) return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};
  if(s.startsWith('@/lib/'))return {url:new URL('../../'+s.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
  return next(s,c);
}});
const {archivePolicy}=await import('../../lib/contact/consent-policy.ts');
const route=await import('../../app/api/contact/route.ts');
hooks.deregister();
const bundle={version:'synthetic-current',checkbox:'SYNTHETIC: agree',privacyNotice:'SYNTHETIC: privacy',attachmentNotice:'SYNTHETIC: files',policyText:'SYNTHETIC ONLY, not published.'};
const policy=archivePolicy(bundle),old=archivePolicy({...bundle,version:'synthetic-previous'});
let sequence=0;
const realFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=realFetch;});
function setup(){
  Object.assign(state,{snapshot:{schema:1,activeVersion:policy.version,policies:[policy]},error:null,insertError:null,inserted:[],calls:[],afterInsert:null});
  Object.assign(process.env,{NODE_ENV:'production',LEAD_IP_HASH_SALT:'synthetic-salt',TURNSTILE_SECRET_KEY:'synthetic-token',NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'sb_secret_synthetic'});
  globalThis.fetch=async()=>{state.calls.push('turnstile');return new Response('{"success":true}');};
}
function form(){
  const f=new FormData();
  for(const [k,v]of Object.entries({name:'Synthetic',email:'synthetic@example.test',projectSummary:'Synthetic request with sufficient detail.',gdprConsent:'true',consentPolicyVersion:policy.version,'cf-turnstile-response':'synthetic-'+sequence}))f.set(k,v);
  return f;
}
function request(f=form(),origin='https://example.test'){
  return new Request('https://example.test/api/contact',{method:'POST',body:f,headers:{origin,host:'example.test','x-real-ip':'synthetic-'+(++sequence)}});
}
test('F20 route GET exposes verified public policy without writes or verification calls',async()=>{
  setup();const response=await route.GET();
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{policy:bundle});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(state.calls,['contact_consent_control']);
});
test('F20 route POST persists the actual complete server evidence tuple',async()=>{
  setup();const f=form();for(const k of ['consent_at','consent_policy_hash','consent_capture_method'])f.set(k,'forged');
  const before=Date.now(),response=await route.POST(request(f));
  assert.equal(response.status,200);assert.equal((await response.json()).ticketRef,'TKT-1000');
  assert.equal(state.inserted.length,1);const lead=state.inserted[0];
  assert.equal(lead.consent_policy_version,policy.version);assert.equal(lead.consent_policy_hash,policy.hash);
  assert.equal(lead.consent_capture_method,'explicit-checkbox-v1');
  assert.ok(Date.parse(lead.consent_at)>=before&&Date.parse(lead.consent_at)<=Date.now());
  assert.deepEqual(state.calls,['contact_consent_control','consume_rate_limit','turnstile','consume_rate_limit','leads:insert']);
});
test('F20 route rejects omitted duplicate declined and unknown policy before persistence',async()=>{
  for(const mutate of [
    f=>f.delete('consentPolicyVersion'),f=>f.append('consentPolicyVersion',policy.version),
    f=>f.set('consentPolicyVersion','synthetic-unknown'),f=>f.set('consentPolicyVersion',new Blob(['x'])),
    f=>f.delete('gdprConsent'),f=>f.set('gdprConsent','false'),f=>f.append('gdprConsent','true'),
  ]){
    setup();const f=form();mutate(f);assert.equal((await route.POST(request(f))).status,400);
    assert.equal(state.inserted.length,0);assert.equal(state.calls.includes('turnstile'),false);
  }
});
test('F20 stale route returns current bundle and preserves request values without write or retry',async()=>{
  setup();state.snapshot.policies.push(old);
  const f=form();f.set('consentPolicyVersion',old.version);f.set('projectSummary','Synthetic retained draft');
  f.set('attachments','[{"key":"contact/synthetic.pdf","filename":"synthetic.pdf","mime":"application/pdf","size_bytes":10}]');
  const before=[...f.entries()],response=await route.POST(request(f)),result=await response.json();
  assert.equal(response.status,409);assert.equal(result.code,'consent_stale');assert.deepEqual(result.policy,bundle);
  assert.deepEqual([...f.entries()],before);assert.equal(state.inserted.length,0);
  assert.deepEqual(state.calls,['contact_consent_control']);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('F20 unavailable or disabled control cannot accept timestamp-only leads',async()=>{
  for(const disabled of [true,false]){
    setup();if(disabled)state.snapshot={schema:1,activeVersion:null,policies:[]};else state.error={message:'PRIVATE_SENTINEL'};
    assert.equal((await route.GET()).status,503);
    const response=await route.POST(request());assert.equal(response.status,503);
    assert.equal((await response.text()).includes('PRIVATE_SENTINEL'),false);assert.equal(state.inserted.length,0);
  }
});
test('F20 activation race returns conflict with freshly read policy and never retries insert',async()=>{
  setup();const changed=archivePolicy({...bundle,version:'synthetic-next'});
  state.insertError={code:'PT409',message:'PRIVATE_SENTINEL'};
  state.afterInsert={schema:1,activeVersion:changed.version,policies:[changed]};
  const response=await route.POST(request()),result=await response.json();
  assert.equal(response.status,409);assert.equal(result.code,'consent_stale');
  assert.equal(result.policy.version,changed.version);assert.equal(state.inserted.length,1);
  assert.equal(state.calls.filter(x=>x==='contact_consent_control').length,2);
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'),false);
});
test('F20 disabled insert race and unrelated persistence errors remain distinct and opaque',async()=>{
  for(const [code,status]of [['PT503',503],['23503',502]]){
    setup();state.insertError={code,message:'PRIVATE_SENTINEL'};
    const response=await route.POST(request());assert.equal(response.status,status);
    assert.equal((await response.text()).includes('PRIVATE_SENTINEL'),false);
    assert.equal(state.inserted.length,1);
  }
});
test('F20 integration preserves origin and mandatory-configuration refusals before any query',async()=>{
  setup();assert.equal((await route.POST(request(form(),'https://evil.invalid'))).status,403);assert.deepEqual(state.calls,[]);
  setup();delete process.env.LEAD_IP_HASH_SALT;assert.equal((await route.POST(request())).status,503);assert.deepEqual(state.calls,[]);
});
