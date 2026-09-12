import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
const hooks=registerHooks({resolve(s,c,n){if(s==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};return n(s,c);}});
const {archivePolicy,validateConsentSubmission,consentEvidenceView,CONSENT_ACTIVATION_ENABLED}=await import('../../lib/contact/consent-policy.ts');
hooks.deregister();
const bundle={version:'synthetic-enquiry-v1',checkbox:'SYNTHETIC TEST ONLY: I agree.',privacyNotice:'SYNTHETIC TEST ONLY: privacy notice.',attachmentNotice:'SYNTHETIC TEST ONLY: attachment notice.',policyText:'SYNTHETIC TEST ONLY\nNot a published policy. বাংলা'};
const first=archivePolicy(bundle);
const second=archivePolicy({...bundle,version:'synthetic-enquiry-v2',policyText:'SYNTHETIC TEST ONLY: revised.'});
const policies=[first,second];
const when='2026-09-12T00:00:00.000Z';
const clock=()=>new Date(when);
function form(consent='true',version=first.version){const f=new FormData();if(consent!==null)f.append('gdprConsent',consent);if(version!==null)f.append('consentPolicyVersion',version);return f;}
function decide(f,activeVersion=first.version,registry=policies){return validateConsentSubmission(f,{activeVersion,policies:registry},clock);}
const evidence={consent_policy_version:first.version,consent_policy_hash:first.hash,consent_capture_method:'explicit-checkbox-v1',consent_at:when};

test('synthetic active policy captures the displayed version and server time',()=>{
 assert.deepEqual(decide(form()),{ok:true,evidence});
});
test('deployment activation stays disabled with no environment override',()=>{
 assert.equal(CONSENT_ACTIVATION_ENABLED,false);
 assert.deepEqual(decide(form(),null),{ok:false,status:503,code:'disabled'});
});
test('canonical archive uses fixed ordered UTF8 bytes and SHA256',()=>{
 const bytes=JSON.stringify({schema:1,version:bundle.version,checkbox:bundle.checkbox,privacyNotice:bundle.privacyNotice,attachmentNotice:bundle.attachmentNotice,policyText:bundle.policyText});
 assert.equal(first.canonical,bytes);assert.equal(first.hash,createHash('sha256').update(Buffer.from(bytes,'utf8')).digest('hex'));assert.equal(Object.isFrozen(first),true);
 assert.deepEqual(archivePolicy({policyText:bundle.policyText,attachmentNotice:bundle.attachmentNotice,privacyNotice:bundle.privacyNotice,checkbox:bundle.checkbox,version:bundle.version}),first);
});
for(const key of ['checkbox','privacyNotice','attachmentNotice','policyText'])test(`archive hash covers ${key}`,()=>{
 assert.notEqual(archivePolicy({...bundle,[key]:bundle[key]+' revised'}).hash,first.hash);
});
test('invalid encoding and oversized bundles are rejected without truncation',()=>{
 for(const text of ['', '', '\r\n', '\ud800', 'x'.repeat(131073)])assert.throws(()=>archivePolicy({...bundle,policyText:text}),/Invalid policy/);
 assert.throws(()=>archivePolicy({...bundle,version:'../unsafe'}));
});
for(const value of [null,'false','TRUE','1',' true ','yes'])test(`nonliteral consent ${String(value)} is rejected`,()=>{
 assert.deepEqual(decide(form(value)),{ok:false,status:400,code:'invalid'});
});
test('duplicate consent and version fields are refused',()=>{
 for(const key of ['gdprConsent','consentPolicyVersion']){const f=form();f.append(key,key==='gdprConsent'?'true':first.version);assert.deepEqual(decide(f),{ok:false,status:400,code:'invalid'});}
});
test('missing unknown malformed and file-valued versions are refused',()=>{
 for(const version of [null,'unknown-v1','../unsafe',' '+first.version])assert.deepEqual(decide(form('true',version)),{ok:false,status:400,code:'invalid'});
 const f=form('true',null);f.append('consentPolicyVersion',new Blob(['synthetic']),'version.txt');assert.deepEqual(decide(f),{ok:false,status:400,code:'invalid'});
});
test('recognized stale version returns conflict without restamping or mutation',()=>{
 const f=form();f.append('attachments','[{"synthetic":true}]');f.append('projectSummary','Synthetic unsaved draft');const before=[...f.entries()];
 assert.deepEqual(decide(f,second.version),{ok:false,status:409,code:'stale'});assert.deepEqual([...f.entries()],before);
 assert.deepEqual(decide(form('false',second.version),second.version),{ok:false,status:400,code:'invalid'});
 assert.equal(decide(form('true',second.version),second.version).evidence.consent_policy_version,second.version);
});
test('wire timestamp hash and capture method cannot replace server evidence',()=>{
 const f=form();f.append('consent_at','2000-01-01');f.append('consent_policy_hash','fabricated');f.append('consent_capture_method','marketing');
 assert.deepEqual(decide(f),{ok:true,evidence});
});
test('corrupt duplicate and unavailable registries fail closed',()=>{
 for(const registry of [[],[first,first],[{...first,hash:'0'.repeat(64)}],[{...first,canonical:first.canonical+' '}],[{...first,version:'synthetic-other'}]])assert.deepEqual(decide(form(),first.version,registry),{ok:false,status:503,code:'unavailable'});
});
test('invalid server clock is unavailable rather than fabricated evidence',()=>{
 assert.deepEqual(validateConsentSubmission(form(),{activeVersion:first.version,policies},()=>new Date('invalid')),{ok:false,status:503,code:'unavailable'});
});
test('historical missing evidence stays unknown regardless of timestamp',()=>{
 for(const row of [{},{consent_at:when},{consent_policy_version:null,consent_policy_hash:null,consent_capture_method:null,consent_at:when}])assert.equal(consentEvidenceView(row,policies),'unknown');
});
test('recorded evidence is tied to archived version not the currently active one',()=>{
 assert.equal(consentEvidenceView(evidence,policies),'recorded');
 for(const row of [{consent_policy_version:first.version},{...evidence,consent_policy_hash:'0'.repeat(64)},{...evidence,consent_capture_method:'import'},{...evidence,consent_at:'invalid'}])assert.equal(consentEvidenceView(row,policies),'invalid');
 assert.equal(consentEvidenceView(evidence,[]),'invalid');
});
test('existing intake remains unwired and policy text is not published by infrastructure',()=>{
 for(const path of ['lib/contact/lead-schema.ts','app/api/contact/route.ts','components/enhanced-contact-form.tsx','app/privacy/page.tsx']){
  const source=readFileSync(path,'utf8');assert.doesNotMatch(source,/from ['"][^'"]*consent-policy/);assert.doesNotMatch(source,/SYNTHETIC TEST ONLY/);
 }
});
