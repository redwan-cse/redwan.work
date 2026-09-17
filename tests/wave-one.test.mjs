import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
// Actual modules, synthetic service boundaries. No framework/browser/SQL claim.
globalThis.fetch=()=>{throw new Error('Network forbidden in contract tests');};
globalThis.__waveAuth={auth:{signInWithPassword:async()=>({error:null}),getClaims:async()=>({data:{claims:{app_metadata:{role:'client'}}}})}};
const inline=source=>({url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true});
registerHooks({resolve(s,c,n){
 if(s==='next/navigation')return inline('export function redirect(destination){throw Object.assign(new Error("Synthetic redirect"),{destination});}');
 if(s==='next/headers')return inline('export async function headers(){throw new Error("Unexpected headers read");}');
 if(s==='@/lib/supabase/server')return inline('export async function createSupabaseServerClient(){return globalThis.__waveAuth;}');
 if(s==='@/lib/supabase/admin')return inline('export function getSupabaseAdmin(){throw new Error("Unexpected service call");}');
 if(s==='@/lib/r2')return inline('export const CONTACT_MAX_FILES=5,CONTACT_MAX_SIZE_BYTES=10485760;export function isValidContactKey(){return false;}');
 if(s==='server-only')return inline('export {};');
 if(s.startsWith('@/lib/'))return {url:new URL('../'+s.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
 return n(s,c);
}});
const {parseLeadPayload}=await import('../lib/contact/lead-schema.ts');
const {signInWithPasswordAction}=await import('../lib/auth/actions.ts');
const meta={ipHash:null,userAgent:null};
function form(entries=[]){const f=new FormData();for(const [k,v] of [['name','Synthetic'],['email','fixture@example.test'],['projectSummary','Synthetic contract verification only.'],['gdprConsent','true'],...entries])f.append(k,v);return f;}
async function destination(next){const f=new FormData();f.set('email','fixture@example.test');f.set('password','synthetic-unused');if(next!==null)f.set('next',next);try{await signInWithPasswordAction({},f);}catch(e){if(typeof e.destination==='string')return e.destination;throw e;}throw new Error('No redirect');}
for(const [i,path] of ['/portal/projects/12345678-1234-1234-1234-123456789abc','/portal?filter=open-items&tab=1','/portal/../portal?filter=active'].entries())test('A01 actual action preserves canonical local destination '+i,async()=>{const result=await destination(path);assert.equal(result,new URL(path,'https://local.invalid').pathname+new URL(path,'https://local.invalid').search);});
const hostile=['//outside.invalid','/'+String.fromCharCode(9)+'/outside.invalid','/'+String.fromCharCode(10)+'/outside.invalid','/'+String.fromCharCode(92)+'outside.invalid','/portal'+String.fromCharCode(0),'/portal'+String.fromCharCode(31),'/portal'+String.fromCharCode(127),'https://outside.invalid','/portal/..//outside.invalid','/%2foutside.invalid','/portal%09','/%zz'];
for(const [i,path] of hostile.entries())test('A01 actual action rejects hostile destination '+i,async()=>{assert.equal(await destination(path),'/portal');});
for(const code of [...Array.from({length:32},(_,i)=>i),127])test('A01 rejects raw and encoded control code '+code,async()=>{const character=String.fromCharCode(code);assert.equal(await destination('/portal'+character+'suffix'),'/portal');assert.equal(await destination('/portal'+encodeURIComponent(character)+'suffix'),'/portal');});
test('A01 absent destination retains role fallback',async()=>{assert.equal(await destination(null),'/portal');});
for(const [i,entries,expected] of [[0,[],false],[1,[['ndaConfidentiality','']],false],[2,[['ndaConfidentiality','false']],false],[3,[['ndaConfidentiality','true']],true],[4,[['ndaConfidentiality','Yes - NDA or strict confidentiality required']],true]])test('I01 accepted NDA vocabulary '+i,()=>{const r=parseLeadPayload(form(entries),meta);assert.equal(r.ok,true);assert.equal(r.lead.nda_required,expected);});
for(const [i,values] of [['unknown'],['yes'],['TRUE'],['true','true'],['',''],[new Blob(['synthetic'])]].entries())test('I01 unknown or duplicate NDA rejected '+i,()=>{assert.equal(parseLeadPayload(form(values.map(v=>['ndaConfidentiality',v])),meta).ok,false);});
for(const [i,min,max,expected] of [[0,'','',[null,null]],[1,'0','0',[0,0]],[2,'1','10000000',[1,10000000]],[3,'10000000','10000000',[10000000,10000000]],[4,' 10 ','20',[10,20]]])test('I02 valid optional whole-dollar range '+i,()=>{const r=parseLeadPayload(form([['budgetMin',min],['budgetMax',max]]),meta);assert.equal(r.ok,true);assert.deepEqual([r.lead.budget_min,r.lead.budget_max],expected);});
for(const [i,min,max] of [[0,'1.5','2'],[1,'1e3','2000'],[2,'100USD','200'],[3,'-1','0'],[4,'+1','2'],[5,'2','1'],[6,'','1'],[7,'1',''],[8,'0','10000001'],[9,'0','999999999999999999999999'],[10,'0x10','20'],[11,'NaN','20'],[12,'1,000','2000']])test('I02 invalid range rejects without coercion '+i,()=>{assert.equal(parseLeadPayload(form([['budgetMin',min],['budgetMax',max]]),meta).ok,false);});
test('I02 duplicate and file-valued budget fields rejected',()=>{for(const entries of [[['budgetMin','1'],['budgetMin','1'],['budgetMax','2']],[['budgetMin',new Blob(['1'])],['budgetMax','2']]])assert.equal(parseLeadPayload(form(entries),meta).ok,false);});
test('Consent denial stays enforced',()=>{for(const value of ['false','']){const f=form();f.set('gdprConsent',value);assert.equal(parseLeadPayload(f,meta).ok,false);}});
