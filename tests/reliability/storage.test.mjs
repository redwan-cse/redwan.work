import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
const f = { calls: [], response: null };
globalThis.__storageTest = f;
const modules = {
  'server-only': 'export {};',
  '@aws-sdk/client-s3': `export class S3Client { async send(command) { const f=globalThis.__storageTest; f.calls.push(command); if (f.response instanceof Error) throw f.response; return typeof f.response === 'function' ? f.response(command) : f.response; } } export class HeadObjectCommand { constructor(input) { this.input=input; this.kind='head'; } } export class DeleteObjectsCommand { constructor(input) { this.input=input; this.kind='delete'; } } export class ListObjectsV2Command { constructor(input) { this.input=input; this.kind='list'; } } export class DeleteObjectCommand {} export class PutObjectCommand { constructor(input) { this.input=input; } }`,
  '@aws-sdk/s3-request-presigner': 'export async function getSignedUrl() { throw new Error("unexpected signing"); }',
};
const hooks=registerHooks({ resolve(specifier,context,next) {
  if (Object.hasOwn(modules,specifier)) return { url:`data:text/javascript,${encodeURIComponent(modules[specifier])}`,shortCircuit:true };
  if (specifier==='@/lib/mime') return { url:new URL('../../lib/mime.ts',import.meta.url).href,shortCircuit:true };
  return next(specifier,context);
} });
const r2=await import('../../lib/r2.ts');
hooks.deregister();
for (const name of ['R2_ENDPOINT','R2_PRIVATE_BUCKET','R2_PRIVATE_ACCESS_KEY_ID','R2_PRIVATE_SECRET_ACCESS_KEY']) process.env[name]='synthetic-test-only';
const uid='11111111-1111-4111-8111-111111111111';
const contact=`contact/${uid}/${uid}.pdf`;
const portal=`private/${uid}/pending/${uid}.pdf`;
test('contact HEAD succeeds without granting contact GET access',async()=>{
  f.response={ ContentLength:17 }; f.calls=[];
  assert.equal(await r2.verifyStoredObjectSize(contact,17),true);
  assert.equal(f.calls[0].input.Key,contact);
  assert.equal(await r2.verifyStoredObjectSize(contact,18),false);
  await assert.rejects(r2.presignPrivateGet(contact),/Invalid portal key/);
});
test('missing and invalid objects never confirm',async()=>{
  f.response=Object.assign(new Error('synthetic'),{name:'NotFound'});
  assert.equal(await r2.verifyStoredObjectSize(portal,1),false);
  f.calls=[];
  for(const n of [0,-1,1.5,Infinity,10485761]) assert.equal(await r2.verifyStoredObjectSize(portal,n),false);
  assert.equal(f.calls.length,0);
});
test('deletion requires every unique key to be acknowledged',async()=>{
  f.response={ Deleted:[{Key:contact}],Errors:[{Key:portal,Message:'synthetic-private-value'}] };
  await assert.rejects(r2.deletePrivateObjects([contact,portal]),/Tracking records retained/);
  f.response={ Deleted:[{Key:contact}] };
  await assert.rejects(r2.deletePrivateObjects([contact,portal]),/incomplete/);
  assert.equal(await r2.deletePrivateObjects([contact,contact]),1);
  f.response=c=>({Deleted:c.input.Delete.Objects});
  assert.equal(await r2.deletePrivateObjects([contact,portal]),2);
});
test('truncated or looping storage listings fail rather than authorize cleanup',async()=>{
  f.response={IsTruncated:true,Contents:[]};
  await assert.rejects(r2.listPrivateObjects('private/'),/incomplete/);
  f.response={IsTruncated:true,NextContinuationToken:'synthetic-cursor',Contents:[]};
  await assert.rejects(r2.listPrivateObjects('private/'),/incomplete/);
  f.response={IsTruncated:false,Contents:[{Key:portal,LastModified:new Date(),Size:1}]};
  assert.equal((await r2.listPrivateObjects('private/')).length,1);
});
test('file metadata uses integer byte limits and MIME allowlist',()=>{
  assert.equal(r2.validateContactFile({filename:'a.pdf',mime:'application/pdf',size:1}).ok,true);
  for(const value of [null,{}, {filename:'a.pdf',mime:'text/html',size:1},{filename:'a.pdf',mime:'application/pdf',size:1.5}]) assert.equal(r2.validateContactFile(value).ok,false);
});
