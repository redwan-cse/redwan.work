import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
const f={pages:[],calls:[],authError:null,throwAuth:false,profilePages:[],profileCalls:[],emailCalls:0};
const admin={
 auth:{admin:{
  async listUsers(args){f.calls.push(args);const p=f.pages.shift();if(p instanceof Error)throw p;return p;},
  async getUserById(id){f.emailCalls++;if(f.throwAuth)throw new Error('private-identity-token');return {data:{user:{email:id+'@example.test'}},error:f.authError};}
 }},
 from(){let after=null;const query={select(){return query;},eq(){return query;},order(){return query;},gt(_key,value){after=value;return query;},limit(value){assert.equal(value,100);return query;},then(resolve,reject){f.profileCalls.push(after);return Promise.resolve(f.profilePages.shift()).then(resolve,reject);}};return query;}
};
globalThis.__legacyLookupAdmin=admin;
const modules={'server-only':'export {};','@/lib/supabase/admin':'export function getSupabaseAdmin(){return globalThis.__legacyLookupAdmin;}'};
const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true}:n(s,c);}});
const {findAuthUserByEmail}=await import('../../lib/crm/auth-admin.ts');
const {recipientEmail,emailOrigin,adminRecipients}=await import('../../lib/email/recipients.ts');hooks.deregister();
const full=()=>Array.from({length:200},(_,i)=>({id:'synthetic-'+i,email:`fixture-${i}@example.test`}));
test('full page without total continues instead of declaring account absent',async()=>{f.calls=[];f.pages=[{data:{users:full()},error:null},{data:{users:[{id:'target',email:'TARGET@example.test',app_metadata:{role:'admin'}}]},error:null}];assert.deepEqual(await findAuthUserByEmail(' target@example.test '),{id:'target',email:'TARGET@example.test',role:'admin'});assert.deepEqual(f.calls.map(c=>c.page),[1,2]);});
test('repeated pages and incomplete short pages fail closed',async()=>{for(const pages of [[{data:{users:full()},error:null},{data:{users:full()},error:null}],[{data:{users:[],total:500},error:null}],[{data:null,error:{message:'private-identity-token'}}]]){f.pages=pages;await assert.rejects(findAuthUserByEmail('missing@example.test'),{message:'Account lookup unavailable.'});}});
test('complete short page returns not found',async()=>{f.pages=[{data:{users:[]},error:null}];assert.equal(await findAuthUserByEmail('missing@example.test'),null);});
test('recipient diagnostics never include upstream data',async()=>{const log=console.error,output=[];console.error=(...args)=>output.push(args.join(' '));try{f.authError={message:'private-identity-token'};assert.equal(await recipientEmail('id'),null);f.authError=null;f.throwAuth=true;assert.equal(await recipientEmail('id'),null);}finally{console.error=log;f.throwAuth=false;}assert.deepEqual(output,['Email recipient lookup failed.','Email recipient lookup failed.']);});
test('admin recipient enumeration advances and refuses partial results',async()=>{const rows=Array.from({length:100},(_,i)=>({id:'a'+String(i).padStart(3,'0')}));f.profileCalls=[];f.profilePages=[{data:rows,error:null},{data:[{id:'b000'}],error:null}];assert.equal((await adminRecipients()).length,101);assert.deepEqual(f.profileCalls,[null,'a099']);f.profilePages=[{data:rows,error:null},{data:null,error:{message:'private-identity-token'}}];assert.deepEqual(await adminRecipients(),[]);});
test('legacy origin has no forwarded-header or production-host fallback',async()=>{const old=process.env.NEXT_PUBLIC_SITE_URL;try{for(const raw of['','https://user:secret@example.test','http://example.test','https://example.test/path','https://example.test/?token=private']){process.env.NEXT_PUBLIC_SITE_URL=raw;await assert.rejects(emailOrigin(),{message:'Email origin is not configured.'});}process.env.NEXT_PUBLIC_SITE_URL='https://example.test/';assert.equal(await emailOrigin(),'https://example.test');process.env.NEXT_PUBLIC_SITE_URL='http://localhost:3399';assert.equal(await emailOrigin(),'http://localhost:3399');}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}});
