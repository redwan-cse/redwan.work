// Real locked Supabase client + real HTTP gateway. The upstream database and
// storage bytes are explicit synthetic adapters, not live acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {registerHooks} from 'node:module';
import {createGateway,createMaterial} from '../acceptance/disposable-bootstrap.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const source=`private/${owner}/pending/22222222-2222-4222-8222-222222222222.pdf`;
const final=`private/${owner}/pending/22222222-2222-5222-8222-222222222222.pdf`;
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json',...headers}
});
async function withGateway(upstream,run){
  // Required in CI. Missing locked dependencies fail rather than being skipped.
  const {createClient}=await import('@supabase/supabase-js');
  const material=createMaterial(),calls=[],clientRequests=[];
  const server=createGateway(material,async(url,options)=>{
    const u=new URL(url);
    assert.equal(u.origin,'http://rest:3000','Only the fixed synthetic REST upstream is allowed');
    calls.push({url:u,method:options.method});
    return upstream(u,options);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const admin=createClient(base,material.secretKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,options)=>{
      const u=new URL(input instanceof Request?input.url:String(input));
      assert.equal(u.origin,base,'SDK test may only contact its own loopback gateway');
      clientRequests.push({path:u.pathname,query:u.search,method:options?.method||'GET'});
      return fetch(input,{...options,redirect:'manual',signal:AbortSignal.timeout(5000)});
    }}
  });
  try{return await run({admin,calls,clientRequests});}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('locked Supabase query preserves an encoded immutable key and an absent proof',async()=>{
  await withGateway((u)=>{
    assert.equal(u.pathname,'/immutable_uploads');
    assert.equal(u.searchParams.get('r2_key'),`eq.${final}`);
    assert.equal(u.searchParams.get('select'),'source_key,r2_key,sha256,size_bytes');
    return json([]);
  },async({admin,calls,clientRequests})=>{
    const r=await admin.from('immutable_uploads').select('source_key,r2_key,sha256,size_bytes').eq('r2_key',final).maybeSingle();
    assert.equal(r.error,null,'A valid empty proof query must not become a gateway refusal');
    assert.equal(r.data,null);assert.equal(calls.length,1);assert.equal(clientRequests.length,1);
    assert.match(clientRequests[0].query,/%2F/i);
  });
});
test('locked Supabase HEAD reference query keeps exact counts and encoded filters',async()=>{
  await withGateway((u,options)=>{
    assert.equal(u.pathname,'/files');assert.equal(options.method,'HEAD');
    assert.equal(u.searchParams.get('r2_key'),`eq.${source}`);
    assert.equal(options.headers.prefer,'count=exact');
    return new Response(null,{status:200,headers:{'content-type':'application/json','content-range':'*/0'}});
  },async({admin,calls})=>{
    const r=await admin.from('files').select('id',{count:'exact',head:true}).eq('r2_key',source);
    assert.equal(r.error,null);assert.equal(r.count,0);assert.equal(calls.length,1);
  });
});
test('locked Supabase query keeps a real upstream proof denial failed',async()=>{
  await withGateway(()=>json({code:'42501',message:'Synthetic permission refusal'},403),async({admin,calls})=>{
    const r=await admin.from('immutable_uploads').select('source_key,r2_key,sha256,size_bytes').eq('r2_key',final).maybeSingle();
    assert.equal(r.status,403);assert.equal(r.error?.code,'42501');assert.equal(r.data,null);assert.equal(calls.length,1);
  });
});

async function withActualFinalizer(registrationDenied,run){
  const fixture={objects:new Map([[source,Buffer.from('original')]]),proofs:new Map(),writes:0,registrations:0};
  await withGateway((u,options)=>{
    if(u.pathname==='/immutable_uploads'&&options.method==='GET'){
      const key=u.searchParams.get('r2_key');assert.ok(key?.startsWith('eq.'));
      const p=fixture.proofs.get(key.slice(3));return json(p?[p]:[]);
    }
    assert.equal(u.pathname,'/rpc/register_immutable_upload');assert.equal(options.method,'POST');
    const p=JSON.parse(Buffer.from(options.body).toString());
    fixture.registrations++;
    if(registrationDenied)return json({code:'42501',message:'Synthetic registration refusal'},403);
    assert.equal(p.p_source,source);
    assert.ok(fixture.objects.has(p.p_key),'Proof registration must follow the conditional write');
    fixture.proofs.set(p.p_key,{source_key:p.p_source,r2_key:p.p_key,sha256:p.p_sha256,size_bytes:p.p_size});
    return json(true);
  },async({admin,calls,clientRequests})=>{
    globalThis.__gatewayQueryRegression={admin,fixture};
    const modules={
      'server-only':'export {};',
      '@/lib/supabase/admin':'export function getSupabaseAdmin(){return globalThis.__gatewayQueryRegression.admin;}',
      '@/lib/crm/recovery-storage':`
        export async function readRecoveryBytes(key,limit){
          const bytes=globalThis.__gatewayQueryRegression.fixture.objects.get(key);
          if(!bytes||bytes.length>limit)throw Error('Synthetic byte read refused');
          return Buffer.from(bytes);
        }
        export async function writeRestoredObject(key,bytes){
          const f=globalThis.__gatewayQueryRegression.fixture;
          if(f.objects.has(key)&&!f.objects.get(key).equals(bytes))throw Error('Synthetic conditional-write conflict');
          f.writes++;f.objects.set(key,Buffer.from(bytes));
        }`
    };
    const hook=registerHooks({resolve(s,c,n){
      return Object.hasOwn(modules,s)?{url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true}:n(s,c);
    }});
    try{
      const immutable=await import('../../lib/crm/immutable-upload.ts');
      await run({immutable,fixture,calls,clientRequests});
    }finally{hook.deregister();delete globalThis.__gatewayQueryRegression;}
  });
}
test('actual finalizer uses the locked client through the gateway and retains proof-backed retry behavior',async()=>{
  await withActualFinalizer(false,async({immutable,fixture,calls,clientRequests})=>{
    const first=await immutable.finalizeUpload(source,8,'application/pdf');
    assert.equal(first.key,immutable.immutableUploadKey(source));assert.equal(fixture.proofs.size,1);
    assert.deepEqual(fixture.objects.get(first.key),Buffer.from('original'));
    fixture.objects.set(source,Buffer.from('modified'));
    assert.deepEqual(await immutable.finalizeUpload(source,8,'application/pdf'),first);
    assert.equal(fixture.writes,1);assert.equal(fixture.registrations,1);
    assert.equal(calls.filter(c=>c.url.pathname==='/immutable_uploads').length,3);
    assert.equal(calls.length,4);assert.equal(clientRequests.length,4);
    assert.ok(clientRequests.filter(r=>r.path.endsWith('/immutable_uploads')).every(r=>/%2F/i.test(r.query)));
  });
});
test('actual finalizer cannot convert an upstream registration denial into upload acceptance',async()=>{
  await withActualFinalizer(true,async({immutable,fixture,calls})=>{
    await assert.rejects(()=>immutable.finalizeUpload(source,8,'application/pdf'),/Upload proof unavailable/);
    assert.equal(fixture.writes,1);assert.equal(fixture.registrations,1);assert.equal(fixture.proofs.size,0);
    assert.equal(calls.length,2);
  });
});
