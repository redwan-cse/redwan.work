import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {S3Client,CreateBucketCommand,DeleteObjectCommand,DeleteBucketCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
assert.equal(process.env.DISPOSABLE_AUTH_CI,'true');
assert.equal(process.env.R2_ENDPOINT,'http://127.0.0.1:9000');
const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(api.hostname)&&api.port==='54321'&&api.protocol==='http:');
const admin=createClient(api.origin,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
globalThis.__contactPipelineAdmin=admin;
const hooks=registerHooks({resolve(s,c,n){
 if(s==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
 if(s==='next/server')return n('next/server.js',c);
 if(s==='@/lib/supabase/admin')return {url:'data:text/javascript,export function getSupabaseAdmin(){return globalThis.__contactPipelineAdmin;}',shortCircuit:true};
 if(s.startsWith('@/lib/'))return {url:new URL('../../'+s.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
 return n(s,c);
}});
const {POST}=await import('../../app/api/contact/route.ts');
const {presignContactUpload}=await import('../../lib/r2.ts');
const storage=new S3Client({endpoint:process.env.R2_ENDPOINT,region:'auto',forcePathStyle:true,credentials:{accessKeyId:process.env.R2_PRIVATE_ACCESS_KEY_ID,secretAccessKey:process.env.R2_PRIVATE_SECRET_ACCESS_KEY}});
const realFetch=globalThis.fetch;
function safe(r){if(r.error)throw Error('Synthetic service assertion failed');return r.data;}
const hash=x=>createHash('sha256').update(x).digest('hex');
test('actual contact route with local persistence storage and concurrent rate control',{timeout:120000},async()=>{
 const salt=randomBytes(32).toString('hex'),email=`contact-${randomBytes(8).toString('hex')}@example.test`;
 const Bucket=process.env.R2_PRIVATE_BUCKET,keys=[],rateHashes=new Set();let created=false,phase='contact fixtures',failed=null,index=0;
 process.env.LEAD_IP_HASH_SALT=salt;process.env.TURNSTILE_SECRET_KEY='synthetic-turnstile';process.env.NODE_ENV='production';
 globalThis.fetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(u.href==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return new Response(JSON.stringify({success:true}),{status:200});
  if(![api.origin,'http://127.0.0.1:9000'].includes(u.origin))throw Error('External transport forbidden');
  return realFetch(input,init);
 };
 async function count(){const r=await admin.from('leads').select('id',{count:'exact',head:true}).eq('email',email);safe(r);return r.count;}
 function request(entries,token=randomUUID(),consent='true'){
  const ip='192.0.2.'+(++index);rateHashes.add(hash(salt+ip));rateHashes.add(hash(token));
  const form=new FormData();form.set('name','Synthetic contact');form.set('email',email);form.set('projectSummary','Synthetic full-route acceptance request.');form.set('gdprConsent',consent);form.set('cf-turnstile-response',token);
  if(entries!==undefined)form.set('attachments',JSON.stringify(entries));
  if(consent==='duplicate'){form.set('gdprConsent','true');form.append('gdprConsent','true');}
  return new Request('http://localhost:3399/api/contact',{method:'POST',body:form,headers:{origin:'http://localhost:3399',host:'localhost:3399','cf-connecting-ip':ip,'user-agent':'Synthetic pipeline acceptance'}});
 }
 try{
  await storage.send(new CreateBucketCommand({Bucket}));created=true;
  phase='contact stored bytes';const bytes=randomBytes(71);const signed=await presignContactUpload('fixture.pdf','application/pdf',bytes.length);keys.push(signed.key);
  assert.ok((await fetch(signed.uploadUrl,{method:'PUT',body:bytes,headers:{'Content-Type':'application/pdf'}})).ok);
  const entry={key:signed.key,filename:'fixture.pdf',mime:'application/pdf',size_bytes:71};
  phase='contact route persistence';const token=randomUUID();const response=await POST(request([entry],token));assert.equal(response.status,200);const body=await response.json();assert.match(body.ticketRef,/^TKT-\d+$/);assert.equal(await count(),1);
  const row=safe(await admin.from('leads').select('ticket_number,attachments,consent_at,user_agent').eq('email',email).single());assert.equal(body.ticketRef,'TKT-'+row.ticket_number);assert.deepEqual(row.attachments,[entry]);assert.ok(Number.isFinite(Date.parse(row.consent_at)));assert.equal(row.user_agent,'Synthetic pipeline acceptance');
  phase='contact replay denial';assert.equal((await POST(request([entry],token))).status,400);assert.equal(await count(),1);
  phase='contact invalid attachments';
  const missing={...entry,key:`contact/${randomUUID()}/${randomUUID()}.pdf`};
  for(const invalid of [[{...entry,size_bytes:72}],[missing],[{...entry,key:`private/${randomUUID()}/pending/${randomUUID()}.pdf`}]]){assert.equal((await POST(request(invalid))).status,400);assert.equal(await count(),1);}
  phase='contact consent denial';for(const consent of ['false','duplicate']){assert.equal((await POST(request(undefined,randomUUID(),consent))).status,400);assert.equal(await count(),1);}
  phase='contact no attachment';assert.equal((await POST(request(undefined))).status,200);assert.equal(await count(),2);
  phase='contact configuration denial';delete process.env.LEAD_IP_HASH_SALT;assert.equal((await POST(request(undefined))).status,503);assert.equal(await count(),2);process.env.LEAD_IP_HASH_SALT=salt;
  phase='concurrent persistent rate budget';const key=hash(randomUUID());rateHashes.add(key);
  const outcomes=await Promise.all(Array.from({length:20},()=>admin.rpc('consume_rate_limit',{p_kind:'ip',p_key_hash:key,p_window_seconds:3600,p_max_count:5})));
  assert.equal(outcomes.map(safe).filter(Boolean).length,5);
  console.log('Passed: actual route/parser/lead persistence, real signed bytes/HEAD, replay/consent/attachment denials and shared concurrent database quota.');
 }catch{failed='Contact pipeline acceptance failed at '+phase+'; sensitive details withheld';}
 finally{
  try{
   safe(await admin.from('leads').delete().eq('email',email));assert.equal(await count(),0);
   if(rateHashes.size)safe(await admin.from('rate_limits').delete().in('key_hash',[...rateHashes]));
   if(created){for(const Key of keys)await storage.send(new DeleteObjectCommand({Bucket,Key}));const list=await storage.send(new ListObjectsV2Command({Bucket}));assert.equal(list.KeyCount,0);assert.equal(Boolean(list.IsTruncated),false);await storage.send(new DeleteBucketCommand({Bucket}));}
  }catch{failed=(failed??'Contact pipeline assertions completed')+'; acceptance failed at cleanup; sensitive details withheld';}
  globalThis.fetch=realFetch;storage.destroy();hooks.deregister();delete globalThis.__contactPipelineAdmin;
 }
 if(failed)throw Error(failed);
});
