// Operator-only helper. Starts no stack; suites use the original committed launcher.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const CANDIDATE='25ac040a4d099cad6342aec44863d21aad00f947';
export const RUNNER='sha256:9304c54c537335cd796ae845feda88473e80dae26700269702239b4e6fed25b1';
export const APP='sha256:4d4661ff2b03a1f7a11f0c4b37b62415f4766ab86166080e19244fcd9a4e76f7';
const CONTROL='/home/redwan/pr57-operator-25ac040';
const PRIVATE='/home/redwan/pr57-private-25ac040';
const NEW='/home/redwan/pr57-checkout-25ac040';
const EVIDENCE=path.join(CONTROL,'runtime-25ac040');
export const SUITES=['environment-preflight','real-backup-restore','section4-interrupted-restore','section5-session-authorization','section6-staging-replay','section7-browser-usability','failing-resume-after-reload','test-browser-resume'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',['-C',NEW,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const docker=(...a)=>execFileSync('docker',a,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:16*1024*1024});
let checkpoint='operator-files';
function privateBytes(file){const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o600);return fs.readFileSync(file);}
const read=file=>JSON.parse(privateBytes(file).toString());
function absent(file){try{fs.lstatSync(file);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
function same(a,b){assert.ok(JSON.stringify(a)===JSON.stringify(b));}
export function counts(text){
 const out={};
 for(const k of ['tests','pass','fail','cancelled','skipped','todo']){
  const m=[...text.matchAll(new RegExp(`^# ${k} (\\d+)\\r?$`,'gm'))];assert.equal(m.length,1);out[k]=Number(m[0][1]);
 }
 assert.ok(out.tests>0&&out.pass===out.tests);for(const k of ['fail','cancelled','skipped','todo'])assert.equal(out[k],0);
 return out;
}
export function validateEvidence(kind,e,state){
 assert.equal(e.candidate,CANDIDATE);assert.equal(e.runId,state.runId);
 if(kind==='preflight'){
  assert.equal(e.state,'environment-ready');assert.equal(e.phase,'complete');assert.equal(e.acceptanceAE,'not-executed');
  assert.deepEqual(e.browser,{anonymousOrigin:true,authenticatedCatalog:true,mobileOverflow:false,keyboardEntry:true});
 }else{
  assert.equal(e.state,'passed');assert.equal(e.scenarios.length,5);
  for(const [i,letter]of ['A','B','C','D','E'].entries())assert.ok(e.scenarios[i].startsWith(letter+': '));
 }
}
export function validateBindings(p){
 assert.equal(p.candidate,CANDIDATE);assert.equal(p.stateAbsent,true);assert.equal(p.ownedContainers,0);assert.equal(p.ownedNetworks,0);
 assert.equal(p.services.find(s=>s.role==='runner').image,RUNNER);
 assert.equal(p.services.find(s=>s.role==='gateway').image,RUNNER);
 assert.equal(p.services.find(s=>s.role==='app').image,APP);
 same(p.hashes,{
  runnerRecipe:'4a437e744f4e7a3ce6d3c631ae59af161ad8ad557fec5883ca67efa39dbb6ef2',
  browserLock:'0a0fe8bd0ce7989bacf2a842b9817aebede79cbb753bbaeba3265f20a0cd87b0',
  sourceArchive:'42d7f65d2ce209d456ad12d0b458d50213c6e32ec29906389a893f72220b1ba1',
  appRecipe:'d07b977982c4a6d8dc8f8c2c9217d920ff73c84c3e501fb72a56ed7cddadd1af'
 });
}
function host(){
 assert.equal(process.version,'v22.23.1');assert.equal(process.platform,'linux');
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 assert.match(JSON.parse(docker('context','inspect'))[0].Endpoints.docker.Host,/^unix:\/\//);
 assert.equal(JSON.parse(docker('info','--format','{{json .}}')).ID,'0c15eeda-6839-43e6-a8ee-585570f98427');
 assert.equal(git('rev-parse','HEAD'),CANDIDATE);assert.equal(git('status','--porcelain'),'');
}
async function owned(){
 host();
 const s=read(path.join(PRIVATE,'state.json'));
 assert.equal(s.candidate,CANDIDATE);assert.match(s.runId,/^test-run-[a-f0-9-]{36}$/);assert.equal(s.services.length,7);
 const {verifyOwnedRun}=await import(pathToFileURL(path.join(NEW,'tests/acceptance/phase-b.mjs')));
 verifyOwnedRun(s);
 assert.equal(s.services.find(x=>x.role==='runner').imageId,RUNNER);
 assert.equal(s.services.find(x=>x.role==='gateway').imageId,RUNNER);
 assert.equal(s.services.find(x=>x.role==='app').imageId,APP);
 const plan=read(path.join(PRIVATE,'plan.json'));
 for(const service of s.services){
  const c=JSON.parse(docker('container','inspect',service.id))[0];
  const p=plan.services.find(x=>x.role===service.role);
  assert.equal(c.HostConfig.PidsLimit,512);assert.equal(c.Config.User,p.user);
  assert.equal(c.HostConfig.Memory,p.memoryMB*1024*1024);
  assert.equal(c.HostConfig.ReadonlyRootfs,service.role==='runner');
 }
 return s;
}
async function execOwned(role,args,input){
 const s=await owned();const id=s.services.find(x=>x.role===role).id;
 return execFileSync('docker',['exec','-i',id,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:16*1024*1024});
}
async function exportArtifact(kind,label){
 const state=await owned();const runner=state.services.find(s=>s.role==='runner');
 const file=kind==='preflight'?'/tmp/phase-b-preflight.json':'/tmp/recovery-browser-evidence.json';
 const dest=path.join(EVIDENCE,`${label}.evidence.json`);assert.ok(absent(dest));
 const script=`const fs=require('node:fs');let fd;try{fd=fs.openSync(${JSON.stringify(file)},fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&511)!==384||s.size<1||s.size>1048576)throw Error();const b=fs.readFileSync(fd);if(b.length!==s.size)throw Error();process.stdout.write(b);}catch(e){process.stderr.write(e.code==='ENOENT'?'EVIDENCE_MISSING':'EVIDENCE_UNAVAILABLE');process.exitCode=1;}finally{if(fd!==undefined)fs.closeSync(fd);}`;
 const r=spawnSync('docker',['exec','--user','1000:1000',runner.id,'node','-e',script],{encoding:null,stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:1024*1024});
 if(r.status!==0||r.error){return {preserved:false,category:r.stderr?.toString()==='EVIDENCE_MISSING'?'not-generated':'unavailable'};}
 fs.writeFileSync(dest,r.stdout,{flag:'wx',mode:0o600});assert.ok(privateBytes(dest).equals(r.stdout));
 // Preserve original bytes even when the test recorded failure; never reconstruct.
 let e;try{e=JSON.parse(r.stdout.toString());assert.equal(e.candidate,CANDIDATE);assert.equal(e.runId,state.runId);}
 catch{return {preserved:true,identityValid:false,sha256:sha(r.stdout)};}
 return {preserved:true,identityValid:true,sha256:sha(r.stdout),byteLength:r.stdout.length};
}
export const runtimeProbe=`
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {probeGateway} from './tests/acceptance/environment-preflight.mjs';
const require=createRequire(import.meta.url);
try {
 const cfg=JSON.parse(fs.readFileSync(0,'utf8'));
 if(cfg.NEXT_PUBLIC_SUPABASE_URL!=='http://gateway:8000'||cfg.R2_ENDPOINT!=='http://storage:9000')throw Error();
 const request=(u,o)=>{if(new URL(u).origin!=='http://gateway:8000')throw Error();return fetch(u,{...o,redirect:'manual',signal:AbortSignal.timeout(5000)});};
 const jwks=await probeGateway(cfg,request);
 if(jwks.keys.length!==1||jwks.keys[0].alg!=='ES256'||jwks.keys[0].kty!=='EC')throw Error();
 const {S3Client,HeadBucketCommand}=require('@aws-sdk/client-s3');
 const bucketChecks=[];
 for(const kind of ['PRIVATE','PUBLIC']){
  const bucket=cfg['R2_'+kind+'_BUCKET'];if(!['synthetic-private','synthetic-public'].includes(bucket))throw Error();
  const client=new S3Client({endpoint:cfg.R2_ENDPOINT,region:'auto',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:cfg['R2_'+kind+'_ACCESS_KEY_ID'],secretAccessKey:cfg['R2_'+kind+'_SECRET_ACCESS_KEY']}});
  try{await client.send(new HeadBucketCommand({Bucket:bucket}));}finally{client.destroy();}
  const r=await fetch(cfg.R2_ENDPOINT+'/'+bucket,{redirect:'manual',signal:AbortSignal.timeout(5000)});const status=r.status;await r.body?.cancel();if(status!==403)throw Error();
  bucketChecks.push({bucket,authenticatedHead:true,anonymousStatus:status});
 }
 console.log(JSON.stringify({gatewayNegativeAuthority:true,publicJwksES256:true,bucketChecks}));
}catch{console.error('RUNTIME_READINESS_FAILED');process.exitCode=1;}
`;
async function readiness(){
 const s=await owned();
 assert.equal(privateBytes(path.join(CONTROL,'start-25ac040.exit')).toString().trim(),'0');
 const receipt=read(path.join(CONTROL,'start-25ac040.log'));
 assert.equal(receipt.candidate,CANDIDATE);assert.equal(receipt.runId,s.runId);assert.equal(receipt.state,'bootstrapped-not-accepted');
 const boot=read(path.join(PRIVATE,'state.json.bootstrap-result.json'));
 assert.equal(boot.candidate,CANDIDATE);assert.equal(boot.runId,s.runId);assert.equal(boot.state,'bootstrapped-not-accepted');
 const sql=`select json_build_object('migrations',(select json_agg(json_build_object('name',name,'sha256',sha256) order by name) from bootstrap_internal.migrations),'expiryPrivileges',json_build_object('anon',has_function_privilege('anon','public.acceptance_expire_recovery_import(uuid,uuid)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.acceptance_expire_recovery_import(uuid,uuid)','EXECUTE'),'service_role',has_function_privilege('service_role','public.acceptance_expire_recovery_import(uuid,uuid)','EXECUTE')));`;
 const result=JSON.parse((await execOwned('database',['psql','-h','/tmp','-U','postgres','-d','postgres','-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],sql)).trim());
 const expected=read(path.join(PRIVATE,'migrations.json')).map(({name,sha256})=>({name,sha256}));
 assert.equal(expected.length,40);assert.deepEqual(result.migrations,expected);assert.deepEqual(boot.migrations,expected);
 assert.deepEqual(result.expiryPrivileges,{anon:false,authenticated:false,service_role:true});
 const probe=JSON.parse(await execOwned('runner',['node','--input-type=module','-e',runtimeProbe],JSON.stringify(s.acceptance)));
 const value={candidate:CANDIDATE,runId:s.runId,migrations:result.migrations,expiryPrivileges:result.expiryPrivileges,...probe,phase:'runtime-readiness-only',acceptanceAE:'not-executed'};
 write(path.join(EVIDENCE,'readiness.json'),value);return value;
}
async function suite(name){
 const index=SUITES.indexOf(name);assert.ok(index>=0);
 const state=await owned();const ready=read(path.join(EVIDENCE,'readiness.json'));assert.equal(ready.runId,state.runId);assert.equal(ready.candidate,CANDIDATE);
 for(const prior of SUITES.slice(0,index)){const r=read(path.join(EVIDENCE,prior+'.result.json'));assert.equal(r.candidate,CANDIDATE);assert.equal(r.runId,state.runId);assert.equal(r.accepted,true);}
 for(const suffix of ['log','exit','result.json','evidence.json'])assert.ok(absent(path.join(EVIDENCE,name+'.'+suffix)));
 const fd=fs.openSync(path.join(EVIDENCE,name+'.log'),'wx',0o600);
 let result;
 try{result=spawnSync('node',['tests/acceptance/phase-b.mjs','run',path.join(PRIVATE,'state.json'),'node','--test',`tests/acceptance/${name}.mjs`],{cwd:NEW,stdio:['ignore',fd,fd],timeout:1860000});}
 finally{fs.closeSync(fd);}
 const exit=result.status??1;fs.writeFileSync(path.join(EVIDENCE,name+'.exit'),String(exit)+'\n',{flag:'wx',mode:0o600});
 let artifact=null,artifactOK=true;
 if(index===0||index===7){
  const kind=index===0?'preflight':'browser';
  try{artifact=await exportArtifact(kind,name);if(exit===0){assert.equal(artifact.preserved,true);assert.equal(artifact.identityValid,true);validateEvidence(kind,read(path.join(EVIDENCE,name+'.evidence.json')),state);}}
  catch{artifactOK=false;artifact=artifact||{preserved:false,category:'export-check-failed'};}
 }
 let summary=null,accepted=false;
 try{summary=counts(privateBytes(path.join(EVIDENCE,name+'.log')).toString());assert.equal(exit,0);assert.ok(!result.error&&artifactOK);if(index===0||index===7)assert.equal(artifact?.preserved,true);accepted=true;}catch{}
 const value={candidate:CANDIDATE,runId:state.runId,suite:name,exit,counts:summary,evidence:artifact,accepted};
 write(path.join(EVIDENCE,name+'.result.json'),value);console.log(JSON.stringify(value));
 if(!accepted)throw Error('suite did not pass');
}
async function main(action,arg){
 host();
 const dir=fs.lstatSync(EVIDENCE);assert.ok(dir.isDirectory()&&!dir.isSymbolicLink());assert.equal(dir.mode&0o777,0o700);
 if(action==='prestart'){
  checkpoint='prestart-bindings';
  assert.equal(sha(privateBytes(path.join(CONTROL,'review.mjs'))),'54b426ff1be2e52ee6508fca654eec30c2f24d57f7fccfebcc120c62f5e7b288');
  const {review}=await import(pathToFileURL(path.join(CONTROL,'review.mjs')));
  const p=await review('prepared');validateBindings(p);
  for(const suffix of ['log','exit','command.txt'])assert.ok(absent(path.join(CONTROL,'start-25ac040.'+suffix)));
  write(path.join(EVIDENCE,'prestart.json'),{candidate:CANDIDATE,runner:RUNNER,app:APP,checked:true});
  console.log('PRESTART_PASS: exact approved preparation; no runtime created.');return;
 }
 checkpoint=action==='readiness'?'runtime-readiness':action==='suite'?'ordered-suite-and-evidence':'unknown-action';
 if(action==='readiness'){console.log(JSON.stringify(await readiness()));return;}
 if(action==='suite'){await suite(arg);return;}
 throw Error('unknown action');
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await main(process.argv[2],process.argv[3]);}
 catch{console.error(`STOP: run-ops/${checkpoint}. Keep private logs and retained resources; no retries, restarts, cleanup or later suites.`);process.exitCode=1;}
}
