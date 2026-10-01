// Operator-only preparation review. Docker/Git calls here are read-only.
// No start, disposal, retry, source modification or production access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const CANDIDATE='1df0f6aa6572093e5399aa20fcf043703037d96a';
export const OLD='25ac040a4d099cad6342aec44863d21aad00f947';
export const RUN='test-run-8a396a5c-b211-4f11-aef1-b893afb7d00d';
export const DAEMON='0c15eeda-6839-43e6-a8ee-585570f98427';
export const NETWORK='7ebe86d404add08dbd02a60cea31cc8099fcf240d55ec69ba3c8ac6a1e922eda';
export const IDS=[
 '7ce759b9f86990cec6bedb683ecfb8c332d12ca6fab046136373e1e2a57592d8',
 '217bbbd451e949805642a9a3385cf430edf77759a8a6fa69b5201b740381693d',
 '59e490101ae72f73d6aaf8c25e7eed8281b6f860af2f7b17fb8363aca53d06fd',
 '2c1de974b2a51c8c614bc928980486c3296b529366862b361de4cd9386a38c1c',
 '4de1989a98066f9898dcc95221c40dca8e6741d205ff122f5fc95e25b1704b70',
 '6d0022061698c51287cf8858482fb88df6c69501e15095b68e3c43c26a6b6bbb',
 'dddf690a003d6299a6697e3b2ba12cb779db599ac63048b08d070d9599841a86'
];
export const OLD_RUNNER='sha256:9304c54c537335cd796ae845feda88473e80dae26700269702239b4e6fed25b1';
export const OLD_APP='sha256:4d4661ff2b03a1f7a11f0c4b37b62415f4766ab86166080e19244fcd9a4e76f7';
export const PREFLIGHT_SHA='6c1471c291f23f050afc7ba4119b662996c8e289fe77bcd28d2e86cd9c3f2273';
export const RUNNER_RECIPE_SHA='b9b12d1093b6fa2723f6e177640abc620a1dad654454888f9515037066b4c26e';
export const BROWSER_LOCK_SHA='0a0fe8bd0ce7989bacf2a842b9817aebede79cbb753bbaeba3265f20a0cd87b0';
export const PINS={
 node:'node@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed',
 database:'postgres@sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6',
 auth:'supabase/gotrue@sha256:7e813221b93fbf54b515036438550e483bfaf057b9db52fe9bc1ce91c47e817e',
 rest:'postgrest/postgrest@sha256:aa7e96af2d01219a09bc00c75de28171b1f9fda17ea455a931e4fb6d317089e0',
 storage:'cgr.dev/chainguard/minio@sha256:039800e64ec7247d2fde7cff3697e964f6fe20b6d7d2c46aa7d82cc63355d512'
};
export const BLOBS={
 'AGENTS.md':'06769bb6fbc9eb0c54e51866a4579a4ae9460518',
 'tests/acceptance/phase-b.mjs':'84bdab4de3a22309d66ca62ee0909849a79bda4d',
 'tests/acceptance/disposable-bootstrap.mjs':'7c81eaa29757d5ceef24aec7e8ea8d14085b470b',
 'tests/acceptance/prepare-browser.mjs':'682d1e1c2cce1d5e3240d96acaefd60beae87a76',
 'tests/acceptance/harness-env.mjs':'f58728f4a6b3cf62f9b84739d492d0e4661ff750',
 'tests/acceptance/environment-preflight.mjs':'d5a9a99e9236749df6385ac0bd4d509c2ff9981e',
 'tests/reliability/acceptance-environment.test.mjs':'3fab0708d964fb17aecddcadfbaaf754d4269c44',
 'lib/r2.ts':'c483f3904c65ad35b7db554e28b8a432c8acfc5f',
 'lib/crm/recovery-storage.ts':'680e173e69739b55c7b405fb546c0b0c8045c632',
 'tests/reliability/storage-endpoint.test.mjs':'526445e4b7097091079ea6e6bebb654cd3f6a2f1',
 'docs/security/ACCEPTANCE-CLAIM-RECHECK-2026-09-09.md':'04185ac7b4fe3684e239c3ca1131a200fa61259c',
 'docs/security/DISPOSABLE-AUTH-STORAGE-BOOTSTRAP.md':'6cec921d92fd5471ff9c4bc3efa14c8f659296ca',
 'docs/security/AUDIT-REMEDIATION-PLAN-2026-09-06.md':'2c299d0ef5920e2bc90a5a764e6271973614bd51'
};
export const PATHS={
 control:'/home/redwan/pr57-operator-1df0f6a',
 checkout:'/home/redwan/pr57-checkout-1df0f6a',
 privateDir:'/home/redwan/pr57-private-1df0f6a',
 oldPrivate:'/home/redwan/pr57-private-25ac040',
 oldControl:'/home/redwan/pr57-operator-25ac040',
 disposal:'/home/redwan/pr57-disposal-8a396a5c'
};
export const DISPOSAL_RECEIPT={
 approval:'approve_pr57_storage_failed_run_disposal:80180078016862',
 candidate:OLD,runId:RUN,disposalExit:0,containersAbsent:7,networksAbsent:1,
 previousImagesPreserved:54,previousVolumesPreserved:7,privateFilesUnchanged:79,
 unrelatedResourceIdsPreserved:true,preflightEvidencePreserved:true,
 preflightSHA256:PREFLIGHT_SHA,replacementStartAuthorized:false
};
const hash=b=>createHash('sha256').update(b).digest('hex');
const lines=t=>[...new Set(t.trim().split(/\r?\n/).filter(Boolean))].sort();
const imageId=v=>assert.match(v,/^sha256:[a-f0-9]{64}$/);
let checkpoint='initialization';
export function privateBytes(file){
 const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o600);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const a=fs.fstatSync(fd),b=fs.readFileSync(fd),z=fs.fstatSync(fd);
  assert.equal(a.ino,z.ino);assert.equal(a.size,b.length);assert.equal(a.size,z.size);
  assert.equal(a.mtimeMs,z.mtimeMs);assert.equal(a.ctimeMs,z.ctimeMs);return b;
 }finally{fs.closeSync(fd);}
}
function privateDir(dir){const s=fs.lstatSync(dir);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o700);}
function absent(file){try{fs.lstatSync(file);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
export function snapshotFiles(roots){
 const directories=[],files=[];
 function walk(dir){privateDir(dir);directories.push(dir);
  for(const n of fs.readdirSync(dir).sort()){
   const f=path.join(dir,n),s=fs.lstatSync(f);
   if(s.isDirectory()&&!s.isSymbolicLink())walk(f);
   else{const b=privateBytes(f);files.push({path:f,bytes:b.length,sha256:hash(b),mode:'0600'});}
  }
 }
 roots.forEach(walk);return {directories,files};
}
export function tapSummary(text,exit){
 assert.equal(exit.trim(),'0');const result={};
 for(const k of ['tests','pass','fail','cancelled','skipped','todo']){
  const m=[...text.matchAll(new RegExp(`^# ${k} (\\d+)\\r?$`,'gm'))];assert.equal(m.length,1);result[k]=Number(m[0][1]);
 }
 assert.deepEqual(result,{tests:84,pass:84,fail:0,cancelled:0,skipped:0,todo:0});return result;
}
export function probeLayer(log,needle){
 const matches=log.split(/\r?\n/).filter(l=>/^#\d+ /.test(l)&&l.includes(needle));assert.equal(matches.length,1);
 const id=matches[0].match(/^(#\d+) /)[1];
 if(new RegExp(`^${id} DONE(?:\\s|$)`,'m').test(log))return 'executed-successfully';
 assert.ok(new RegExp(`^${id} CACHED\\s*$`,'m').test(log));return 'successful-build-layer-reused-from-cache';
}
export function checkPreserved(before,after){
 for(const k of ['containers','networks','volumes'])assert.deepEqual(after[k],before[k]);
 assert.ok(before.images.every(id=>after.images.includes(id)));
}
export async function review(action,{paths=PATHS,execute=execFileSync,env=process.env}={}){
 const p=paths;
 const run=(bin,args,options={})=>execute(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:128*1024*1024,...options});
 const docker=(...a)=>run('docker',a);
 const git=(...a)=>run('git',['-C',p.checkout,...a]);
 const inspect=(kind,id)=>JSON.parse(docker(kind,'inspect',id))[0];
 const read=f=>JSON.parse(privateBytes(f).toString());
 const out=(name,value)=>fs.writeFileSync(path.join(p.control,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 const list=(kind,owned=false)=>lines(docker(kind,'ls',...(kind==='container'?['--all']:[]),
  ...(kind==='volume'?[]:['--no-trunc']),...(owned?['--filter','label=work.redwan.phase-b']:[]),
  '--format',kind==='volume'?'{{.Name}}':'{{.ID}}'));
 const resources=()=>({containers:list('container'),networks:list('network'),images:list('image'),volumes:list('volume')});
 const noRuntime=()=>{
  assert.equal(list('container',true).length,0);assert.equal(list('network',true).length,0);
  assert.ok(absent(path.join(p.privateDir,'state.json')));
 };
 const host=()=>{
  assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.1');
  assert.ok(!env.DOCKER_HOST&&!env.DOCKER_CONTEXT&&!env.NODE_OPTIONS&&!env.NODE_PATH);
  assert.match(JSON.parse(docker('context','inspect'))[0].Endpoints?.docker?.Host||'',/^unix:\/\//);
  const info=JSON.parse(docker('info','--format','{{json .}}'));assert.equal(info.ID,DAEMON);
  const drivers=docker('buildx','inspect').split(/\r?\n/).filter(l=>l.startsWith('Driver:'));
  assert.equal(drivers.length,1);assert.match(drivers[0],/^Driver:[ \t]+docker[ \t]*$/);
  assert.ok(['ext4','xfs','btrfs','zfs'].includes(run('findmnt',['-n','-o','FSTYPE','-T',p.control]).trim()));
  return {dockerId:info.ID,dockerVersion:info.ServerVersion,node:process.version,builder:'docker'};
 };
 const checkout=()=>{
  assert.equal(git('rev-parse','HEAD').trim(),CANDIDATE);assert.equal(git('status','--porcelain').trim(),'');
  for(const [file,blob]of Object.entries(BLOBS)){
   assert.equal(git('hash-object',file).trim(),blob);assert.equal(git('rev-parse',`${CANDIDATE}:${file}`).trim(),blob);
  }
  assert.ok(['ext4','xfs','btrfs','zfs'].includes(run('findmnt',['-n','-o','FSTYPE','-T',p.checkout]).trim()));
 };
 privateDir(p.control);
 if(action==='before'){
  checkpoint='reported-disposal-and-host';
  const daemon=host();noRuntime();
  assert.ok(absent(p.checkout)&&absent(p.privateDir));
  assert.deepEqual(read(path.join(p.disposal,'safe-result.json')),DISPOSAL_RECEIPT);
  assert.equal(privateBytes(path.join(p.disposal,'operator.exit')).toString().trim(),'0');
  assert.deepEqual(read(path.join(p.disposal,'exit.json')),{exit:0,signal:null,executionError:false});
  assert.deepEqual(read(path.join(p.disposal,'dispose.log')),{runId:RUN,disposed:true});
  const preflight=privateBytes(path.join(p.oldControl,'runtime-25ac040/environment-preflight.evidence.json'));
  assert.equal(preflight.length,700);assert.equal(hash(preflight),PREFLIGHT_SHA);
  checkpoint='fresh-preparation-baseline';
  const current=resources();assert.ok(IDS.every(id=>!current.containers.includes(id)));assert.ok(!current.networks.includes(NETWORK));
  const files=snapshotFiles([p.oldPrivate,p.oldControl,p.disposal]);
  assert.deepEqual(resources(),current);
  out('before.private.json',{candidate:CANDIDATE,daemon,resources:current,files});
  return {candidate:CANDIDATE,phase:'before-preparation',disposalReceiptMatched:true,
   priorContainersAbsent:7,priorNetworksAbsent:1,preflightEvidencePreserved:true,
   oldPrivateFileCount:files.files.length,daemon,startAuthorized:false};
 }
 checkpoint='clean-checkout-and-source-blobs';checkout();
 if(action==='checkout')return {candidate:CANDIDATE,clean:true,blobs:BLOBS};
 checkpoint='actual-isolated-test-receipt';
 const tests=tapSummary(privateBytes(path.join(p.control,'isolated.log')).toString(),
  privateBytes(path.join(p.control,'isolated.exit')).toString());
 if(action==='tests')return {candidate:CANDIDATE,exit:0,...tests};
 assert.equal(action,'prepared');
 checkpoint='actual-preparation-receipt';
 const daemon=host();noRuntime();
 assert.equal(privateBytes(path.join(p.control,'prepare.exit')).toString().trim(),'0');
 assert.deepEqual(read(path.join(p.control,'prepare.log')),{candidate:CANDIDATE,phase:'prepared-not-provisioned',plannedContainers:7,plannedNetworks:1});
 checkpoint='private-modes-and-fresh-material';
 const modes=snapshotFiles([p.privateDir]);
 const m=read(path.join(p.privateDir,'material.json')),old=read(path.join(p.oldPrivate,'material.json'));
 for(const k of ['publishableKey','secretKey','databasePassword','storageAccess','storageSecret','salt']){
  assert.equal(typeof m[k],'string');assert.notEqual(m[k],old[k]);
 }
 assert.notEqual(m.signingKey.kid,old.signingKey.kid);assert.ok(m.signingKey.x!==old.signingKey.x||m.signingKey.y!==old.signingKey.y);
 const prep=read(path.join(p.privateDir,'preparation.json')),r=read(path.join(p.privateDir,'runner.json'));
 const planBytes=privateBytes(path.join(p.privateDir,'plan.json')),plan=JSON.parse(planBytes.toString());
 checkpoint='candidate-image-bindings';
 assert.deepEqual(prep.images,PINS);assert.equal(prep.candidate,CANDIDATE);assert.equal(prep.phase,'prepared-not-provisioned');
 assert.equal(prep.plannedContainers,7);assert.equal(prep.plannedNetworks,1);
 assert.equal(r.candidate,CANDIDATE);assert.equal(r.baseImage,PINS.node);assert.equal(r.browserVersion,'1.58.2');
 assert.equal(r.state,'built-not-browser-verified');assert.equal(prep.runner,r.imageId);
 imageId(prep.runner);imageId(prep.app);assert.notEqual(prep.runner,OLD_RUNNER);assert.notEqual(prep.app,OLD_APP);
 assert.equal(prep.appBase,`localhost/redwan-acceptance-base:${prep.runner.slice(7)}`);
 assert.equal(inspect('image',prep.appBase).Id,prep.runner);
 const mod=await import(pathToFileURL(path.join(p.checkout,'tests/acceptance/disposable-bootstrap.mjs')));
 const browser=await import(pathToFileURL(path.join(p.checkout,'tests/acceptance/prepare-browser.mjs')));
 checkpoint='generated-plan-equality';
 assert.deepEqual(plan,mod.createPlan({candidate:CANDIDATE,images:{...PINS,runner:prep.runner,app:prep.app},material:m}));
 checkpoint='recipe-lock-source-and-migration-hashes';
 const runnerRecipe=hash(browser.runnerRecipe({candidate:CANDIDATE,baseImage:PINS.node}));
 assert.equal(runnerRecipe,RUNNER_RECIPE_SHA);assert.equal(r.recipeSha256,runnerRecipe);
 assert.equal(r.browserLockSha256,hash(JSON.stringify(browser.browserLock)));assert.equal(r.browserLockSha256,BROWSER_LOCK_SHA);
 assert.equal(r.sourceArchiveSha256,hash(run('git',['-C',p.checkout,'archive','--format=tar',CANDIDATE],{encoding:null})));
 const appRecipe=mod.appRecipe({appBase:prep.appBase,publishableKey:m.publishableKey});
 assert.equal(privateBytes(path.join(p.privateDir,'app-build/Dockerfile')).toString(),appRecipe);assert.equal(prep.recipeSha256,hash(appRecipe));
 const manifest=mod.migrationManifest(git('ls-tree','--name-only',`${CANDIDATE}:supabase/migrations`).trim().split('\n')
  .map(name=>({name,sql:git('show',`${CANDIDATE}:supabase/migrations/${name}`)})));
 assert.deepEqual(read(path.join(p.privateDir,'migrations.json')),manifest);
 checkpoint='local-image-contracts';
 const images=Object.entries({...PINS,runner:prep.runner,app:prep.app}).map(([role,reference])=>{
  const i=inspect('image',reference);imageId(i.Id);assert.equal(i.Os,'linux');assert.equal(i.Architecture,'amd64');
  if(['runner','app'].includes(role)){
   assert.equal(i.Id,reference);assert.equal(i.Config.User,'1000:1000');
   assert.equal(i.Config.Labels?.['org.opencontainers.image.revision'],CANDIDATE);
   assert.equal(i.Config.Labels?.['work.redwan.acceptance.browser'],'1.58.2');
  }
  const pgMajor=(i.Config.Env||[]).find(s=>s.startsWith('PG_MAJOR='))?.slice(9);
  if(role==='database')assert.equal(pgMajor,'17');
  for(const service of plan.services.filter(s=>s.image===reference)){
   for(const volume of Object.keys(i.Config.Volumes||{}))assert.ok(service.tmpfs.some(t=>t.split(':')[0]===volume));
  }
  return {role,reference,imageId:i.Id,repoDigests:i.RepoDigests||[],os:i.Os,architecture:i.Architecture,
   imageUser:i.Config.User,entrypoint:i.Config.Entrypoint,defaultCommand:i.Config.Cmd,
   declaredVolumes:Object.keys(i.Config.Volumes||{}),...(role==='database'?{pgMajor}:{})};
 });
 checkpoint='asymmetric-auth-and-build-probes';
 const auth=plan.services.find(s=>s.role==='auth'),rest=plan.services.find(s=>s.role==='rest');
 assert.equal(auth.env.GOTRUE_JWT_SECRET,'');
 const keys=JSON.parse(auth.env.GOTRUE_JWT_KEYS),jwks=JSON.parse(rest.env.PGRST_JWT_SECRET);
 assert.equal(keys.length,1);assert.equal(keys[0].alg,'ES256');assert.equal(keys[0].kty,'EC');
 assert.equal(jwks.keys.length,1);assert.ok(!('d'in jwks.keys[0])&&!('k'in jwks.keys[0]));
 const probes={
  runner:probeLayer(privateBytes(path.join(p.privateDir,'runner.json.build.log')).toString(),'RUN node --check tests/acceptance/disposable-bootstrap.mjs'),
  app:probeLayer(privateBytes(path.join(p.privateDir,'app-build.log')).toString(),'RUN node --check node_modules/next/dist/bin/next')
 };
 checkpoint='prior-evidence-and-resource-preservation';
 const before=read(path.join(p.control,'before.private.json'));assert.equal(before.candidate,CANDIDATE);
 assert.equal(before.daemon.dockerId,daemon.dockerId);
 assert.deepEqual(snapshotFiles([p.oldPrivate,p.oldControl,p.disposal]),before.files);checkPreserved(before.resources,resources());
 noRuntime();checkout();
 return {candidate:CANDIDATE,phase:prep.phase,daemon,tests:{exit:0,...tests},preparationExit:0,
  stateAbsent:true,ownedContainers:0,ownedNetworks:0,
  modes:{directories:'0700',regularFiles:'0600',symlinks:0,directoryCount:modes.directories.length,fileCount:modes.files.length},
  freshMaterialComparedPrivately:true,generatedPlanMatches:true,probes,images,
  hashes:{privatePlan:hash(planBytes),runnerRecipe,browserLock:r.browserLockSha256,sourceArchive:r.sourceArchiveSha256,appRecipe:prep.recipeSha256},
  migrations:manifest.map(({name,sha256})=>({name,sha256})),
  services:plan.services.map(s=>({role:s.role,image:s.image,user:s.user,memoryMB:s.memoryMB,command:s.command,tmpfs:s.tmpfs,environmentKeys:Object.keys(s.env).sort()})),
  plannedHardening:{pidsPerService:512,dropCapabilities:['ALL'],noNewPrivileges:true,dns:['127.0.0.1'],pull:'never',
   internalBridge:true,publishedPorts:0,persistentOrBindMounts:0,readonlyRootRoles:['runner'],otherRootsWritable:true},
  oldPrivateFilesUnchanged:before.files.files.length,previousImageIdsPreserved:before.resources.images.length,
  existingContainersNetworksVolumesUnchanged:true,preflightEvidencePreserved:true,
  runtimeAcceptance:'not-executed',startAuthorized:false,release:'blocked'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const action=process.argv[2];
 try{
  assert.ok(['before','checkout','tests','prepared'].includes(action));
  console.log(JSON.stringify(await review(action),null,2));
 }catch{
  console.error(`STOP: prepare-review/${checkpoint}. Preserve private receipts; no retry, source edits, cleanup or startup.`);
  process.exitCode=1;
 }
}
