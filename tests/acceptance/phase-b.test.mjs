import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePlan, verifyOwnedRun, provision, runTests, dispose, assertTestCommand } from './phase-b.mjs';
import { validateSession, safeDestination, FixtureTracker, runWithCleanup, setVerifiedEnvironmentDescriptor, provisionDisposableEnvironment } from './harness-env.mjs';

const roles = ['database','gateway','auth','rest','storage','app','runner'];
const runId = 'test-run-11111111-1111-4111-8111-111111111111';
const cfg = {
  DISPOSABLE_AUTH_CI:'true',NEXT_PUBLIC_SUPABASE_URL:'http://gateway:8000',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',
  APP_URL:'http://app:3399',R2_ENDPOINT:'http://storage:9000',
  R2_PRIVATE_BUCKET:'synthetic-private',R2_PUBLIC_BUCKET:'synthetic-public',
  R2_PRIVATE_ACCESS_KEY_ID:'testonly1',R2_PRIVATE_SECRET_ACCESS_KEY:'testonly2',
  R2_PUBLIC_ACCESS_KEY_ID:'testonly3',R2_PUBLIC_SECRET_ACCESS_KEY:'testonly4',
  LEAD_IP_HASH_SALT:'testonly-salt'
};
const state = () => ({
  version:1,runId,candidate:'a'.repeat(40),networkId:'net-owned',acceptance:{...cfg},
  services:roles.map(role=>({role,id:`owned-${role}`,imageId:`sha256:${role}`}))
});
const session = () => ({version:1,runId,candidate:'a'.repeat(40),env:{...cfg},runnerId:'owned-runner',networkId:'net-owned'});
const plan = () => ({
  version:1,candidate:'a'.repeat(40),acceptance:{...cfg},
  services:roles.map(role=>({role,image:`example/${role}@sha256:${'a'.repeat(64)}`,command:['sleep','infinity'],
    env:role==='app'?{...cfg,NEXT_PUBLIC_SITE_URL:cfg.APP_URL}:{},tmpfs:[],memoryMB:256}))
});
function inspector(s=state(), mutate=()=>{}) {
  const net={Id:s.networkId,Internal:true,Driver:'bridge',Labels:{'work.redwan.phase-b':s.runId},
    Containers:Object.fromEntries(s.services.map(x=>[x.id,{}]))};
  const containers=Object.fromEntries(s.services.map(x=>[x.id,{
    Id:x.id,Image:x.imageId,State:{Running:true},Config:{Labels:{'work.redwan.phase-b':s.runId,'work.redwan.phase-b.role':x.role}},
    HostConfig:{Privileged:false,PortBindings:{},Binds:[],Devices:[],CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],Dns:['127.0.0.1']},Mounts:[],
    NetworkSettings:{Networks:{owned:{NetworkID:s.networkId,Aliases:[x.role]}}}
  }]));
  mutate(net,containers);
  return (...a) => {
    if(a[0]==='network' && a[1]==='inspect') return JSON.stringify([net]);
    if(a[0]==='container' && a[1]==='inspect') return JSON.stringify([containers[a[2]]]);
    throw Error('Unexpected Docker operation in read-only check');
  };
}
test('plan accepts internal digest-pinned prepared images',()=>assert.equal(validatePlan(plan()).version,1));
test('plan rejects mutable image tags',()=>{const p=plan();p.services[0].image='example/db:latest';assert.throws(()=>validatePlan(p));});
test('plan rejects host mounts and published ports',()=>{for(const key of ['mounts','volumes','ports','privileged']){const p=plan();p.services[0][key]=[];assert.throws(()=>validatePlan(p));}});
test('plan rejects production application destinations',()=>{const p=plan();p.acceptance.APP_URL='https://redwan.work';assert.throws(()=>validatePlan(p));});
test('plan checks application and test config agreement',()=>{const p=plan();p.services.find(s=>s.role==='app').env.SUPABASE_SECRET_KEY='different';assert.throws(()=>validatePlan(p));});
test('owned topology passes using read-only Docker inspection',()=>assert.equal(verifyOwnedRun(state(),inspector()),true));
test('extra network member fails',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),n=>{n.Containers.stranger={};}))));
test('extra runner network fails',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),(n,c)=>{c['owned-runner'].NetworkSettings.Networks.external={NetworkID:'outside'};}))));
test('persistent database mount fails',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),(n,c)=>{c['owned-database'].Mounts=[{Type:'volume'}];}))));
test('replaced container image fails',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),(n,c)=>{c['owned-app'].Image='wrong';}))));
test('host-running app cannot satisfy owned service topology',()=>{const s=state();s.services=s.services.filter(x=>x.role!=='app');assert.throws(()=>verifyOwnedRun(s,inspector()));});
test('network must be internal',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),n=>{n.Internal=false;}))));
test('re-enabled capabilities are rejected',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),(n,c)=>{c['owned-runner'].HostConfig.CapAdd=['NET_ADMIN'];}))));
test('external DNS configuration is rejected',()=>assert.throws(()=>verifyOwnedRun(state(),inspector(state(),(n,c)=>{c['owned-app'].HostConfig.Dns=['8.8.8.8'];}))));
test('removing a required role from both ledger and network fails',()=>{const s=state();s.services=s.services.filter(x=>x.role!=='database');assert.throws(()=>verifyOwnedRun(s,inspector(s)));});
test('session does not silently authorize missing opt-in',()=>{const s=session();delete s.env.DISPOSABLE_AUTH_CI;assert.throws(()=>validateSession(s,{}));});
test('session rejects changed endpoint environment',()=>assert.throws(()=>validateSession(session(),{...cfg,DISPOSABLE_RUN_ID:runId,APP_URL:'http://other:3399'})));
test('session accepts matching explicit configuration',()=>assert.equal(validateSession(session(),{...cfg,DISPOSABLE_RUN_ID:runId}).runId,runId));
test('no public descriptor setter can authorize mutations',()=>assert.throws(()=>setVerifiedEnvironmentDescriptor(session())));
test('no self-provisioning marker path exists',()=>assert.throws(()=>provisionDisposableEnvironment()));
test('request destination must match exact approved origin',()=>{assert.equal(safeDestination('/api/recovery',session()).hostname,'app');assert.throws(()=>safeDestination('http://app.evil.invalid:3399/',session()));});
test('credentials and external signed URLs rejected',()=>{assert.throws(()=>safeDestination('http://u:p@app:3399/',session()));assert.throws(()=>safeDestination('https://example.invalid/?token=x',session()));});
test('test command cannot run arbitrary host paths',()=>{assertTestCommand(['node','--test','tests/acceptance/section5-session-authorization.mjs']);assert.throws(()=>assertTestCommand(['sh','-c','anything']));assert.throws(()=>assertTestCommand(['node','--test','../../bad.mjs']));});
test('inventory-only cleanup never invokes service deletion',async()=>{const tracker=new FixtureTracker(new Proxy({},{get(){throw Error('DB access');}}),new Proxy({},{get(){throw Error('S3 access');}}));tracker.trackFile('file');tracker.trackKey('key');await tracker.cleanup();assert.equal(tracker.getManifest().retained.files[0],'file');assert.equal(tracker.getManifest().deleted.length,0);});
test('both primary and cleanup failures survive',async()=>{await assert.rejects(runWithCleanup({cleanup:async()=>{throw Error('cleanup');}},async()=>{throw Error('primary');}),e=>e instanceof AggregateError && e.errors.length===2);});
test('disposal requires exact confirmation before mutations',()=>{let calls=0;assert.throws(()=>dispose(state(),'wrong',()=>{calls++;}));assert.equal(calls,0);});
test('failed Docker ownership check never launches tests',()=>{let spawned=false;assert.throws(()=>runTests(state(),['node','--test','tests/acceptance/a.mjs'],()=>{throw Error('mismatch');},()=>{spawned=true;}));assert.equal(spawned,false);});
test('provisioning refuses existing state file before Docker calls',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase-b-unit-'));const target=path.join(dir,'state.json');fs.writeFileSync(target,'{}');let calls=0;try{assert.throws(()=>provision(plan(),target,()=>{calls++;}));assert.equal(calls,0);}finally{fs.rmSync(dir,{recursive:true});}});
test('new provisioning records only newly created Docker IDs and never uses volumes or binds',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase-b-unit-')),target=path.join(dir,'state.json');
 const created=[];let rid;
 const fake=(...a)=>{
  if(a[0]==='context')return JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]);
  if(a[0]==='image')return JSON.stringify([{Id:'sha256:pinned',Config:{Labels:{'org.opencontainers.image.revision':'a'.repeat(40)}}}]);
  if(a[0]==='network'&&a[1]==='create'){rid=a.at(-1);return 'new-net';}
  if(a[0]==='container'&&a[1]==='create'){
   assert.ok(!a.includes('--volume')&&!a.includes('--mount')&&!a.includes('--publish'));
   const role=a[a.indexOf('--network-alias')+1];created.push({role,id:`new-${role}`,imageId:'sha256:pinned'});return `new-${role}`;
  }
  if(a[0]==='container'&&a[1]==='start')return a[2];
  return inspector({runId:rid,networkId:'new-net',services:created})(...a);
 };
 try{const result=provision(plan(),target,fake);assert.equal(result.phase,'provisioned-not-accepted');const saved=JSON.parse(fs.readFileSync(target));assert.equal(saved.services.length,7);assert.equal(saved.networkId,'new-net');}
 finally{fs.rmSync(dir,{recursive:true});}
});
