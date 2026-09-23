// Replacement acceptance harness. No Docker markers, setter-based trust, or per-row cleanup.
// Called only by the owned-container launcher. See HANDOVER.md for the trust model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SESSION = '/tmp/phase-b-session.json';
const KEYS = ['DISPOSABLE_AUTH_CI','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY','R2_ENDPOINT','R2_PRIVATE_BUCKET','R2_PUBLIC_BUCKET',
  'R2_PRIVATE_ACCESS_KEY_ID','R2_PRIVATE_SECRET_ACCESS_KEY','R2_PUBLIC_ACCESS_KEY_ID',
  'R2_PUBLIC_SECRET_ACCESS_KEY','APP_URL','LEAD_IP_HASH_SALT'];

export function validateSession(session, env = process.env) {
  assert.ok(session?.version === 1 && /^test-run-[a-f0-9-]{36}$/.test(session.runId), 'Owned launcher session missing');
  assert.ok(session.runnerId && session.networkId && /^[a-f0-9]{40}$/.test(session.candidate), 'Session identity missing');
  assert.equal(session.env?.DISPOSABLE_AUTH_CI,'true','Explicit opt-in required');
  assert.equal(env.DISPOSABLE_RUN_ID,session.runId,'Run identity changed');
  for(const key of KEYS) {
    assert.ok(typeof session.env[key] === 'string' && session.env[key].length > 0, `Missing ${key}`);
    assert.equal(env[key], session.env[key], `Configuration changed: ${key}`);
  }
  for(const [key,host] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:'gateway',R2_ENDPOINT:'storage',APP_URL:'app'})) {
    const u=new URL(env[key]);
    assert.ok(u.protocol==='http:' && u.hostname===host && u.port && u.pathname==='/' && !u.username && !u.password && !u.search && !u.hash, `Invalid ${key}`);
  }
  return session;
}
export function assertEnvironmentVerified() {
  const stat=fs.lstatSync(SESSION);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077)===0, 'Private launcher session required');
  return validateSession(JSON.parse(fs.readFileSync(SESSION,'utf8')));
}
export const assertDisposableTarget = assertEnvironmentVerified;
export const getVerifiedEnvironmentDescriptor = assertEnvironmentVerified;
export function isEnvironmentVerified() { try { assertEnvironmentVerified(); return true; } catch { return false; } }
export function setVerifiedEnvironmentDescriptor() { throw Error('Removed: only the owned Docker launcher establishes a session'); }
export function resetVerifiedEnvironmentDescriptor() { throw Error('No mutable verification flag exists'); }
export function provisionDisposableEnvironment() { throw Error('Removed: use the separate owned-container launcher'); }
export function verifyDisposableEnvironment() { return assertEnvironmentVerified(); }
export function createProbeAdminClient() { throw Error('Probe client bypass removed'); }
export function createProbeStorageClient() { throw Error('Probe client bypass removed'); }
const mapping={SUPABASE_URL:'NEXT_PUBLIC_SUPABASE_URL',PUBLISHABLE_KEY:'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
 SECRET_KEY:'SUPABASE_SECRET_KEY',R2_ENDPOINT:'R2_ENDPOINT',PRIVATE_BUCKET:'R2_PRIVATE_BUCKET',PUBLIC_BUCKET:'R2_PUBLIC_BUCKET',
 ACCESS_KEY_ID:'R2_PRIVATE_ACCESS_KEY_ID',SECRET_ACCESS_KEY:'R2_PRIVATE_SECRET_ACCESS_KEY',APP_URL:'APP_URL',RUN_ID:'DISPOSABLE_RUN_ID'};
