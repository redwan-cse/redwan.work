import {test} from 'node:test';
import assert from 'node:assert/strict';
import {correct, replacement, LINK, validPatch} from './auth-origin-fix.mjs';

const original={site_url:'https://old.example.test',mailer_templates_recovery_content:'<h2>Reset</h2><a href="{{ .ConfirmationURL }}">Reset</a>',smtp_pass:'PRIVATE_MARKER',uri_allow_list:'UNCHANGED'};
function fixture(mode='success') {
  let state=structuredClone(original),gets=0,after=0,desired;
  const writes=[];const waits=[];
  return {
    writes,waits,get:()=>state,
    wait:async attempt=>{waits.push(attempt);},
    io:async(method,payload)=>{
      if(method==='GET') {
        gets++;
        if(mode==='baseline-error')throw Error('PRIVATE_MARKER');
        if(mode==='baseline-denied')return {status:403,data:{message:'PRIVATE_MARKER'}};
        if(mode==='malformed')return {status:200,data:[]};
        if(mode==='concurrent'&&gets===2)state.uri_allow_list='EXTERNAL';
        if(writes.length) {
          after++;
          if(mode==='delayed'&&after===3)Object.assign(state,desired);
          if(mode==='read-error'&&after===1)throw Error('PRIVATE_MARKER');
          if(mode==='third-party')state.site_url='https://external.example.test';
          if(mode==='rollback-conflict'&&after===4)state.site_url='https://external.example.test';
          if(mode==='read-denied')return {status:403,data:{private:'PRIVATE_MARKER'}};
          if(mode==='malformed-after')return {status:200,data:[]};
          if(mode==='rollback-read-error'&&writes.length===2)throw Error('PRIVATE_MARKER');
          if(mode==='rollback-delayed'&&writes.length===2&&after===7)state=structuredClone(original);
        }
        return {status:200,data:structuredClone(state)};
      }
      assert.equal(method,'PATCH');
      assert.ok(validPatch(payload));writes.push(structuredClone(payload));
      if(writes.length===1) {
        desired=payload;
        if(mode==='denied')return {status:403,data:{message:'PRIVATE_MARKER'}};
        if(mode==='server-error')return {status:503};
        if(mode==='transport')throw Error('PRIVATE_MARKER');
        if(mode==='unobserved'||mode==='delayed')return {status:200};
        if(['partial','rollback-denied','rollback-conflict','rollback-read-error','rollback-delayed','rollback-lost'].includes(mode))state.site_url=payload.site_url;
        else Object.assign(state,payload);
        if(mode==='unrelated')state.smtp_pass='EXTERNAL_PRIVATE_MARKER';
        if(mode==='transport-applied')throw Error('PRIVATE_MARKER');
      }else {
        if(mode==='rollback-denied')return {status:403};
        if(mode==='rollback-delayed')return {status:200};
        Object.assign(state,payload);
        if(mode==='rollback-lost')throw Error('PRIVATE_MARKER');
      }
      return {status:200,data:{private:'PRIVATE_MARKER'}};
    }
  };
}
async function run(mode,save) {const f=fixture(mode);return {f,r:await correct(f.io,save, f.wait)};}

