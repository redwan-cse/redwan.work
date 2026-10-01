// Real HTTP gateway regressions. No Docker, provider or application data.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createPublicKey,verify} from 'node:crypto';
import {createGateway,createMaterial} from '../acceptance/disposable-bootstrap.mjs';

// Raw request targets avoid fetch normalizing hostile paths before the test.
async function gatewayFixture(run,upstream=()=>new Response('[]',{headers:{'content-type':'application/json'}})){
 const material=createMaterial(),calls=[];
 const server=createGateway(material,async(url,options)=>{calls.push({url,options});return upstream(url,options);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const request=(target,headers={apikey:material.secretKey},method='GET')=>new Promise((resolve,reject)=>{
  const requestHeaders=Array.isArray(headers)?['Host',`127.0.0.1:${server.address().port}`,...headers]:headers;
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:target,method,headers:requestHeaders},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
  });
  req.setTimeout(5000,()=>req.destroy(Error('Synthetic HTTP request timed out')));
  req.on('error',reject);req.end();
 });
 try{return await run({material,calls,request});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const proofKey='private/11111111-1111-4111-8111-111111111111/pending/22222222-2222-5222-8222-222222222222.pdf';
function proofTarget(table='immutable_uploads'){
 const query=new URLSearchParams({select:'source_key,r2_key,sha256,size_bytes',r2_key:`eq.${proofKey}`});
 return `/rest/v1/${table}?${query}`;
}
test('gateway routes encoded immutable proof filters without treating query slashes as path separators',async()=>{
 await gatewayFixture(async({material,calls,request})=>{
  const target=proofTarget();assert.ok(target.includes('%2F'));
  const r=await request(target);assert.equal(r.status,200,'A valid immutable-key query must reach PostgREST');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'http://rest:3000'+target.slice('/rest/v1'.length));
  assert.equal(new URL(calls[0].url).searchParams.get('r2_key'),`eq.${proofKey}`);
  assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.method,'GET');
  const parts=calls[0].options.headers.authorization.slice(7).split('.');
  assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).role,'service_role');
  assert.ok(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:createPublicKey({key:material.jwks.keys[0],format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
  assert.equal(calls[0].options.headers.apikey,undefined);
 });
});
test('gateway preserves encoded file reference filters and HEAD count responses',async()=>{
 await gatewayFixture(async({calls,request})=>{
  const target=proofTarget('files'),r=await request(target,undefined,'HEAD');
  assert.equal(r.status,200);assert.equal(r.body,'');assert.equal(r.headers['content-range'],'*/0');
  assert.equal(calls.length,1);assert.equal(calls[0].options.method,'HEAD');
  assert.equal(calls[0].url,'http://rest:3000'+target.slice('/rest/v1'.length));
 },()=>new Response(null,{headers:{'content-range':'*/0','content-type':'application/json'}}));
});
test('gateway forwards query escapes unchanged and cannot turn them into a different upstream',async()=>{
 await gatewayFixture(async({calls,request})=>{
  const query='r2_key=eq.private%2fpending%5Cname%2Epdf&note=https%3A%2F%2Foutside.invalid%2F%3Fx%3D1%23fragment';
  const r=await request('/rest/v1/immutable_uploads?'+query);
  assert.equal(r.status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://rest:3000/immutable_uploads?'+query);
  assert.equal(new URL(calls[0].url).origin,'http://rest:3000');
  assert.equal(new URL(calls[0].url).pathname,'/immutable_uploads');
 });
});
test('gateway allows encoded Auth filter data only on the fixed Auth upstream',async()=>{
 await gatewayFixture(async({calls,request})=>{
  const target='/auth/v1/admin/users?filter=eq.synthetic%2Ftest%2Eexample';
  assert.equal((await request(target)).status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://auth:9999/admin/users?filter=eq.synthetic%2Ftest%2Eexample');
 });
});
test('gateway still rejects encoded or ambiguous routing paths before upstream',async()=>{
 await gatewayFixture(async({calls,request})=>{
  for(const target of [
   '/rest%2fv1/immutable_uploads?select=r2_key','/rest/v1%2Fimmutable_uploads',
   '/rest/v1/%2e%2E/auth/v1/admin/users','/rest/v1/%5cimmutable_uploads',
   '/rest/v1\\immutable_uploads','//outside.invalid/rest/v1/immutable_uploads',
   'http://outside.invalid/rest/v1/immutable_uploads'
  ])assert.equal((await request(target)).status,400,'Encoded/ambiguous routing paths remain forbidden');
  assert.equal(calls.length,0);
 });
});
test('encoded query values do not bypass missing credentials or mixed bearer denial',async()=>{
 await gatewayFixture(async({material,calls,request})=>{
  for(const headers of [{},{apikey:'synthetic-invalid'},
   {apikey:material.publishableKey,authorization:`Bearer ${material.secretKey}`},
   {apikey:material.secretKey,'user-agent':'Mozilla/5.0'},
   {apikey:material.secretKey,cookie:'synthetic-cookie'}]){
   assert.equal((await request(proofTarget(),headers)).status,401);
  }
  assert.equal(calls.length,0);
 });
});
test('encoded query values preserve hostile Origin and duplicate credential refusal',async()=>{
 await gatewayFixture(async({material,calls,request})=>{
  assert.equal((await request(proofTarget(),{apikey:material.secretKey,origin:'https://hostile.invalid'})).status,403);
  const duplicated=['apikey',material.secretKey,'apikey',material.secretKey];
  assert.equal((await request(proofTarget(),duplicated)).status,401);
  assert.equal(calls.length,0);
 });
});
test('query API credentials remain forbidden even with encoded names or path-like values',async()=>{
 await gatewayFixture(async({calls,request})=>{
  for(const key of ['apikey','%61pikey','api%6bey']){
   assert.equal((await request(`${proofTarget()}&${key}=synthetic%2Fnot-a-credential`)).status,401);
  }
  assert.equal(calls.length,0);
 });
});
test('query escapes cannot turn an unsupported route into a permitted service',async()=>{
 await gatewayFixture(async({calls,request})=>{
  assert.equal((await request('/unknown?next=%2Frest%2Fv1%2Fimmutable_uploads')).status,404);
  assert.equal(calls.length,0);
 });
});
test('encoded proof lookup retains upstream HTTP errors without manufacturing a proof',async()=>{
 await gatewayFixture(async({calls,request})=>{
  const r=await request(proofTarget());assert.equal(r.status,403);
  assert.deepEqual(JSON.parse(r.body),{code:'42501'});assert.equal(calls.length,1);
 },()=>new Response('{"code":"42501"}',{status:403,headers:{'content-type':'application/json'}}));
});
