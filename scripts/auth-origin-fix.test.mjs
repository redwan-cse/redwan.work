import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replacement,validPatch,targetPath,permitted,correct,LINK} from './auth-origin-fix.mjs';
const original={site_url:'https://old.example.test',mailer_templates_recovery_content:'<h2>Reset</h2><a class="button" href="{{ .ConfirmationURL }}">Reset password</a><p>Keep this text.</p>',smtp_pass:'PRIVATE_MARKER',uri_allow_list:'UNCHANGED',mailer_subjects_recovery:'Keep subject',mailer_templates_invite_content:'Keep invite'};
function fixture(mode='normal') {
  let state=structuredClone(original),reads=0,patches=[];
  const io=async(method,body)=>{
    if(method==='GET') {
      reads++;
      if(mode==='concurrent'&&reads===2)state.uri_allow_list='CHANGED_EXTERNALLY';
      if(mode==='third-party'&&reads>=3)state.site_url='https://third-party.example.test';
      return {status:200,data:structuredClone(state)};
    }
    assert.ok(validPatch(body));patches.push(structuredClone(body));
    if(mode==='partial'&&patches.length===1)state.site_url=body.site_url;
    else Object.assign(state,body);
    if(mode==='unrelated'&&patches.length===1)state.smtp_pass='EXTERNAL_CHANGE';
    return {status:200,data:null};
  };
  return {io,patches,get:()=>state};
}
test('only the recovery href changes, presentation preserved',()=>{
  const fixed=replacement(original.mailer_templates_recovery_content);
  assert.equal(fixed,original.mailer_templates_recovery_content.replace('{{ .ConfirmationURL }}',LINK));
  assert.equal(replacement(fixed),fixed);
  for(const html of ['', '{{ .ConfirmationURL }}', '<a href="{{ .ConfirmationURL }}"></a><a href="{{ .ConfirmationURL }}"></a>'])assert.throws(()=>replacement(html));
});
test('network permits two-field Auth PATCH only and denies other providers/endpoints',()=>{
  const path=targetPath('https://'+'a'.repeat(20)+'.supabase.co');
  const patch={site_url:'https://redwan.work',mailer_templates_recovery_content:LINK};
  assert.equal(permitted('api.supabase.com',path,'PATCH',patch),true);
  assert.equal(permitted('api.supabase.com',path,'PATCH',{...patch,smtp_pass:'BAD'}),false);
  assert.equal(permitted('api.supabase.com',path+'/signing-keys','PATCH',patch),false);
  assert.equal(permitted('redwan.work','/api/cron/email-outbox','GET'),false);
  assert.equal(permitted('api.supabase.com',path,'DELETE'),false);
  for(const url of ['https://evil.test','http://'+'a'.repeat(20)+'.supabase.co','https://'+'a'.repeat(20)+'.supabase.co/x'])assert.throws(()=>targetPath(url));
});
test('one PATCH corrects and readback preserves every unrelated value',async()=>{
  const f=fixture();let saved;
  assert.equal(await correct(f.io,v=>{saved=structuredClone(v);}), 'VERIFIED');
  assert.equal(f.patches.length,1);
  assert.deepEqual(Object.keys(saved).sort(),['mailer_templates_recovery_content','site_url']);
  assert.equal(f.get().smtp_pass,original.smtp_pass);
  assert.equal(f.get().uri_allow_list,original.uri_allow_list);
  assert.equal(f.get().mailer_templates_invite_content,original.mailer_templates_invite_content);
  assert.equal(f.get().site_url,'https://redwan.work');
  assert.equal(await correct(f.io),'ALREADY_CORRECT');
  assert.equal(f.patches.length,1);
});
test('concurrent baseline change and private snapshot failure refuse all PATCHes',async()=>{
  const f=fixture('concurrent');assert.equal(await correct(f.io),'REFUSED');assert.equal(f.patches.length,0);
  const g=fixture();assert.equal(await correct(g.io,()=>{throw new Error('PRIVATE_MARKER');}),'REFUSED');assert.equal(g.patches.length,0);
});
test('partial application rolls back only two approved fields and verifies restoration',async()=>{
  const f=fixture('partial');assert.equal(await correct(f.io),'ROLLED_BACK');
  assert.equal(f.patches.length,2);assert.deepEqual(f.get(),original);
});
test('unrelated drift is detected, not patched or labeled verified',async()=>{
  const f=fixture('unrelated');assert.equal(await correct(f.io),'ROLLED_BACK');
  assert.equal(f.get().smtp_pass,'EXTERNAL_CHANGE');assert.equal(f.get().site_url,original.site_url);
});
test('third-party edit prevents blind rollback',async()=>{
  const f=fixture('third-party');assert.equal(await correct(f.io),'NEEDS_PRIVATE_REVIEW');
  assert.equal(f.patches.length,1);
});
test('provider errors never become output containing private values',async()=>{
  const value=await correct(async()=>{throw new Error('PRIVATE_MARKER');});
  assert.equal(value,'REFUSED');assert.equal(value.includes('PRIVATE_MARKER'),false);
});
