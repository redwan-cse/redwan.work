// Executes real source with synthetic service adapters. No provider/network transport.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {writeFileSync} from 'node:fs';
const marker='PRIVATE_SENTINEL_TOKEN_ADDRESS';
const f={mode:'ok',calls:[],rpcError:null,existing:null,authRole:'client',profileRole:'client',active:true};
globalThis.__auditChallenge=f;
const admin={
  from(table){let op='read';const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},range(){return q;},limit(){return q;},insert(){op='insert';f.calls.push(table+':insert');return q;},update(){op='update';f.calls.push(table+':update');return q;},async maybeSingle(){return response();},then(resolve,reject){return Promise.resolve(response()).then(resolve,reject);}};
    function response(){
      if(f.mode===table+':'+op)return {data:null,count:null,error:{message:marker}};
      if(table==='profiles')return {data:{id:'fixture-user',role:f.profileRole,is_active:f.active},error:null};
      if(table==='ticket_messages')return {data:[],error:null};
      if(table==='tickets')return {data:op==='read'?{id:'fixture-ticket',client_id:'fixture-user',status:'open',profiles:null}: {id:'fixture-ticket'},count:0,error:null};
      return {data:null,error:null};
    }
    return q;
  },
  async rpc(){f.calls.push('rpc');return f.rpcError?{data:null,error:{message:f.rpcError}}:{data:'fixture-ticket',error:null};},
  auth:{admin:{async getUserById(){return {data:{user:{id:'fixture-user',email:'fixture@example.test',app_metadata:{role:f.authRole}}},error:null};},async updateUserById(){f.calls.push('auth:update');return {error:null};},async inviteUserByEmail(){f.calls.push('auth:invite');return {data:{user:{id:'fixture-user'}},error:null};}}}
};
globalThis.__auditChallengeAdmin=admin;
const modules={
  'server-only':'export {};',
  '@/lib/supabase/admin':'export function getSupabaseAdmin(){return globalThis.__auditChallengeAdmin;}',
  '@/lib/crm/auth-admin':'export async function findAuthUserByEmail(){return globalThis.__auditChallenge.existing;}',
  '@/lib/email':'export function queueEmail(){}'+['recordExternalSend','recordUnsent','sendNewTicketEmail','sendReplyPostedEmail','sendStatusChangedEmail','sendToAll'].map(n=>`export async function ${n}(){throw Error("Unexpected email invocation");}`).join(''),
  '@/lib/email/recipients':['adminRecipients','emailOrigin','recipientEmail','recipientName','ticketEmailContext'].map(n=>`export async function ${n}(){throw Error("Unexpected recipient invocation");}`).join(''),
  '@/lib/r2':'export const CONTACT_MAX_FILES=5,CONTACT_MAX_SIZE_BYTES=10485760;export function isValidContactKey(){return true;}'
};
const hooks=registerHooks({resolve(s,c,n){if(s==='@/lib/crm/result')return {url:new URL('../lib/crm/result.ts',import.meta.url).href,shortCircuit:true};if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};return n(s,c);}});
const tickets=await import('../lib/crm/tickets.ts');
const clients=await import('../lib/crm/clients.ts');
const {parseLeadPayload}=await import('../lib/contact/lead-schema.ts');
hooks.deregister();
function reset(){Object.assign(f,{mode:'ok',calls:[],rpcError:null,existing:null,authRole:'client',profileRole:'client',active:true});}
const results={};
async function check(name,fn){try{reset();await fn();results[name]='PASS';}catch{results[name]='FAIL';}console.log(name+': '+results[name]);}
function opaque(value){assert.equal(JSON.stringify(value).includes(marker),false);}
await check('F06-ticket-count-read-write-errors',async()=>{
  for(const fn of [()=>tickets.countOpenTickets(),()=>tickets.countOwnOpenTickets('fixture-user'),()=>tickets.listTickets({}),()=>tickets.listOwnTickets('fixture-user')]){
    reset();f.mode='tickets:read';let caught;try{await fn();}catch(e){caught=e;}assert.ok(caught);assert.equal(caught.message.includes(marker),false);
  }
  for(const fn of [()=>tickets.getTicketThread('fixture-ticket'),()=>tickets.getOwnTicketThread('fixture-user','fixture-ticket')]){
    for(const mode of ['tickets:read','ticket_messages:read']){reset();f.mode=mode;const r=await fn();assert.equal(r.ok,false);opaque(r);}
  }
  for(const fn of [()=>tickets.adminReply('fixture-ticket','fixture-user','Synthetic reply'),()=>tickets.clientReply('fixture-ticket','fixture-user','Synthetic reply')]){
    for(const mode of ['tickets:read','ticket_messages:insert']){reset();f.mode=mode;const r=await fn();assert.equal(r.ok,false);opaque(r);if(mode==='tickets:read')assert.equal(f.calls.length,0);}
  }
  for(const mode of ['tickets:read','tickets:update']){reset();f.mode=mode;const r=await tickets.setTicketStatus('fixture-ticket','closed');assert.equal(r.ok,false);opaque(r);}
  for(const message of [marker,'Ticket limit reached','Submission conflict']){reset();f.rpcError=message;const r=await tickets.createTicket('fixture-user','Synthetic','Synthetic message');assert.equal(r.ok,false);opaque(r);}
});
await check('F16-admin-role-store-protection',async()=>{
  for(const [authRole,profileRole]of [['admin','admin'],['admin','client'],['client','admin']]){
    reset();f.authRole=authRole;f.profileRole=profileRole;f.existing={id:'fixture-user',role:authRole};
    const r=await clients.inviteClient({email:'fixture@example.test',fullName:'Synthetic',redirectToBase:'https://example.test'});
    assert.equal(r.ok,false);assert.equal(f.calls.length,0);
  }
  reset();f.profileRole='admin';f.authRole='admin';
  const r=await clients.setClientActive('fixture-user',false);assert.equal(r.ok,false);assert.equal(f.calls.length,0);
});
function form(consent){const x=new FormData();x.set('name','Synthetic');x.set('email','fixture@example.test');x.set('projectSummary','Synthetic request with sufficient detail.');if(consent!==undefined)x.set('gdprConsent',consent);return x;}
await check('F20-explicit-consent-and-time',async()=>{
  for(const value of [undefined,'false','','on','TRUE'])assert.equal(parseLeadPayload(form(value),{ipHash:null,userAgent:null}).ok,false);
  const duplicate=form('true');duplicate.append('gdprConsent','true');assert.equal(parseLeadPayload(duplicate,{ipHash:null,userAgent:null}).ok,false);
  const r=parseLeadPayload(form('true'),{ipHash:null,userAgent:null});assert.equal(r.ok,true);assert.ok(Number.isFinite(Date.parse(r.lead.consent_at)));
});
await check('F20-policy-version-recorded',async()=>{
  const r=parseLeadPayload(form('true'),{ipHash:null,userAgent:null});assert.equal(r.ok,true);
  // Issue45 explicitly asks for policy/version/time. A timestamp alone is not a version.
  const key=Object.keys(r.lead).find(k=>/policy.*(?:version|hash)|consent.*(?:version|hash)/i.test(k));
  assert.ok(key&&typeof r.lead[key]==='string'&&r.lead[key].length>0);
});
writeFileSync(process.argv[2],JSON.stringify(results),{mode:0o600});
process.exitCode=Object.values(results).includes('FAIL')?1:0;
