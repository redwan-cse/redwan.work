import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {r2Category,siteCategory,templateCategories,outboxCategory} from './config-classification.mjs';

test('documented R2 jurisdiction categories do not imply verified credentials',()=>{
  const a='a'.repeat(32);
  for(const j of ['eu','fedramp']) assert.equal(r2Category(`https://${a}.${j}.r2.cloudflarestorage.com`),'JURISDICTION');
  assert.equal(r2Category(`https://${a}.r2.cloudflarestorage.com`),'CANONICAL');
  assert.equal(r2Category(''),'MISSING');
  assert.equal(r2Category(' https://example.test'),'WHITESPACE');
  assert.equal(r2Category('http://example.test'),'NON_HTTPS');
  assert.equal(r2Category('https://example.test/bucket'),'NON_ROOT');
  assert.equal(r2Category('https://user:pass@example.test'),'INVALID');
  assert.equal(r2Category(`https://${a}.r2.cloudflarestorage.com.evil.test`),'OTHER_HOST');
});
test('origin categories keep actual values private',()=>{
  assert.equal(siteCategory('https://redwan.work/'),'PRODUCTION_ORIGIN');
  assert.equal(siteCategory('https://redwan.work/reset'),'PRODUCTION_WITH_PATH');
  assert.equal(siteCategory('http://localhost:3000'),'LOCAL_ORIGIN');
  assert.equal(siteCategory('https://private.example.test'),'OTHER_ORIGIN');
});
test('template indicators are not complete link acceptance',()=>{
  assert.equal(templateCategories('<a href="{{ .ConfirmationURL }}">Go</a>')['recovery-confirmation-url'],'PRESENT');
  const result=templateCategories('<a href="{{.SiteURL}}/reset-password?token_hash={{.TokenHash}}&amp;type=recovery">Go</a>');
  assert.equal(result['recovery-token-hash'],'PRESENT');
  assert.equal(result['recovery-reset-path'],'PRESENT');
  assert.equal(templateCategories(null)['recovery-site-url'],'ABSENT');
});
test('outbox errors do not reveal messages or infer migration history',()=>{
  assert.equal(outboxCategory(404,{code:'PGRST205',message:'PRIVATE_MARKER'}),'TABLE_NOT_IN_CACHE');
  assert.equal(outboxCategory(404,{code:'42P01'}),'RELATION_MISSING');
  assert.equal(outboxCategory(403,{}),'DENIED');
  assert.equal(outboxCategory(503,{code:'untrusted'}),'UNAVAILABLE');
  assert.equal(outboxCategory(200,[]),'AVAILABLE');
  assert.equal(outboxCategory(200,[{id:'PRIVATE_MARKER'}]),'UNEXPECTED_RESPONSE');
});
test('one-shot network capability and environment mappings are retired',()=>{
  const source=readFileSync(new URL('./config-classification.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/config-classification.yml',import.meta.url),'utf8');
  assert.doesNotMatch(source,/process\.env|node:https|fetch\(|writeFileSync|Authorization|async function/);
  assert.doesNotMatch(workflow,/environment:|secrets\.|statuses: write|github\.token/);
  assert.match(workflow,/contents: read/);
});