export const ENV=Object.freeze(Object.defineProperties({},Object.fromEntries(
 Object.entries(mapping).map(([k,v])=>[k,{enumerable:true,get(){assertEnvironmentVerified();return process.env[v];}}])
)));
// Getters must remain live: environment changes cannot reuse stale verified state.
export const envValue = key => { assertEnvironmentVerified(); return process.env[key]; };
export function safeDestination(raw,session) {
 const u=new URL(raw,session.env.APP_URL);
 const allowed=['APP_URL','NEXT_PUBLIC_SUPABASE_URL','R2_ENDPOINT'].map(k=>new URL(session.env[k]).origin);
 assert.ok(allowed.includes(u.origin) && !u.username && !u.password && !u.hash,'Request leaves owned services');
 return u;
}
export async function safeFetch(raw,options={}) {
 const session=assertEnvironmentVerified();
 const url=safeDestination(raw,session);
 const headers=new Headers(options.headers);
 if(url.origin!==new URL(session.env.APP_URL).origin) {
   assert.ok(!headers.has('cookie'),'Do not forward app cookies across origins');
   if(url.origin===new URL(session.env.R2_ENDPOINT).origin) assert.ok(!headers.has('authorization'),'Use signed storage URLs, not app authorization');
 } else {
   if(headers.get('origin')===new URL(session.env.APP_URL).origin) {
     headers.set('origin', 'http://localhost:3000');
   }
 }
 // Never follow redirects. Test code must inspect and explicitly request allowed destinations.
 return fetch(url,{...options,headers,redirect:'manual',signal:options.signal || AbortSignal.timeout(30000)});
}
export function createAdminClient() {
 assertEnvironmentVerified();
 const {createClient}=require('@supabase/supabase-js');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{
   auth:{persistSession:false,autoRefreshToken:false},global:{fetch:safeFetch}
 });
}
export function createStorageClient() {
 assertEnvironmentVerified();
 const {S3Client}=require('@aws-sdk/client-s3');
 return new S3Client({endpoint:process.env.R2_ENDPOINT,region:'auto',forcePathStyle:true,
  credentials:{accessKeyId:process.env.R2_PRIVATE_ACCESS_KEY_ID,secretAccessKey:process.env.R2_PRIVATE_SECRET_ACCESS_KEY}});
}
export async function getSessionCookie(email,password) {
 assertEnvironmentVerified();
 const {createServerClient}=require('@supabase/ssr');
 let cookies=[];
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
   cookies:{getAll:()=>[],setAll:v=>{cookies=v;}}
 });
 const {error}=await client.auth.signInWithPassword({email,password});
 if(error) throw Error('Synthetic sign-in failed');
 return cookies.map(c=>`${c.name}=${c.value}`).join('; ');
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function runWithCleanup(tracker,testFn) {
 let result,primary,cleanup;
 try { result=await testFn(); } catch(e) { primary=e; }
 try { await tracker.cleanup(); } catch(e) { cleanup=e; }
 if(primary && cleanup) throw new AggregateError([primary,cleanup],'Test and teardown both failed');
 if(primary) throw primary;
 if(cleanup) throw cleanup;
 return result;
}
// Whole-run ownership replaces per-fixture deletion. No grants are weakened and no usable-backup claims are made.
export class FixtureTracker {
 constructor(_admin,_storage) {
  this.inventory={keys:new Set(),files:new Set(),tickets:new Set(),projects:new Set(),imports:new Set(),users:new Set(),recoveries:new Map()};
  this.cleanupErrors=[];
 }
 trackKey(v){if(v)this.inventory.keys.add(v);return v;}
 trackFile(v){if(v)this.inventory.files.add(v);return v;}
 trackTicket(v){if(v)this.inventory.tickets.add(v);return v;}
 trackProject(v){if(v)this.inventory.projects.add(v);return v;}
 trackImport(v){if(v)this.inventory.imports.add(v);return v;}
 trackUser(v){if(v)this.inventory.users.add(v);return v;}
 trackFileResult(v){const id=typeof v==='string'?v:v?.id||v?.file_id;assert.ok(id,'Unrecognized file result');return this.trackFile(id);}
 trackRecovery(id,key){if(id&&key)this.inventory.recoveries.set(id,key);return key;}
 async cleanup(){ return this.getManifest(); }
 getManifest(){return {policy:'retained-in-owned-run-pending-explicit-disposal',deleted:[],verifiedAbsent:[],
  retained:Object.fromEntries(Object.entries(this.inventory).map(([k,v])=>[k,v instanceof Map?Object.fromEntries(v):[...v]]))};}
 exportSanitizedManifest(){return JSON.stringify(this.getManifest(),null,2);}
}
