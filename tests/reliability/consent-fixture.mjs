import {createHash} from 'node:crypto';
export const consentBundle=Object.freeze({
 version:'synthetic-f20-v1',
 checkbox:'SYNTHETIC ONLY: I agree to the displayed Data & Privacy policy.',
 privacyNotice:'SYNTHETIC ONLY: private enquiry test.',
 attachmentNotice:'SYNTHETIC ONLY: private attachment test.',
 policyText:'SYNTHETIC ONLY\nNot a published privacy policy.',
});
export function archiveFixture(bundle=consentBundle){
 const canonical=JSON.stringify({schema:1,version:bundle.version,checkbox:bundle.checkbox,privacyNotice:bundle.privacyNotice,attachmentNotice:bundle.attachmentNotice,policyText:bundle.policyText});
 return {version:bundle.version,canonical,hash:createHash('sha256').update(canonical,'utf8').digest('hex')};
}
export const consentArchive=Object.freeze(archiveFixture());
export const consentSnapshot=Object.freeze({schema:1,activeVersion:consentBundle.version,policies:[consentArchive]});
