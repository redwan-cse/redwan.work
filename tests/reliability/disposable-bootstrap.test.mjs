import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createPublicKey, verify } from 'node:crypto';
import { provision } from '../acceptance/phase-b.mjs';

const candidate = 'b'.repeat(40);
const cfg = {
 DISPOSABLE_AUTH_CI:'true',NEXT_PUBLIC_SUPABASE_URL:'http://gateway:8000',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',
 APP_URL:'http://app:3000',R2_ENDPOINT:'http://storage:9000',R2_PRIVATE_BUCKET:'synthetic-private',R2_PUBLIC_BUCKET:'synthetic-public',
 R2_PRIVATE_ACCESS_KEY_ID:'testonly1',R2_PRIVATE_SECRET_ACCESS_KEY:'testonly2',R2_PUBLIC_ACCESS_KEY_ID:'testonly3',R2_PUBLIC_SECRET_ACCESS_KEY:'testonly4',LEAD_IP_HASH_SALT:'testonly-salt'
};
const roles=['database','runner','auth','rest','storage','gateway','app'];
function plan(){return {version:1,candidate,acceptance:cfg,services:roles.map(role=>({role,image:`sha256:${'a'.repeat(64)}`,command:['sleep','infinity'],env:role==='app'?{...cfg,NEXT_PUBLIC_SITE_URL:cfg.APP_URL}:{},tmpfs:[],memoryMB:512}))};}

