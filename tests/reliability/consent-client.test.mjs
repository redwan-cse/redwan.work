import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePublicConsentPolicy} from '../../lib/contact/consent-client.ts';
import {consentBundle} from './consent-fixture.mjs';

test('public consent bundle preserves exact displayed bytes and copies only public fields',()=>{
 const value={...consentBundle,policyText:'SYNTHETIC ONLY\nবাংলা <script>not markup</script>',secret:'not copied'};
 const result=parsePublicConsentPolicy(value);
 assert.equal(result.policyText,value.policyText);assert.equal(result.secret,undefined);assert.equal(Object.isFrozen(result),true);
});
test('malformed incomplete nontext and oversized policy responses cannot enable consent',()=>{
 for(const value of [null,[],true,{}, {...consentBundle,version:'../policy'}, {...consentBundle,version:'x'.repeat(65)}]){
  assert.equal(parsePublicConsentPolicy(value),null);
 }
 for(const key of ['checkbox','privacyNotice','attachmentNotice','policyText']){
  for(const value of [null,{},1,'','x'.repeat(131073),String.fromCharCode(13),String.fromCharCode(0),String.fromCharCode(0xd800)]){
   assert.equal(parsePublicConsentPolicy({...consentBundle,[key]:value}),null);
  }
 }
 assert.equal(parsePublicConsentPolicy({...consentBundle,policyText:'x'.repeat(131072),privacyNotice:'x'.repeat(131072)}),null);
});
test('hyphens remain valid while every forbidden control byte is rejected',()=>{
 assert.ok(parsePublicConsentPolicy({...consentBundle,policyText:'SYNTHETIC: policy-version and re-consent'}));
 for(const code of [...Array.from({length:32},(_,i)=>i).filter(i=>i!==10),127]){
  for(const key of ['checkbox','privacyNotice','attachmentNotice','policyText']){
   assert.equal(parsePublicConsentPolicy({...consentBundle,[key]:'SYNTHETIC'+String.fromCharCode(code)+'text'}),null);
  }
 }
});
