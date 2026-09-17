import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
const f={results:[],writes:0,checks:0}; globalThis.__contactTest=f;
const modules={
 'next/server':'export class NextRequest extends Request {} export class NextResponse { static json(body,init={}) { return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...init.headers}}); } }',
 '@/lib/contact/lead-schema':'export async function sha256Hex(v) { return v; } export function parseLeadPayload() { return {ok:true,lead:{attachments:[]}}; }',
 '@/lib/contact/lead-store':'export async function insertLead() { globalThis.__contactTest.writes++; return {ok:true,ticketRef:"TKT-1000"}; }',
 '@/lib/r2':'export async function verifyStoredObjectSize() { return true; }',
 '@/lib/supabase/admin':'export function getSupabaseAdmin() { return {rpc:async()=>{ const f=globalThis.__contactTest; f.checks++; const r=f.results.shift(); if(r instanceof Error) throw r; return r; }}; }',
};
const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:`data:text/javascript,${encodeURIComponent(modules[s])}`,shortCircuit:true}:n(s,c);}});
const {POST}=await import('../../app/api/contact/route.ts');hooks.deregister();
let sequence=0;
function request(){ const data=new FormData();data.set('cf-turnstile-response','synthetic'); return new Request('https://example.test/api/contact',{method:'POST',body:data,headers:{host:'example.test',origin:'https://example.test','x-forwarded-for':`synthetic-${++sequence}`}}); }
function setup(){process.env.NODE_ENV='production';process.env.LEAD_IP_HASH_SALT='synthetic-salt';process.env.TURNSTILE_SECRET_KEY='synthetic-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.SUPABASE_SECRET_KEY='synthetic-secret';f.writes=0;f.checks=0;f.results=[];}
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({success:true}));
test.after(()=>{globalThis.fetch=oldFetch;});
test('missing mandatory configuration refuses before persistence',async()=>{
 for(const name of ['LEAD_IP_HASH_SALT','TURNSTILE_SECRET_KEY','SUPABASE_SECRET_KEY','NEXT_PUBLIC_SUPABASE_URL']) { setup();delete process.env[name];assert.equal((await POST(request())).status,503);assert.equal(f.writes,0);assert.equal(f.checks,0); }
});
test('IP control failure is never a memory fallback',async()=>{
 for(const result of [{data:null,error:null},{data:true,error:{message:'synthetic-private-diagnostic'}},new Error('synthetic-private-diagnostic')]) {setup();f.results=[result];const res=await POST(request());assert.equal(res.status,503);assert.equal(f.writes,0);assert.equal((await res.text()).includes('synthetic-private'),false);}
});
test('replay control failure refuses a verified request',async()=>{
 setup();f.results=[{data:true,error:null},{data:null,error:null}];assert.equal((await POST(request())).status,503);assert.equal(f.writes,0);
});
test('valid verified submission persists once',async()=>{
 setup();f.results=[{data:true,error:null},{data:true,error:null}];assert.equal((await POST(request())).status,200);assert.equal(f.writes,1);assert.equal(f.checks,2);
});
