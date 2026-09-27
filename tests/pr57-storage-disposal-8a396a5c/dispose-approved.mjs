// One-shot operator wrapper. Removal is delegated to the unchanged repository disposer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const RUN='test-run-8a396a5c-b211-4f11-aef1-b893afb7d00d';
export const CANDIDATE='25ac040a4d099cad6342aec44863d21aad00f947';
export const DAEMON='0c15eeda-6839-43e6-a8ee-585570f98427';
export const NETWORK='7ebe86d404add08dbd02a60cea31cc8099fcf240d55ec69ba3c8ac6a1e922eda';
export const IDS={
 database:'7ce759b9f86990cec6bedb683ecfb8c332d12ca6fab046136373e1e2a57592d8',
 runner:'217bbbd451e949805642a9a3385cf430edf77759a8a6fa69b5201b740381693d',
 auth:'59e490101ae72f73d6aaf8c25e7eed8281b6f860af2f7b17fb8363aca53d06fd',
 rest:'2c1de974b2a51c8c614bc928980486c3296b529366862b361de4cd9386a38c1c',
 storage:'4de1989a98066f9898dcc95221c40dca8e6741d205ff122f5fc95e25b1704b70',
 gateway:'6d0022061698c51287cf8858482fb88df6c69501e15095b68e3c43c26a6b6bbb',
 app:'dddf690a003d6299a6697e3b2ba12cb779db599ac63048b08d070d9599841a86'
};
const LABEL='work.redwan.phase-b';
const APPROVAL='approve_pr57_storage_failed_run_disposal:80180078016862';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=x=>[...new Set(x)].sort();
export function bytes(file){
 const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o600);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try {const a=fs.fstatSync(fd),b=fs.readFileSync(fd),z=fs.fstatSync(fd);
  assert.equal(a.ino,z.ino);assert.equal(a.size,b.length);assert.equal(a.size,z.size);
  assert.equal(a.mtimeMs,z.mtimeMs);assert.equal(a.ctimeMs,z.ctimeMs);return b;
 }finally{fs.closeSync(fd);}
}
function dir(p){const s=fs.lstatSync(p);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o700);}
export function snapshotFiles(roots){
 const files=[],dirs=[];
 const walk=p=>{dir(p);dirs.push(p);for(const n of fs.readdirSync(p).sort()){
  const f=path.join(p,n),s=fs.lstatSync(f);
  if(s.isDirectory()&&!s.isSymbolicLink())walk(f);
  else {const b=bytes(f);files.push({path:f,bytes:b.length,sha256:sha(b)});}
 }};
 roots.forEach(walk);return {files,dirs};
}
export function checkState(s){
 assert.equal(s.version,1);assert.equal(s.candidate,CANDIDATE);assert.equal(s.runId,RUN);
 assert.equal(s.networkId,NETWORK);assert.equal(s.services.length,7);
 assert.deepEqual(Object.fromEntries(s.services.map(v=>[v.role,v.id])),IDS);
 for(const v of s.services)assert.match(v.imageId,/^sha256:[a-f0-9]{64}$/);
 for(const role of ['runner','gateway'])assert.equal(s.services.find(v=>v.role===role).imageId,'sha256:9304c54c537335cd796ae845feda88473e80dae26700269702239b4e6fed25b1');
 assert.equal(s.services.find(v=>v.role==='app').imageId,'sha256:4d4661ff2b03a1f7a11f0c4b37b62415f4766ab86166080e19244fcd9a4e76f7');
}
export function checkInventory(s,n,containers){
 checkState(s);assert.equal(n.Id,NETWORK);assert.equal(n.Name,RUN);
 assert.equal(n.Driver,'bridge');assert.equal(n.Internal,true);assert.equal(n.Labels?.[LABEL],RUN);
 const members=Object.keys(n.Containers||{});assert.ok(members.every(id=>Object.values(IDS).includes(id)));
 for(const v of s.services){
  const c=containers[v.role];assert.equal(c.Id,v.id);assert.equal(c.Name,`/${RUN}-${v.role}`);
  assert.equal(c.Config.Labels?.[LABEL],RUN);assert.equal(c.Config.Labels?.[LABEL+'.role'],v.role);
  assert.equal(c.Image,v.imageId);assert.ok(['created','running','paused','exited'].includes(c.State.Status));
  const nets=Object.values(c.NetworkSettings.Networks||{});assert.equal(nets.length,1);assert.equal(nets[0].NetworkID,NETWORK);
  if(c.State.Running)assert.ok(members.includes(c.Id));
  assert.ok((c.Mounts||[]).every(m=>m.Type==='tmpfs'));
 }
}
export function checkPreserved(before,after){
 assert.ok(Object.values(IDS).every(id=>!after.containers.includes(id)));assert.ok(!after.networks.includes(NETWORK));
 for(const k of ['containers','networks','images','volumes']){
  const removed=k==='containers'?Object.values(IDS):k==='networks'?[NETWORK]:[];
  assert.ok(before[k].filter(id=>!removed.includes(id)).every(id=>after[k].includes(id)));
 }
}
export function checkPreflight(e,r,b){
 assert.equal(b.length,700);assert.equal(sha(b),'6c1471c291f23f050afc7ba4119b662996c8e289fe77bcd28d2e86cd9c3f2273');
 for(const v of [e,r]){assert.equal(v.candidate,CANDIDATE);assert.equal(v.runId,RUN);}
 assert.equal(e.phase,'complete');assert.equal(e.state,'environment-ready');
 assert.deepEqual(e.browser,{anonymousOrigin:true,authenticatedCatalog:true,mobileOverflow:false,keyboardEntry:true});
 assert.equal(r.accepted,true);assert.equal(r.exit,0);assert.equal(r.suite,'environment-preflight');
 assert.equal(r.evidence.preserved,true);assert.equal(r.evidence.identityValid,true);assert.equal(r.evidence.sha256,sha(b));
 assert.deepEqual(r.counts,{tests:1,pass:1,fail:0,cancelled:0,skipped:0,todo:0});
}
export function run({checkout='/home/redwan/pr57-checkout-25ac040',privateDir='/home/redwan/pr57-private-25ac040',
 control='/home/redwan/pr57-operator-25ac040',out='/home/redwan/pr57-disposal-8a396a5c',
 execute=execFileSync,spawn=spawnSync,env=process.env}={}){
 let checkpoint='one-shot-marker';
 const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 try{
  dir(out);write('attempt.json',{approval:APPROVAL,runId:RUN,candidate:CANDIDATE});
  const cmd=(bin,args)=>execute(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:32*1024*1024}).trim();
  const docker=(...a)=>cmd('docker',a);
  const read=f=>JSON.parse(bytes(f).toString());
  const host=()=>{
   assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.1');assert.ok(!env.DOCKER_HOST&&!env.DOCKER_CONTEXT);
   assert.match(JSON.parse(docker('context','inspect'))[0].Endpoints.docker.Host,/^unix:\/\//);
   assert.equal(docker('info','--format','{{.ID}}'),DAEMON);
  };
  const list=(kind,filter)=>sorted(docker(kind,'ls',...(kind==='container'?['--all']:[]),
   ...(kind==='volume'?[]:['--no-trunc']),...(filter?['--filter',`label=${LABEL}=${RUN}`]:[]),
   '--format',kind==='volume'?'{{.Name}}':'{{.ID}}').split(/\r?\n/).filter(Boolean));
  const resources=()=>({containers:list('container'),networks:list('network'),images:list('image'),volumes:list('volume')});
  const source=()=>{
   assert.equal(cmd('git',['-C',checkout,'rev-parse','HEAD']),CANDIDATE);
   assert.equal(cmd('git',['-C',checkout,'status','--porcelain']),'');
   assert.equal(cmd('git',['-C',checkout,'hash-object','tests/acceptance/phase-b.mjs']),'84bdab4de3a22309d66ca62ee0909849a79bda4d');
  };
  checkpoint='host-source-and-private-evidence';host();source();dir(privateDir);dir(control);
  const statePath=path.join(privateDir,'state.json'),state=read(statePath);checkState(state);
  const ev=path.join(control,'runtime-25ac040');
  const b=bytes(path.join(ev,'environment-preflight.evidence.json'));
  checkPreflight(JSON.parse(b.toString()),read(path.join(ev,'environment-preflight.result.json')),b);
  assert.equal(bytes(path.join(ev,'environment-preflight.exit')).toString().trim(),'0');
  assert.ok(bytes(path.join(ev,'environment-preflight.log')).length>0);
  const failed=read(path.join(ev,'real-backup-restore.result.json'));
  assert.equal(failed.candidate,CANDIDATE);assert.equal(failed.runId,RUN);assert.equal(failed.accepted,false);
  assert.equal(failed.suite,'real-backup-restore');assert.equal(failed.exit,1);
  assert.equal(bytes(path.join(ev,'real-backup-restore.exit')).toString().trim(),'1');
  assert.ok(bytes(path.join(ev,'real-backup-restore.log')).length>0);
  const inventory=()=>{
   assert.deepEqual(list('container',true),sorted(Object.values(IDS)));assert.deepEqual(list('network',true),[NETWORK]);
   const inspect=(kind,id)=>JSON.parse(docker(kind,'inspect',id))[0];
   checkInventory(state,inspect('network',NETWORK),Object.fromEntries(Object.entries(IDS).map(([r,id])=>[r,inspect('container',id)])));
  };
  checkpoint='exact-owned-inventory';inventory();
  checkpoint='fresh-preservation-snapshot';
  const files=snapshotFiles([privateDir,control]),before=resources();write('before.json',{files,resources:before});
  host();source();inventory();assert.deepEqual(resources(),before);
  assert.deepEqual(snapshotFiles([privateDir,control]),files);
  checkpoint='repository-disposer';
  const args=['tests/acceptance/phase-b.mjs','dispose',statePath,RUN];
  write('command.json',{cwd:checkout,executable:process.execPath,args});
  const fd=fs.openSync(path.join(out,'dispose.log'),'wx',0o600);
  let result;try{result=spawn(process.execPath,args,{cwd:checkout,stdio:['ignore',fd,fd],timeout:1020000});}finally{fs.closeSync(fd);}
  write('exit.json',{exit:result.status,signal:result.signal??null,executionError:Boolean(result.error)});
  assert.ok(!result.error);assert.equal(result.status,0);
  assert.deepEqual(read(path.join(out,'dispose.log')),{runId:RUN,disposed:true});
  checkpoint='absence-and-preservation';host();source();const after=resources();checkPreserved(before,after);
  assert.deepEqual(list('container',true),[]);assert.deepEqual(list('network',true),[]);
  assert.deepEqual(snapshotFiles([privateDir,control]),files);
  const receipt={approval:APPROVAL,candidate:CANDIDATE,runId:RUN,disposalExit:0,containersAbsent:7,networksAbsent:1,
   previousImagesPreserved:before.images.length,previousVolumesPreserved:before.volumes.length,
   privateFilesUnchanged:files.files.length,unrelatedResourceIdsPreserved:true,preflightEvidencePreserved:true,
   preflightSHA256:sha(b),replacementStartAuthorized:false};
  write('safe-result.json',receipt);return receipt;
 }catch{
  // Never print raw assertions, child output, state or provider data.
  throw new Error(`STOP: approved-disposal/${checkpoint}. Preserve receipts; no retry, restart, manual cleanup or replacement start.`);
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(run()));}catch(e){console.error(e.message);process.exitCode=1;}
}
