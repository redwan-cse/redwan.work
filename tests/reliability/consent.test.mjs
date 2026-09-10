import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const hooks=registerHooks({resolve(s,c,n){if(s==='@/lib/contact/intake-contract')return {url:new URL('../../lib/contact/intake-contract.ts',import.meta.url).href,shortCircuit:true};if(s==='@/lib/r2')return {url:'data:text/javascript,'+encodeURIComponent('export const CONTACT_MAX_FILES=5,CONTACT_MAX_SIZE_BYTES=10485760;export function isValidContactKey(){return true;}'),shortCircuit:true};return n(s,c);}});
const {parseLeadPayload}=await import('../../lib/contact/lead-schema.ts');hooks.deregister();
function form(consent){const f=new FormData();f.set('name','Synthetic User');f.set('email','synthetic@example.test');f.set('projectSummary','Synthetic project request');if(consent!==undefined)f.set('gdprConsent',consent);return f;}
const meta={ipHash:'synthetic-hash',userAgent:null};
test('explicit consent is required before a consent timestamp exists',()=>{for(const value of [undefined,'','false','1','on','TRUE'])assert.equal(parseLeadPayload(form(value),meta).ok,false);const result=parseLeadPayload(form('true'),meta);assert.equal(result.ok,true);assert.ok(Number.isFinite(Date.parse(result.lead.consent_at)));});
test('duplicate consent fields are rejected',()=>{const f=form('true');f.append('gdprConsent','false');assert.equal(parseLeadPayload(f,meta).ok,false);});
test('the existing browser form serializes its actual checkbox state',()=>{const source=readFileSync(new URL('../../components/enhanced-contact-form.tsx',import.meta.url),'utf8');assert.ok(source.includes("formFields.append('gdprConsent', formData.gdprConsent ? 'true' : 'false')"));});
