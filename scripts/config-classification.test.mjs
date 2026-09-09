import {test} from 'node:test';
import assert from 'node:assert/strict';
import {r2Category,siteCategory,templateCategories,outboxCategory,allowRequest,production,codes,labels} from './config-classification.mjs';

test('documented R2 jurisdiction is categorized without sending credentials',()=>{
  const account='a'.repeat(32);
  assert.equal(r2Category(`https://${account}.eu.r2.cloudflarestorage.com`),'JURISDICTION');
  assert.equal(r2Category(`https://${account}.fedramp.r2.cloudflarestorage.com`),'JURISDICTION');
  assert.equal(r2Category(`https://${account}.r2.cloudflarestorage.com`),'CANONICAL');
  assert.equal(r2Category(''),'MISSING');
  assert.equal(r2Category(' https://example.test'),'WHITESPACE');
  assert.equal(r2Category('http://example.test'),'NON_HTTPS');
  assert.equal(r2Category('https://example.test/bucket'),'NON_ROOT');
  assert.equal(r2Category('https://user:pass@example.test'),'INVALID');
  assert.equal(r2Category(`https://${account}.r2.cloudflarestorage.com.evil.test`),'OTHER_HOST');
});
test('origin mismatch classifications never return actual origin',()=>{
  assert.equal(siteCategory('https://redwan.work/'),'PRODUCTION_ORIGIN');
  assert.equal(siteCategory('https://redwan.work/reset'),'PRODUCTION_WITH_PATH');
  assert.equal(siteCategory('http://localhost:3000'),'LOCAL_ORIGIN');
  assert.equal(siteCategory('https://private.example.test'),'OTHER_ORIGIN');
});
test('template indicators are not full link verification',()=>{
  assert.equal(templateCategories('<a href="{{ .ConfirmationURL }}">Go</a>')['recovery-confirmation-url'],'PRESENT');
  const x=templateCategories('<a href="{{.SiteURL}}/reset-password?token_hash={{.TokenHash}}&amp;type=recovery">Go</a>');
  assert.equal(x['recovery-token-hash'],'PRESENT');
  assert.equal(x['recovery-reset-path'],'PRESENT');
  assert.equal(templateCategories(null)['recovery-site-url'],'ABSENT');
});
test('outbox diagnoses distinguish cache, relation, permission and unknown without messages',()=>{
  assert.equal(outboxCategory(404,{code:'PGRST205',message:'private marker'}),'TABLE_NOT_IN_CACHE');
  assert.equal(outboxCategory(404,{code:'42P01'}),'RELATION_MISSING');
  assert.equal(outboxCategory(403,{}),'DENIED');
  assert.equal(outboxCategory(503,{code:'untrusted'}),'UNAVAILABLE');
  assert.equal(outboxCategory(200,[]),'AVAILABLE');
  assert.equal(outboxCategory(200,[{id:'private marker'}]),'UNEXPECTED_RESPONSE');
});
test('network scope denies arbitrary hosts, mutation endpoints, redirects and row reads',()=>{
  const h='a'.repeat(20)+'.supabase.co';
  assert.equal(allowRequest(h,'/rest/v1/email_outbox?select=id&limit=0','GET'),true);
  for(const [host,path,method] of [[h,'/rest/v1/email_outbox','GET'],[h,'/rest/v1/email_outbox?select=id&limit=0','POST'],['redwan.work','/api/cron/email-outbox','GET'],['api.supabase.com','/v1/projects/'+'a'.repeat(20)+'/database/query','POST'],['evil.test','/','GET'],['a'.repeat(32)+'.r2.cloudflarestorage.com','/bucket','HEAD']]) assert.equal(allowRequest(host,path,method),false);
});
test('synthetic secret-bearing responses yield only allowlisted classifications',async()=>{
  const calls=[];const marker='DO_NOT_DISCLOSE_PRIVATE_MARKER';
  const log=console.log;const outputs=[];console.log=(s)=>outputs.push(s);
  try {
    const result=await production({R2_ENDPOINT:'https://'+marker+'.invalid',NEXT_PUBLIC_SUPABASE_URL:'https://'+'a'.repeat(20)+'.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_'+marker,SUPABASE_ACCESS_TOKEN:marker},async(h,p,headers)=>{
      calls.push({h,p});
      return p.includes('/config/auth') ? {status:200,body:{site_url:'http://localhost:3000',smtp_pass:marker,mailer_templates_recovery_content:'<a href="{{ .ConfirmationURL }}">'+marker+'</a>'}} : {status:404,body:{code:'PGRST205',message:marker}};
    });
    assert.equal(calls.length,2);
    for(const [k,v] of Object.entries(result)) {assert.ok(labels.has(k));assert.ok(codes.has(v));}
    assert.equal(JSON.stringify(result).includes(marker),false);
    assert.equal(outputs.join('\n').includes(marker),false);
  } finally {console.log=log;}
});
test('invalid target makes zero network calls',async()=>{
  const log=console.log;console.log=()=>{};
  try {await production({NEXT_PUBLIC_SUPABASE_URL:'https://evil.test'},()=>assert.fail('network called'));} finally {console.log=log;}
});