// Uses the real provisioner, not a copy of the intended startup algorithm.
test('database bootstrap failure stops dependent services and retains exact IDs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bootstrap-stop-')),target=path.join(dir,'state.json');
 const events=[];
 const fake=(...a)=>{
  if(a[0]==='context')return JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]);
  if(a[0]==='image')return JSON.stringify([{Id:`sha256:${'a'.repeat(64)}`,Config:{Labels:{'org.opencontainers.image.revision':candidate}}}]);
  if(a[0]==='network'&&a[1]==='create')return 'owned-net';
  if(a[0]==='container'&&a[1]==='create'){const role=a[a.indexOf('--network-alias')+1];events.push('create:'+role);return 'owned-'+role;}
  if(a[0]==='container'&&a[1]==='start'){events.push('start:'+a[2]);return a[2];}
  throw Error('Unexpected operation');
 };
 try{
  assert.throws(()=>provision(plan(),target,fake,({service,state})=>{
   events.push('initialize:'+service.role);
   assert.equal(state.services[0].id,'owned-database');
   throw Error('Synthetic database initialization failure');
  }));
  assert.deepEqual(events,['create:database','start:owned-database','initialize:database']);
  const state=JSON.parse(fs.readFileSync(target));
  assert.equal(state.phase,'failed-retained');assert.equal(state.services.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const load=()=>import('../acceptance/disposable-bootstrap.mjs');
test('expiry control exists only in disposable bootstrap and does not grant table writes',async()=>{
 const {acceptanceFixtureSql}=await load();
 const sql=acceptanceFixtureSql();
 assert.match(sql,/create function public\.acceptance_expire_recovery_import/);
 assert.match(sql,/where id=p_id and actor=p_actor and result is null/);
 assert.match(sql,/request\.jwt\.claims/);
 assert.match(sql,/revoke all on function[\s\S]*from public,anon,authenticated/);
 assert.match(sql,/grant execute on function[\s\S]*to service_role/);
 assert.doesNotMatch(sql,/grant\s+update|grant\s+all|drop |truncate /i);
});
const images=()=>Object.fromEntries(['database','auth','rest','storage','runner','app'].map(role=>[role,`sha256:${'a'.repeat(64)}`]));
test('generated material is fresh ES256 only with separate opaque API keys',async()=>{
 const {createMaterial}=await load();const a=createMaterial(),b=createMaterial();
 assert.notEqual(a.publishableKey,b.publishableKey);assert.notEqual(a.secretKey,b.secretKey);
 assert.notEqual(a.databasePassword,b.databasePassword);assert.notEqual(a.signingKey.d,b.signingKey.d);
 assert.equal(a.signingKey.kty,'EC');assert.equal(a.signingKey.crv,'P-256');assert.equal(a.signingKey.alg,'ES256');
 assert.deepEqual(a.signingKey.key_ops,['sign']);assert.match(a.publishableKey,/^sb_publishable_/);assert.match(a.secretKey,/^sb_secret_/);
 assert.equal(a.jwks.keys[0].d,undefined);assert.equal(a.jwks.keys[0].k,undefined);assert.deepEqual(a.jwks.keys[0].key_ops,['verify']);
});
test('generated plan has dependency order, isolated endpoints and no legacy credentials',async()=>{
 const {createMaterial,createPlan}=await load();const m=createMaterial(),p=createPlan({candidate,images:images(),material:m});
 assert.deepEqual(p.services.map(s=>s.role),roles);
 const auth=p.services.find(s=>s.role==='auth'),rest=p.services.find(s=>s.role==='rest'),gateway=p.services.find(s=>s.role==='gateway');
 assert.equal(auth.env.GOTRUE_JWT_SECRET,'');assert.equal(JSON.parse(auth.env.GOTRUE_JWT_KEYS)[0].alg,'ES256');
 assert.equal(JSON.parse(rest.env.PGRST_JWT_SECRET).keys[0].d,undefined);
 assert.deepEqual(rest.command,[],'Use the pinned image default executable, not a PATH guess');
 assert.equal(gateway.env.BOOTSTRAP_SECRET_KEY,m.secretKey);
 assert.equal(p.services.find(s=>s.role==='app').env.HOSTNAME,'app');
 assert.equal(p.services.find(s=>s.role==='app').env.SUPABASE_SECRET_KEY,m.secretKey);
 assert.ok(!JSON.stringify(p).includes('HS256'));
 for(const s of p.services){assert.equal(s.ports,undefined);assert.equal(s.volumes,undefined);assert.equal(s.mounts,undefined);}
 assert.throws(()=>createPlan({candidate,images:{...images(),auth:'gotrue:latest'},material:m}));
});

test('database socket plan supports image initialization and explicit bootstrap clients',async()=>{
 const {createMaterial,createPlan}=await load();
 const database=createPlan({candidate,images:images(),material:createMaterial()}).services.find(s=>s.role==='database');
 const settings=database.command.flatMap((arg,i)=>arg==='-c'?[database.command[i+1]]:[]);
 const socketSettings=settings.filter(value=>value.startsWith('unix_socket_directories='));
 assert.equal(socketSettings.length,1,'Exactly one socket-directory override required');
 // The pinned Debian entrypoint clears PGHOST for its own psql initialization.
 // Later bootstrap SQL explicitly uses -h /tmp, so both socket paths are required.
 assert.deepEqual(socketSettings[0].slice('unix_socket_directories='.length).split(','),
  ['/var/run/postgresql','/tmp'],'Image-default and bootstrap Unix sockets must both be available');
 assert.equal(database.command[0],'postgres');
 assert.equal(database.user,'999:999');
 assert.equal(database.env.POSTGRES_INITDB_ARGS,'--auth-host=scram-sha-256');
 assert.equal(database.env.PGHOST,undefined,'PGHOST cannot repair the entrypoint client override');
 assert.equal(database.env.PGHOSTADDR,undefined);
 assert.ok(settings.includes('listen_addresses=*'));
 assert.ok(settings.includes('log_statement=none'));
 assert.deepEqual(database.tmpfs,[
  '/var/lib/postgresql/data:rw,nosuid,nodev,size=1024m,uid=999,gid=999,mode=0700',
  '/tmp:rw,nosuid,nodev,size=64m,uid=999,gid=999,mode=0700'
 ]);
});

test('gateway never elevates absent, invalid or ambiguous API credentials',async()=>{
 const {createMaterial,translateHeaders}=await load();const m=createMaterial();
 for(const headers of [{},{apikey:'arbitrary'},{authorization:`Bearer ${m.secretKey}`},
  {apikey:`${m.publishableKey}, ${m.secretKey}`},{apikey:m.publishableKey,authorization:`Bearer ${m.secretKey}`}]}){
  assert.throws(()=>translateHeaders(headers,m));
 }
});
test('gateway translates only exact opaque keys to signed internal roles',async()=>{
 const {createMaterial,translateHeaders}=await load();const m=createMaterial();
 for(const [key,role] of [[m.publishableKey,'anon'],[m.secretKey,'service_role']]){
  const output=translateHeaders({apikey:key,authorization:`Bearer ${key}`},m,1000);
  const token=output.authorization.slice(7),parts=token.split('.');
  assert.equal(JSON.parse(Buffer.from(parts[0],'base64url')).alg,'ES256');
  const payload=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert.equal(payload.role,role);assert.equal(payload.exp,1060);assert.equal(payload.iat,1000);
  assert.ok(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:createPublicKey({key:m.jwks.keys[0],format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
  assert.equal(output.apikey,undefined);
 }
});
test('gateway forwards user bearer unchanged and rejects symmetric or broken bearer syntax',async()=>{
 const {createMaterial,translateHeaders}=await load();const m=createMaterial();
 const token=Buffer.from(JSON.stringify({alg:'ES256',kid:m.signingKey.kid})).toString('base64url')+'.e30.signature';
 const header=`Bearer ${token}`;
 assert.equal(translateHeaders({apikey:m.publishableKey,authorization:header},m).authorization,header);
 const hs=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.e30.signature';
 for(const authorization of ['Bearer not-a-jwt',`Bearer ${hs}`,'Basic anything','Bearer'])assert.throws(()=>translateHeaders({apikey:m.publishableKey,authorization},m));
});
test('HTTP gateway denies invalid authority without touching upstream and never forwards app cookies',async()=>{
 const {createMaterial,createGateway}=await load();const m=createMaterial();let calls=0;
 const server=createGateway(m,async()=>{calls++;return new Response('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const headers of [{},{apikey:'wrong'},{apikey:m.publishableKey,cookie:'session=private'},
   {apikey:m.publishableKey,authorization:`Bearer ${m.secretKey}`}]){
   const response=await fetch(base+'/auth/v1/admin/users',{headers});assert.equal(response.status,401);
  }
  assert.equal(calls,0);
  const response=await fetch(base+'/auth/v1/admin/users',{headers:{apikey:m.secretKey}});assert.equal(response.status,200);assert.equal(calls,1);
  assert.equal((await fetch(base+'/unknown',{headers:{apikey:m.secretKey}})).status,404);
  assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('gateway does not follow upstream redirects or leak provider diagnostics',async()=>{
 const {createMaterial,createGateway}=await load();const m=createMaterial();let seen;
 const server=createGateway(m,async(url,options)=>{seen={url,options};return new Response('private provider details',{status:302,headers:{location:'https://redwan.work'}});});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const r=await fetch(base+'/rest/v1/profiles?id=eq.synthetic',{headers:{apikey:m.secretKey},redirect:'manual'});
  assert.equal(r.status,502);assert.equal(r.headers.get('location'),null);assert.ok(!(await r.text()).includes('private provider'));
  assert.equal(seen.options.redirect,'manual');assert.equal(new URL(seen.url).hostname,'rest');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('migration manifest refuses gaps, unsafe names and schema replay',async()=>{
 const {migrationManifest,databaseBootstrapSql}=await load();
 const entries=Array.from({length:40},(_,i)=>({name:`${String(i+1).padStart(4,'0')}_fixture.sql`,sql:'select 1;'}));
 const result=migrationManifest(entries);assert.equal(result.length,40);assert.match(result[0].sha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>migrationManifest(entries.slice(1)));assert.throws(()=>migrationManifest([...entries,entries[0]]));
 assert.throws(()=>migrationManifest([{name:'../0001_fixture.sql',sql:'select 1;'},...entries.slice(1)]));
 const sql=databaseBootstrapSql('a'.repeat(64));
 assert.match(sql,/create role authenticator noinherit login/);assert.match(sql,/create role service_role nologin bypassrls/);
 assert.match(sql,/create schema auth authorization supabase_auth_admin/);assert.doesNotMatch(sql,/drop |truncate |cron\.schedule|pg_net/i);
 assert.throws(()=>databaseBootstrapSql("bad'password"));
});

test('bucket bootstrap creates only two absent synthetic buckets and verifies both',async()=>{
 const {initializeBuckets}=await load();const calls=[],existing=new Set();let destroyed=false;
 const result=await initializeBuckets(cfg,()=>({
  send:async(name,{Bucket})=>{calls.push([name,Bucket]);if(name==='HeadBucketCommand'&&!existing.has(Bucket))throw {$metadata:{httpStatusCode:404}};
   if(name==='CreateBucketCommand')existing.add(Bucket);},destroy:()=>{destroyed=true;}
 }));
 assert.deepEqual(result,{created:2,publicAccess:false});assert.equal(destroyed,true);
 assert.deepEqual(calls,[['HeadBucketCommand','synthetic-private'],['CreateBucketCommand','synthetic-private'],['HeadBucketCommand','synthetic-private'],
  ['HeadBucketCommand','synthetic-public'],['CreateBucketCommand','synthetic-public'],['HeadBucketCommand','synthetic-public']]);
});
test('bucket bootstrap never adopts existing buckets or mistakes access failures for absence',async()=>{
 const {initializeBuckets}=await load();
 for(const status of [200,403,500]){
  let creates=0,destroyed=false;
  await assert.rejects(initializeBuckets(cfg,()=>({send:async(name)=>{
   if(name==='CreateBucketCommand')creates++;
   if(status!==200)throw {$metadata:{httpStatusCode:status}};
  },destroy:()=>{destroyed=true;}})));
  assert.equal(creates,0);assert.equal(destroyed,true);
 }
 let called=false;
 await assert.rejects(initializeBuckets({...cfg,R2_ENDPOINT:'https://remote.invalid'},()=>{called=true;}));
 assert.equal(called,false);
});
test('partial bucket failure retains data and is not reported as successful cleanup',async()=>{
 const {initializeBuckets}=await load();const calls=[];
 await assert.rejects(initializeBuckets(cfg,()=>({send:async(name,{Bucket})=>{
  calls.push([name,Bucket]);
  if(name==='HeadBucketCommand'&&calls.filter(c=>c[1]===Bucket).length===1)throw {$metadata:{httpStatusCode:404}};
  if(name==='CreateBucketCommand'&&Bucket==='synthetic-public')throw Error('Synthetic create failure');
 },destroy:()=>{}})));
 assert.ok(!calls.some(([name])=>name.includes('Delete')));
});
test('migration manifest forbids scheduling and psql shell escapes without modifying SQL',async()=>{
 const {migrationManifest}=await load();
 const entries=Array.from({length:40},(_,i)=>({name:`${String(i+1).padStart(4,'0')}_fixture.sql`,sql:'-- exact source\nselect 1;\n'}));
 assert.equal(migrationManifest(entries)[0].sql,entries[0].sql);
 for(const sql of ['select cron.schedule(\'x\',\'x\',\'x\');','create extension pg_net;',"\\! echo unsafe"]){
  assert.throws(()=>migrationManifest([{...entries[0],sql},...entries.slice(1)]));
 }
});
test('gateway denies hostile origins and browser use of secret keys before upstream',async()=>{
 const {createMaterial,createGateway}=await load();let calls=0;const m=createMaterial();
 const server=createGateway(m,async()=>{calls++;return new Response('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}/auth/v1/admin/users`;
 try{
  assert.equal((await fetch(url,{headers:{apikey:m.secretKey,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(url,{headers:{apikey:m.secretKey,'user-agent':'Mozilla/5.0'}})).status,401);
  const preflight=await fetch(url,{method:'OPTIONS',headers:{origin:cfg.APP_URL}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),cfg.APP_URL);assert.equal(calls,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('public key, private signing key and storage credentials are scoped to the right services',async()=>{
 const {createMaterial,createPlan}=await load();const m=createMaterial();const p=createPlan({candidate,images:images(),material:m});
 const gateway=p.services.find(s=>s.role==='gateway');
 assert.ok(!JSON.stringify(gateway).includes(m.databasePassword));assert.ok(!JSON.stringify(gateway).includes(m.storageSecret));
 const rest=p.services.find(s=>s.role==='rest');assert.ok(!JSON.stringify(rest).includes(m.signingKey.d));
 const app=p.services.find(s=>s.role==='app');assert.ok(!JSON.stringify(app).includes(m.signingKey.d));
 assert.ok(!JSON.stringify(app).includes(m.databasePassword));
});

test('BuildKit app base uses a checked unique local tag and refuses remote builders',async()=>{
 const {prepareAppBase}=await load();const imageId=`sha256:${'a'.repeat(64)}`;const calls=[];
 const execute=(bin,args)=>{calls.push([bin,args]);if(args[0]==='buildx'){
   assert.equal(bin,'docker');assert.deepEqual(args,['buildx','inspect']);
   return 'Name:          default\nDriver:        docker\n\nNodes:\nName:          default\n';}
  if(args[0]==='image')return JSON.stringify([{Id:imageId}]);return '';};
 assert.equal(prepareAppBase(imageId,execute),`localhost/redwan-acceptance-base:${'a'.repeat(64)}`);
 assert.ok(calls.some(([,args])=>args[0]==='tag'&&args[1]===imageId));
 assert.ok(!calls.some(([,args])=>['push','rm','rmi'].includes(args[0])));
 assert.throws(()=>prepareAppBase(imageId,()=> 'Name: remote\nDriver: docker-container\n'),/Local Docker builder required/);
 assert.throws(()=>prepareAppBase(imageId,(bin,args)=>args[0]==='buildx'?'Name: default\nDriver: docker\n':JSON.stringify([{Id:'changed'}])));
});

test('Buildx driver parsing accepts CRLF and rejects missing, ambiguous or nonlocal drivers before image writes',async()=>{
 const {prepareAppBase}=await load();const imageId=`sha256:${'a'.repeat(64)}`;
 for(const output of ['Name: default\nDriver: docker\n','Name: desktop-linux\r\nDriver:    docker\r\n']){
  assert.equal(prepareAppBase(imageId,(bin,args)=>{
   if(args[0]==='buildx'){assert.deepEqual(args,['buildx','inspect']);return output;}
   if(args[0]==='image')return JSON.stringify([{Id:imageId}]);return '';
  }),`localhost/redwan-acceptance-base:${'a'.repeat(64)}`);
 }
 for(const output of ['', 'docker\n', 'Name: default\n', 'Driver: remote\n',
  'Driver: docker-container\n','Driver: kubernetes\n','Driver: docker-extra\n',
  'Driver: docker\nDriver: remote\n','Driver: docker\nDriver: docker\n']){
  const calls=[];
  assert.throws(()=>prepareAppBase(imageId,(bin,args)=>{
   calls.push(args);assert.equal(bin,'docker');assert.deepEqual(args,['buildx','inspect']);return output;
  }),/Local Docker builder required/);
  assert.equal(calls.length,1,'Rejected builder must not inspect or tag images');
 }
 assert.throws(()=>prepareAppBase(imageId,()=>{throw Error('Synthetic inspection failure');}),/Synthetic inspection failure/);
});
