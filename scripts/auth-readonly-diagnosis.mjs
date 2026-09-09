// Retired: pure read-only classifier tests, no provider transport or environment access.
// Historical inspected GET-only executable: 9f8b672c97ac545af989b4469f56f66b64992699.
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
export function pathFor(value) {
  if(typeof value!=='string'||/\s/.test(value))throw new Error('INVALID');
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname))throw new Error('INVALID');
  return '/v1/projects/'+u.hostname.split('.')[0]+'/config/auth';
}
export function authRequestAllowed(host,path,method) {
  return host==='api.supabase.com' && method==='GET' && /^\/v1\/projects\/[a-z0-9]{20}\/config\/auth$/.test(path);
}
const codes=new Set(['AVAILABLE','DENIED','UNAVAILABLE','INVALID_RESPONSE','EXPECTED','DIFFERENT','LEGACY_LINK','DIRECT_LINK','OTHER_TEMPLATE','STABLE','CHANGED','NOT_CHECKED','CONFIRMED','UNKNOWN']);
const labels=new Set(['auth-read','site-origin','recovery-template','repeat-targets','repeat-other-config','historical-stage']);
function safeResult(result) {
  return result && Object.entries(result).every(([k,v])=>labels.has(k)&&codes.has(v));
}
export function classify(a,b) {
  const fields=['site_url','mailer_templates_recovery_content'];
  const select=x=>Object.fromEntries(fields.map(k=>[k,x[k]]));
  const rest=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!fields.includes(k)));
  const text=a.mailer_templates_recovery_content;
  const legacy=/\{\{\s*\.ConfirmationURL\s*\}\}/.test(text);
  const direct=/\{\{\s*\.TokenHash\s*\}\}/.test(text)&&text.includes('/reset-password?');
  return {'auth-read':'AVAILABLE','site-origin':a.site_url==='https://redwan.work'?'EXPECTED':'DIFFERENT','recovery-template':legacy?'LEGACY_LINK':direct?'DIRECT_LINK':'OTHER_TEMPLATE','repeat-targets':isDeepStrictEqual(select(a),select(b))?'STABLE':'CHANGED','repeat-other-config':isDeepStrictEqual(rest(a),rest(b))?'STABLE':'CHANGED','historical-stage':'UNKNOWN'};
}
function responseCategory(status) {return [401,403].includes(status)?'DENIED':'UNAVAILABLE';}
export async function diagnose(get,wait=()=>new Promise(r=>setTimeout(r,3000))) {
  const result={'auth-read':'UNAVAILABLE','site-origin':'NOT_CHECKED','recovery-template':'NOT_CHECKED','repeat-targets':'NOT_CHECKED','repeat-other-config':'NOT_CHECKED','historical-stage':'UNKNOWN'};
  try {
    const a=await get();
    if(a.status!==200)return {...result,'auth-read':responseCategory(a.status)};
    const valid=x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.site_url==='string'&&typeof x.mailer_templates_recovery_content==='string';
    if(!valid(a.data))return {...result,'auth-read':'INVALID_RESPONSE'};
    await wait();
    const b=await get();
    if(b.status!==200)return {...result,'auth-read':responseCategory(b.status)};
    if(!valid(b.data))return {...result,'auth-read':'INVALID_RESPONSE'};
    return classify(a.data,b.data);
  }catch{return result;}
}
async function selftest() {
  const path=pathFor('https://'+'a'.repeat(20)+'.supabase.co');
  assert.equal(authRequestAllowed('api.supabase.com',path,'GET'),true);
  for(const method of ['PATCH','POST','PUT','DELETE','HEAD'])assert.equal(authRequestAllowed('api.supabase.com',path,method),false);
  assert.equal(authRequestAllowed('redwan.work','/api/cron/email-outbox','GET'),false);
  assert.equal(authRequestAllowed('api.supabase.com',path+'/signing-keys','GET'),false);
  assert.throws(()=>pathFor('https://evil.test'));
  const original={site_url:'https://private.invalid',mailer_templates_recovery_content:'{{ .ConfirmationURL }}',smtp_pass:'PRIVATE_MARKER'};
  let count=0;
  const fixed=await diagnose(async()=>{count++;return {status:200,data:structuredClone(original)};},async()=>{});
  assert.equal(count,2);assert.equal(fixed['repeat-other-config'],'STABLE');assert.equal(fixed['historical-stage'],'UNKNOWN');
  assert.equal(safeResult(fixed),true);assert.equal(JSON.stringify(fixed).includes('PRIVATE_MARKER'),false);assert.equal(JSON.stringify(fixed).includes('private.invalid'),false);
  assert.equal(classify(original,{...original,smtp_pass:'different'})['repeat-other-config'],'CHANGED');
  assert.equal(classify(original,{...original,site_url:'https://redwan.work'})['repeat-targets'],'CHANGED');
  assert.equal((await diagnose(async()=>({status:403}),async()=>{}))['auth-read'],'DENIED');
  assert.equal((await diagnose(async()=>({status:200,data:[]}),async()=>{}))['auth-read'],'INVALID_RESPONSE');
  assert.equal((await diagnose(async()=>{throw new Error('PRIVATE_MARKER');}))['auth-read'],'UNAVAILABLE');
  console.log('Synthetic read-only, no-secret and stability assertions: PASS');
}
await selftest();
