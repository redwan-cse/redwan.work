import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const fixture={role:'client',failed:false};globalThis.__loginReturn=fixture;
const modules={
 'next/navigation':'export function redirect(destination){throw Object.assign(new Error("Synthetic redirect"),{destination});}',
 'next/headers':'export async function headers(){throw Error("Unexpected headers");}',
 '@/lib/contact/lead-schema':'export async function sha256Hex(){throw Error("Unexpected OTP use");}',
 '@/lib/supabase/admin':'export function getSupabaseAdmin(){throw Error("Unexpected admin access");}',
 '@/lib/supabase/server':'export async function createSupabaseServerClient(){const f=globalThis.__loginReturn;return {auth:{signInWithPassword:async()=>({error:f.failed?{}:null}),getClaims:async()=>({data:{claims:{app_metadata:{role:f.role}}}})}};}'
};
const hooks=registerHooks({resolve(s,c,n){return Object.hasOwn(modules,s)?{url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true}:n(s,c);}});
const {signInWithPasswordAction}=await import('../../lib/auth/actions.ts');hooks.deregister();
async function run(next){const f=new FormData();f.set('email','fixture@example.test');f.set('password','synthetic');f.set('next',next);try{return await signInWithPasswordAction({},f);}catch(e){if(typeof e.destination==='string')return e.destination;throw e;}}
test('client return paths never target the admin panel',async()=>{fixture.role='client';for(const next of ['/admin','/admin/invoices?tab=open','/%61dmin','/portal/../admin'])assert.equal(await run(next),'/portal');assert.equal(await run('/portal/projects/uuid-with-hyphens?tab=files'),'/portal/projects/uuid-with-hyphens?tab=files');});
test('admin return paths never target the client panel',async()=>{fixture.role='admin';for(const next of ['/portal','/portal/projects?tab=open','/%70ortal','/admin/../portal'])assert.equal(await run(next),'/admin');assert.equal(await run('/admin/projects/uuid-with-hyphens?tab=files'),'/admin/projects/uuid-with-hyphens?tab=files');});
test('public same-origin destinations remain valid for either role',async()=>{for(const role of ['client','admin']){fixture.role=role;assert.equal(await run('/contact?from=sign-in'),'/contact?from=sign-in');}});
test('failed password authentication never redirects',async()=>{fixture.failed=true;try{assert.deepEqual(await run('/admin'),{error:'Invalid email or password.'});}finally{fixture.failed=false;}});