test('denial is not labeled rollback',async()=>{
  const {r,f}=await run('denied');
  assert.equal(r.outcome,'UPDATE_REJECTED');
  assert.equal(r.update_http,403);assert.equal(r.rollback_attempted,false);
  assert.equal(f.writes.length,1);
});
test('verified success and idempotence preserve presentation/unrelated values',async()=>{
  const {r,f}=await run('success');
  assert.equal(r.outcome,'VERIFIED');assert.equal(r.targets,'DESIRED');assert.equal(r.unrelated,'UNCHANGED');
  assert.equal(f.get().smtp_pass,original.smtp_pass);
  assert.equal(f.get().mailer_templates_recovery_content,original.mailer_templates_recovery_content.replace('{{ .ConfirmationURL }}',LINK));
  const next=await correct(f.io);assert.equal(next.outcome,'ALREADY_CORRECT');assert.equal(f.writes.length,1);
});
test('delayed desired readback uses three reads and no write retry',async()=>{
  const {r,f}=await run('delayed');
  assert.equal(r.outcome,'VERIFIED');assert.equal(r.verify_reads,3);
  assert.deepEqual(f.waits,[2,3]);assert.equal(f.writes.length,1);
});
test('unchanged reads exhaust bounded observation without claiming rollback',async()=>{
  const {r,f}=await run('unobserved');
  assert.equal(r.outcome,'NOT_OBSERVED');assert.equal(r.cause,'TARGET_NOT_OBSERVED');
  assert.equal(r.verify_reads,3);assert.equal(r.rollback_attempted,false);assert.equal(f.writes.length,1);
});
test('server and transport uncertainty stay distinct and never retry writes',async()=>{
  for(const mode of ['server-error','transport','transport-applied']) {
    const {r,f}=await run(mode);
    assert.equal(r.outcome,'UPDATE_UNCERTAIN');
    assert.equal(r.update_http,mode==='server-error'?503:null);
    assert.equal(r.cause,mode==='server-error'?'HTTP_UNCERTAIN':'TRANSPORT_ERROR');
    assert.equal(r.rollback_attempted,false);assert.equal(f.writes.length,1);
  }
});
test('transient read error remains recorded after eventual verification',async()=>{
  const {r}=await run('read-error');assert.equal(r.outcome,'VERIFIED');
  assert.equal(r.read_errors,1);assert.equal(r.first_read_error,'TRANSPORT_ERROR');assert.equal(r.verify_reads,2);
});
test('persistent denied or malformed readback never looks verified',async()=>{
  for(const mode of ['read-denied','malformed-after']) {
    const {r,f}=await run(mode);
    assert.equal(r.outcome,'UPDATE_UNCERTAIN');assert.equal(r.verify_reads,3);
    assert.equal(r.first_read_error,mode==='read-denied'?'READ_HTTP':'INVALID_READBACK');
    assert.equal(r.read_http,mode==='read-denied'?403:200);assert.equal(f.writes.length,1);
  }
});
test('partial targets trigger guarded actual rollback with separate verification',async()=>{
  const {r,f}=await run('partial');
  assert.equal(r.outcome,'ROLLBACK_VERIFIED');assert.equal(r.cause,'TARGET_MISMATCH');
  assert.equal(r.rollback_attempted,true);assert.equal(r.rollback_verified,true);
  assert.equal(r.rollback_http,200);assert.equal(r.rollback_reads,1);assert.equal(f.writes.length,2);
  assert.deepEqual(f.get(),original);
});
test('unrelated drift recorded and never overwritten by recovery',async()=>{
  const {r,f}=await run('unrelated');
  assert.equal(r.outcome,'ROLLBACK_VERIFIED');assert.equal(r.cause,'UNRELATED_DRIFT');
  assert.equal(r.unrelated,'CHANGED');assert.equal(f.get().smtp_pass,'EXTERNAL_PRIVATE_MARKER');
});
test('third-party changes block both corrective and rollback retries',async()=>{
  for(const mode of ['third-party','rollback-conflict']) {
    const {r,f}=await run(mode);
    assert.equal(r.outcome,'CONFLICT');assert.equal(r.rollback_attempted,false);assert.equal(f.writes.length,1);
  }
});
test('rollback denial or unreadable restoration is not verified',async()=>{
  for(const mode of ['rollback-denied','rollback-read-error']) {
    const {r,f}=await run(mode);
    assert.equal(r.outcome,'ROLLBACK_UNVERIFIED');assert.equal(r.rollback_attempted,true);assert.equal(r.rollback_verified,false);
    assert.equal(r.rollback_reads,3);assert.equal(f.writes.length,2);
  }
});
test('pre-update failures have safe stages and zero writes',async()=>{
  for(const mode of ['baseline-error','baseline-denied','malformed','concurrent']) {
    const {r,f}=await run(mode);assert.equal(r.outcome,'REFUSED');assert.equal(f.writes.length,0);
    assert.equal(r.stage,mode==='concurrent'?'RECHECK':'BASELINE');
  }
  const {r,f}=await run('success',()=>{throw Error('PRIVATE_MARKER');});
  assert.equal(r.outcome,'REFUSED');assert.equal(r.stage,'SNAPSHOT');assert.equal(f.writes.length,0);
});
test('ambiguous template refuses, exact replacement stays idempotent',()=>{
  const fixed=replacement(original.mailer_templates_recovery_content);
  assert.equal(replacement(fixed),fixed);
  assert.throws(()=>replacement('{{ .ConfirmationURL }}'));
  assert.throws(()=>replacement(original.mailer_templates_recovery_content.repeat(2)));
});
test('reports have exact safe schema, never raw values, URLs or messages',async()=>{
  const keys=['outcome','stage','cause','update_http','read_http','rollback_http','targets','unrelated','verify_reads','rollback_reads','read_errors','first_read_error','rollback_attempted','rollback_verified'].sort();
  for(const mode of ['success','denied','transport','partial','unrelated','third-party','malformed-after','rollback-read-error']) {
    const {r}=await run(mode);assert.deepEqual(Object.keys(r).sort(),keys);
    const text=JSON.stringify(r);
    assert.doesNotMatch(text,/PRIVATE_MARKER|example\.test|https?:|smtp_pass|ConfirmationURL/);
    for(const value of Object.values(r))assert.ok(value===null||['string','number','boolean'].includes(typeof value));
  }
});
test('rollback acknowledgement loss never becomes verified from original values alone',async()=>{
  const {r,f}=await run('rollback-lost');
  assert.equal(r.outcome,'ROLLBACK_UNVERIFIED');assert.equal(r.rollback_http,null);
  assert.equal(r.rollback_attempted,true);assert.equal(r.rollback_verified,false);
  assert.deepEqual(f.get(),original);assert.equal(f.writes.length,2);
});
test('delayed rollback visibility is bounded and separately counted',async()=>{
  const {r,f}=await run('rollback-delayed');
  assert.equal(r.outcome,'ROLLBACK_VERIFIED');assert.equal(r.rollback_reads,3);
  assert.equal(r.verify_reads,3);assert.equal(f.writes.length,2);
});
