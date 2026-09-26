// Disposable-only bootstrap, no production configuration imports, resets or implicit disposal.
// Read docs/security/DISPOSABLE-AUTH-STORAGE-BOOTSTRAP.md before invoking.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync, createPrivateKey, sign, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { provision, validatePlan, verifyOwnedRun, docker } from './phase-b.mjs';
import { prepareBrowserRunner } from './prepare-browser.mjs';
const require = createRequire(import.meta.url);
const SELF = 'tests/acceptance/disposable-bootstrap.mjs';
const LABEL = 'work.redwan.phase-b';
const ORIGIN = 'http://app:3000';
const ISSUER = 'http://gateway:8000/auth/v1';
const contentAddress = /^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/;
const digestReference = /^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
const hexSecret = () => randomBytes(32).toString('hex');
const hash = text => createHash('sha256').update(text).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const exact = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function createMaterial() {
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
 const common={kid:randomUUID(),alg:'ES256',use:'sig'};
 return {
  signingKey:{...privateKey.export({format:'jwk'}),...common,key_ops:['sign']},
  jwks:{keys:[{...publicKey.export({format:'jwk'}),...common,key_ops:['verify']}]},
  publishableKey:`sb_publishable_${randomBytes(24).toString('base64url')}`,
  secretKey:`sb_secret_${randomBytes(32).toString('base64url')}`,
  databasePassword:hexSecret(),storageAccess:`synthetic-${randomBytes(12).toString('hex')}`,
  storageSecret:hexSecret(),salt:hexSecret()
 };
}
function validateMaterial(m) {
 assert.match(m.publishableKey,/^sb_publishable_[A-Za-z0-9_-]{32}$/);
 assert.match(m.secretKey,/^sb_secret_[A-Za-z0-9_-]{43}$/);
 assert.match(m.databasePassword,/^[a-f0-9]{64}$/);
 assert.match(m.storageAccess,/^synthetic-[a-f0-9]{24}$/);
 assert.match(m.storageSecret,/^[a-f0-9]{64}$/);assert.match(m.salt,/^[a-f0-9]{64}$/);
 assert.equal(m.signingKey.alg,'ES256');assert.equal(m.signingKey.crv,'P-256');
 assert.deepEqual(m.signingKey.key_ops,['sign']);
 const pub=m.jwks.keys[0];assert.equal(m.jwks.keys.length,1);assert.equal(pub.d,undefined);assert.equal(pub.k,undefined);
 assert.equal(pub.x,m.signingKey.x);assert.equal(pub.y,m.signingKey.y);assert.equal(pub.kid,m.signingKey.kid);
 createPrivateKey({key:m.signingKey,format:'jwk'});
}
function gatewayMaterial(m) {
 assert.match(m.publishableKey,/^sb_publishable_[A-Za-z0-9_-]{32}$/);
 assert.match(m.secretKey,/^sb_secret_[A-Za-z0-9_-]{43}$/);
 assert.equal(m.signingKey.alg,'ES256');assert.equal(m.signingKey.crv,'P-256');
 assert.deepEqual(m.signingKey.key_ops,['sign']);
 createPrivateKey({key:m.signingKey,format:'jwk'});
 return {publishableKey:m.publishableKey,secretKey:m.secretKey,signingKey:m.signingKey};
}
function roleJwt(m,role,now) {
 const body=`${encode({alg:'ES256',typ:'JWT',kid:m.signingKey.kid})}.${encode({role,aud:'authenticated',iss:ISSUER,iat:now,exp:now+60})}`;
 return `${body}.${sign('sha256',Buffer.from(body),{key:createPrivateKey({key:m.signingKey,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}
// Exact API-key translation, modeled on the documented self-hosted opaque-key boundary.
// This is a limited Auth/PostgREST test gateway, NOT a full Supabase platform emulator.
// User JWTs are forwarded verbatim for real GoTrue/PostgREST signature verification.
export function translateHeaders(input,m,now=Math.floor(Date.now()/1000)) {
 const key=input.apikey;
 const role=exact(key,m.secretKey)?'service_role':exact(key,m.publishableKey)?'anon':null;
 assert.ok(role,'Invalid API credential');
 assert.ok(!input.cookie,'Application cookies forbidden at gateway');
 assert.ok(!(role==='service_role' && /mozilla/i.test(input['user-agent']||'')),'Server-only key');
 const authorization=input.authorization;
 let bearer;
 if(!authorization || exact(authorization,`Bearer ${key}`)) bearer=`Bearer ${roleJwt(m,role,now)}`;
 else {
  assert.match(authorization,/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const header=JSON.parse(Buffer.from(authorization.slice(7).split('.')[0],'base64url'));
  assert.equal(header.alg,'ES256');assert.equal(header.kid,m.signingKey.kid);
  assert.ok(!header.crit,'Unsupported critical headers');
  bearer=authorization;
 }
 const headers={authorization:bearer};
 for(const name of ['content-type','accept','prefer','range','range-unit','if-match','if-none-match','x-client-info','x-supabase-api-version']) {
  if(typeof input[name]==='string')headers[name]=input[name];
 }
 return headers;
}
export function createGateway(m,transport=fetch) {
 gatewayMaterial(m);
 return http.createServer(async(req,res)=>{
  const refuse=(status)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Disposable gateway refused request.'}));};
  try {
   if(req.headers.origin && req.headers.origin!==ORIGIN)return refuse(403);
   if(req.headers.origin===ORIGIN) {
    res.setHeader('access-control-allow-origin',ORIGIN);res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-headers','apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer, range, range-unit');
    res.setHeader('access-control-allow-methods','GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
   }
   if(req.method==='OPTIONS') {res.writeHead(204);return res.end();}
   if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method))return refuse(405);
   if(!req.url?.startsWith('/') || req.url.startsWith('//') || /\\|%5c|%2f|%2e/i.test(req.url))return refuse(400);
   const url=new URL(req.url,'http://gateway:8000');
   // No duplicate credential headers, even two identical ones.
   for(const name of ['apikey','authorization','cookie']) {
    if(req.rawHeaders.filter((h,i)=>i%2===0 && h.toLowerCase()===name).length>1)return refuse(401);
   }
   if(url.searchParams.has('apikey'))return refuse(401);
   const route=url.pathname.startsWith('/auth/v1/')?{prefix:'/auth/v1',upstream:'http://auth:9999'}:
    url.pathname.startsWith('/rest/v1/')?{prefix:'/rest/v1',upstream:'http://rest:3000'}:null;
   if(!route)return refuse(404);
   let headers;try{headers=translateHeaders(req.headers,m);}catch{return refuse(401);}
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)return refuse(413);chunks.push(chunk);}
   const upstream=route.upstream+url.pathname.slice(route.prefix.length)+url.search;
   const response=await transport(upstream,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(30000),
    ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   if(response.status>=300 && response.status<400 && response.status!==304) {await response.body?.cancel();return refuse(502);}
   const forwarded={'cache-control':'no-store'};
   for(const name of ['content-type','content-range','range-unit','preference-applied']){
    const value=response.headers.get(name);if(value)forwarded[name]=value;
   }
   // Preserve real Auth/PostgREST JSON responses, but never log them.
   const responseChunks=[];let responseSize=0;
   if(response.body)for await(const chunk of response.body) {
    responseSize+=chunk.length;
    if(responseSize>4*1024*1024)return refuse(502);
    responseChunks.push(chunk);
   }
   const body=Buffer.concat(responseChunks);
   res.writeHead(response.status,forwarded);res.end(req.method==='HEAD'?undefined:body);
  }catch{if(!res.headersSent)refuse(502);else res.destroy();}
 });
}

export function createPlan({candidate,images,material:m}) {
 assert.match(candidate,/^[a-f0-9]{40}$/);validateMaterial(m);
 for(const role of ['database','auth','rest','storage','runner','app'])assert.match(images[role],contentAddress);
 const acceptance={DISPOSABLE_AUTH_CI:'true',NEXT_PUBLIC_SUPABASE_URL:'http://gateway:8000',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:m.publishableKey,SUPABASE_SECRET_KEY:m.secretKey,
  APP_URL:ORIGIN,R2_ENDPOINT:'http://storage:9000',R2_PRIVATE_BUCKET:'synthetic-private',R2_PUBLIC_BUCKET:'synthetic-public',
  R2_PRIVATE_ACCESS_KEY_ID:m.storageAccess,R2_PRIVATE_SECRET_ACCESS_KEY:m.storageSecret,
  R2_PUBLIC_ACCESS_KEY_ID:m.storageAccess,R2_PUBLIC_SECRET_ACCESS_KEY:m.storageSecret,LEAD_IP_HASH_SALT:m.salt};
 const tmp=(size=64,uid=1000)=>`/tmp:rw,nosuid,nodev,size=${size}m,uid=${uid},gid=${uid},mode=0700`;
 const service=(role,env,command,user,tmpfs,memoryMB=512)=>({role,image:images[role],env,command,user,tmpfs,memoryMB});
 const runner=service('runner',{},['node','-e','setInterval(()=>{},60000)'],'1000:1000',[tmp(512)],2048);
 const gateway={...service('gateway',{
  BOOTSTRAP_PUBLISHABLE_KEY:m.publishableKey,BOOTSTRAP_SECRET_KEY:m.secretKey,
  // The gateway never receives database or object-storage credentials.
  BOOTSTRAP_MATERIAL:JSON.stringify(gatewayMaterial(m))
 },['node',SELF,'gateway'],'1000:1000',[tmp()]),image:images.runner};
 const plan={version:1,candidate,acceptance,services:[
  service('database',{POSTGRES_USER:'postgres',POSTGRES_DB:'postgres',POSTGRES_PASSWORD:m.databasePassword,
   PGDATA:'/var/lib/postgresql/data/pgdata',POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256'},
   ['postgres','-c','listen_addresses=*','-c','unix_socket_directories=/tmp','-c','log_statement=none'],
   '999:999',['/var/lib/postgresql/data:rw,nosuid,nodev,size=1024m,uid=999,gid=999,mode=0700',tmp(64,999)],2048),
  runner,
  service('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',PORT:'9999',API_EXTERNAL_URL:ISSUER,
   GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${m.databasePassword}@database:5432/postgres`,
   DATABASE_URL:`postgres://supabase_auth_admin:${m.databasePassword}@database:5432/postgres`,
   GOTRUE_SITE_URL:ORIGIN,GOTRUE_URI_ALLOW_LIST:`${ORIGIN}/**`,GOTRUE_DISABLE_SIGNUP:'true',
   // v2.196.0 declares this field required. An explicitly empty value is NOT a shared key.
   // GOTRUE_JWT_KEYS supplies the only signing key; ValidMethods derives ES256 from it.
   GOTRUE_JWT_SECRET:'',GOTRUE_JWT_KEYS:JSON.stringify([m.signingKey]),GOTRUE_JWT_KEY_ID:m.signingKey.kid,
   GOTRUE_JWT_ISSUER:ISSUER,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
   GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',
   GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',
   GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1',
   GOTRUE_SMTP_ADMIN_EMAIL:'noreply@example.test',GOTRUE_LOG_LEVEL:'error'},[], '1000:1000',[tmp()]),
  service('rest',{PGRST_DB_URI:`postgres://authenticator:${m.databasePassword}@database:5432/postgres`,
   PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:JSON.stringify(m.jwks),PGRST_JWT_AUD:'authenticated',
   PGRST_SERVER_PORT:'3000',PGRST_DB_USE_LEGACY_GUCS:'false'},[],'1000:1000',[tmp()]),
  service('storage',{MINIO_ROOT_USER:m.storageAccess,MINIO_ROOT_PASSWORD:m.storageSecret,MINIO_API_CORS_ALLOW_ORIGIN:ORIGIN},
   ['server','/data','--address',':9000','--console-address',':9001','--anonymous'],'65532:65532',
   ['/data:rw,nosuid,nodev,size=1024m,uid=65532,gid=65532,mode=0700',tmp(64,65532)],1024),
  gateway,
  service('app',{...acceptance,NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:ORIGIN,HOSTNAME:'app',PORT:'3000',
   NEXT_TELEMETRY_DISABLED:'1'},['node','node_modules/next/dist/bin/next','start','--hostname','app','--port','3000'],
   '1000:1000',[tmp(128)],2048)
 ]};
 return validatePlan(plan);
}

// Fresh PostgreSQL-only substrate for this app's disposable Auth tests. Not a production migration.
// GoTrue creates its own real auth.users/session/identity schema after this setup.
export function databaseBootstrapSql(password) {
 assert.match(password,/^[a-f0-9]{64}$/);
 return `begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password '${password}';
create role supabase_auth_admin noinherit login password '${password}';
grant anon,authenticated,service_role to authenticator;
create schema auth authorization supabase_auth_admin;
grant usage on schema public to anon,authenticated,service_role,supabase_auth_admin;
grant create on schema public to supabase_auth_admin;
alter role supabase_auth_admin set search_path to auth,public;
create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role(),auth.jwt() to anon,authenticated,service_role;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
-- Match the initial Supabase API grants BEFORE app migrations narrow/revoke them.
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
create schema bootstrap_internal;
revoke all on schema bootstrap_internal from public,anon,authenticated,service_role;
create table bootstrap_internal.migrations(name text primary key,sha256 text not null);
commit;`;
}
// GoTrue's historical migrations replace uid()/role() with legacy-GUC readers.
// Restore the current PostgREST claims contract AFTER GoTrue finishes migrating.
export function authClaimsSql() {
 return `create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role(),auth.jwt() to anon,authenticated,service_role;`;
}
// Test control installed only by this fresh-database bootstrap, never an app migration.
// It can age one unfinished synthetic import; no general table UPDATE grant.
export function acceptanceFixtureSql() {
 return `create function public.acceptance_expire_recovery_import(p_actor uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare changed integer;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role'
 then raise exception 'Acceptance fixture denied'; end if;
 if not exists(select 1 from auth.users where id=p_actor and email like '%@example.test')
 then raise exception 'Synthetic actor required'; end if;
 update public.recovery_imports set created_at=now()-interval '25 hours'
 where id=p_id and actor=p_actor and result is null and created_at > now()-interval '24 hours';
 get diagnostics changed = row_count;
 return changed=1;
end $$;
revoke all on function public.acceptance_expire_recovery_import(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acceptance_expire_recovery_import(uuid,uuid) to service_role;`;
}
export function migrationManifest(entries) {
 const ordered=[...entries].sort((a,b)=>a.name.localeCompare(b.name));
 assert.equal(ordered.length,40,'Expected reviewed migrations 0001 through 0040');
 return ordered.map((e,i)=>{
  assert.match(e.name,new RegExp(`^${String(i+1).padStart(4,'0')}_[a-z0-9_]+\\.sql$`));
  assert.ok(typeof e.sql==='string' && e.sql.trim(),'Empty migration');
  // Do not add scheduler/network capabilities or psql shell/file escapes during bootstrap.
  assert.ok(!/cron\s*\.\s*schedule|create\s+extension[^;]*(?:pg_net|pg_cron)|^\s*\\/im.test(e.sql),'Unsafe bootstrap migration');
  return {...e,sha256:hash(e.sql)};
 });
}

function privateJson(file,value) {
 fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
}
function readPrivate(file) {
 const st=fs.lstatSync(file);assert.ok(st.isFile() && !st.isSymbolicLink() && !(st.mode&0o077),'Private regular file required');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function command(bin,args,options={}) {
 try {return execFileSync(bin,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:32*1024*1024,...options});}
 catch {throw Error(`Disposable bootstrap ${bin} operation failed; no provider diagnostics published.`);}
}
// BuildKit cannot use a bare local image ID in FROM. A unique local-only tag is
// checked against that ID before and after building; runtime still uses image IDs.
export function prepareAppBase(imageId,execute=command) {
 assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
 // buildx inspect has no --format option. Require exactly one top-level
 // Driver field from its documented text output, with LF or CRLF line endings.
 const drivers=execute('docker',['buildx','inspect']).split(/\r?\n/).filter(line=>line.startsWith('Driver:'));
 assert.ok(drivers.length===1 && /^Driver:[ \t]+docker[ \t]*$/.test(drivers[0]),'Local Docker builder required');
 const tag=`localhost/redwan-acceptance-base:${imageId.slice(7)}`;
 const inspect=ref=>JSON.parse(execute('docker',['image','inspect',ref]))[0].Id;
 assert.equal(inspect(imageId),imageId);
 execute('docker',['tag',imageId,tag]);
 assert.equal(inspect(tag),imageId,'Local build reference changed');
 return tag;
}
export function assertPartialOwnership(state,d=docker) {
 assert.match(state.runId,/^test-run-[a-f0-9-]{36}$/);
 const network=JSON.parse(d('network','inspect',state.networkId))[0];
 assert.equal(network.Id,state.networkId);assert.equal(network.Internal,true);assert.equal(network.Driver,'bridge');
 assert.equal(network.Labels?.[LABEL],state.runId);
 assert.deepEqual(Object.keys(network.Containers||{}).sort(),state.services.map(s=>s.id).sort());
 for(const service of state.services) {
  const c=JSON.parse(d('container','inspect',service.id))[0];
  assert.equal(c.Id,service.id);assert.equal(c.Image,service.imageId);assert.equal(c.State.Running,true);
  assert.equal(c.Config.Labels?.[LABEL],state.runId);assert.equal(c.Config.Labels?.[`${LABEL}.role`],service.role);
  assert.ok(!c.HostConfig.Privileged && !c.HostConfig.PublishAllPorts && !c.HostConfig.Binds?.length && !c.HostConfig.Devices?.length);
  assert.ok(!c.HostConfig.CapAdd?.length && c.HostConfig.CapDrop?.includes('ALL') && c.HostConfig.SecurityOpt?.includes('no-new-privileges'));
  assert.equal(Object.keys(c.HostConfig.PortBindings||{}).length,0);
  assert.ok(!c.HostConfig.ExtraHosts?.length);assert.deepEqual(c.HostConfig.Dns,['127.0.0.1']);
  assert.ok((c.Mounts||[]).every(m=>m.Type==='tmpfs'));
  const nets=Object.values(c.NetworkSettings.Networks||{});assert.equal(nets.length,1);assert.equal(nets[0].NetworkID,state.networkId);
 }
}
function ownedExec(state,role,args,input) {
 assertPartialOwnership(state);
 const service=state.services.find(s=>s.role===role);assert.ok(service,'Missing owned role');
 return command('docker',['exec','-i',service.id,...args],{input});
}
function sql(state,text) {
 return ownedExec(state,'database',['psql','-h','/tmp','-U','postgres','-d','postgres','-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],text).trim();
}
function waitFor(check,label) {
 const deadline=Date.now()+90000;
 while(Date.now()<deadline) {
  try {if(check())return;}catch{}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
 }
 throw Error(`Disposable readiness timeout: ${label}`);
}
function health(state,url) {
 const permitted=['http://auth:9999/health','http://storage:9000/minio/health/ready','http://app:3000/login'];
 assert.ok(permitted.includes(url));
 const script=`fetch(${JSON.stringify(url)},{redirect:'manual',signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`;
 waitFor(()=>{ownedExec(state,'runner',['node','-e',script]);return true;},'internal-service');
}

export async function initializeBuckets(cfg,makeClient) {
 assert.equal(cfg.R2_ENDPOINT,'http://storage:9000');assert.equal(cfg.APP_URL,ORIGIN);
 assert.equal(cfg.R2_PRIVATE_BUCKET,'synthetic-private');assert.equal(cfg.R2_PUBLIC_BUCKET,'synthetic-public');
 const sdk=makeClient?null:require('@aws-sdk/client-s3');
 const client=makeClient?makeClient():new sdk.S3Client({endpoint:cfg.R2_ENDPOINT,region:'auto',forcePathStyle:true,maxAttempts:1,
  credentials:{accessKeyId:cfg.R2_PRIVATE_ACCESS_KEY_ID,secretAccessKey:cfg.R2_PRIVATE_SECRET_ACCESS_KEY}});
 const send=(name,value)=>makeClient?client.send(name,value):client.send(new sdk[name](value));
 try {
  for(const Bucket of [cfg.R2_PRIVATE_BUCKET,cfg.R2_PUBLIC_BUCKET]) {
   let absent=false;
   try{await send('HeadBucketCommand',{Bucket});}
   catch(error){if(error?.$metadata?.httpStatusCode===404)absent=true;else throw Error('Bucket existence check failed');}
   assert.ok(absent,'Refuse to adopt an existing bucket');
   await send('CreateBucketCommand',{Bucket});
   await send('HeadBucketCommand',{Bucket});
   // Both buckets remain private. No bucket policy, no wildcard grants or CORS rewrite.
  }
 }finally{client.destroy();}
 return {created:2,publicAccess:false};
}

export function bootstrapPrepared({planPath,statePath,materialPath,manifest,provisioner=provision}) {
 const plan=readPrivate(planPath),m=readPrivate(materialPath);validateMaterial(m);
 const regenerated=createPlan({candidate:plan.candidate,material:m,
  images:Object.fromEntries(plan.services.filter(s=>s.role!=='gateway').map(s=>[s.role,s.image]))});
 assert.deepEqual(plan,regenerated,'Plan modified outside the generated bootstrap contract');
 const migrations=migrationManifest(manifest);
 let phase='resource-creation';
 try {
  const result=provisioner(plan,statePath,docker,({service,state})=>{
   phase=`start-${service.role}`;
   if(service.role==='database') {
    // The entrypoint's temporary initialization server has no TCP listener.
    waitFor(()=>{ownedExec(state,'database',['pg_isready','-h','127.0.0.1','-U','postgres']);return true;},'database');
    assert.equal(sql(state,"select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');"),'0','Database must be freshly empty');
    sql(state,databaseBootstrapSql(m.databasePassword));
   }
   if(service.role==='auth') {
    health(state,'http://auth:9999/health');
    assert.equal(sql(state,"select count(*) from auth.users;"),'0','Auth fixtures must not pre-exist');
    sql(state,authClaimsSql());
    assert.equal(sql(state,`begin; set local role authenticated;
      set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
      select auth.uid()::text || ':' || auth.role(); rollback;`),
      '11111111-1111-4111-8111-111111111111:authenticated','Caller claims helpers failed');
    phase='application-schema';
    for(const migration of migrations) {
     // Read from the exact git candidate. No source editing, no resets, no replay against existing schema.
     sql(state,`begin;\n${migration.sql}\ninsert into bootstrap_internal.migrations(name,sha256) values('${migration.name}','${migration.sha256}');\ncommit;`);
    }
    assert.equal(sql(state,'select count(*) from bootstrap_internal.migrations;'),'40');
    sql(state,acceptanceFixtureSql());
   }
   if(service.role==='storage') {
    health(state,'http://storage:9000/minio/health/ready');phase='synthetic-buckets';
    ownedExec(state,'runner',['node',SELF,'buckets'],JSON.stringify(plan.acceptance));
   }
   if(service.role==='gateway') {
    phase='gateway-authority-and-jwks';
    const script=`import {probeGateway} from './tests/acceptance/environment-preflight.mjs';
      import fs from 'node:fs';
      const cfg=JSON.parse(fs.readFileSync(0,'utf8'));
      const request=(url,options)=>{if(new URL(url).origin!=='http://gateway:8000')throw Error('destination');return fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(3000)});};
      try{await probeGateway(cfg,request);}catch{process.exit(1);}`;
    waitFor(()=>{ownedExec(state,'runner',['node','--input-type=module','-e',script],JSON.stringify(plan.acceptance));return true;},'gateway');
   }
   if(service.role==='app')health(state,'http://app:3000/login');
  });
  const state=readPrivate(statePath);verifyOwnedRun(state);
  privateJson(`${statePath}.bootstrap-result.json`,{candidate:plan.candidate,runId:result.runId,state:'bootstrapped-not-accepted',
   migrations:migrations.map(({name,sha256})=>({name,sha256})),buckets:2,preflight:'not-executed',acceptanceAE:'not-executed'});
  return {candidate:plan.candidate,runId:result.runId,state:'bootstrapped-not-accepted'};
 }catch{
  if(!fs.existsSync(`${statePath}.bootstrap-result.json`))privateJson(`${statePath}.bootstrap-result.json`,{
   candidate:plan.candidate,state:'failed-retained',phase,acceptanceAE:'not-executed'});
  throw Error(`Disposable bootstrap stopped at ${phase}; retain exact inventory for separately approved disposal.`);
 }
}

function committedMigrations(candidate) {
 assert.match(candidate,/^[a-f0-9]{40}$/);
 assert.equal(command('git',['rev-parse','HEAD']).trim(),candidate,'Candidate changed');
 assert.equal(command('git',['status','--porcelain']).trim(),'','Clean checkout required');
 const names=command('git',['ls-tree','--name-only',`${candidate}:supabase/migrations`]).trim().split('\n');
 return migrationManifest(names.map(name=>({name,sql:command('git',['show',`${candidate}:supabase/migrations/${name}`])})));
}

// images.json contains reviewed registry digests for node, database, auth, rest and storage.
// Stock database image contract: official PostgreSQL17 Debian, UID999, contrib/pgcrypto.
export function prepareBootstrap(images,privateDir) {
 assert.deepEqual(Object.keys(images).sort(),['auth','database','node','rest','storage']);
 for(const role of ['node','database','auth','rest','storage'])assert.match(images[role],digestReference);
 assert.match(images.node,/^(?:docker\.io\/library\/)?node(?:[:@])/);
 assert.match(images.database,/^(?:docker\.io\/library\/)?postgres(?:[:@])/);
 assert.match(images.auth,/^supabase\/gotrue(?:[:@])/);assert.match(images.rest,/^postgrest\/postgrest(?:[:@])/);
 assert.match(images.storage,/^cgr\.dev\/chainguard\/minio@/);
 assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT,'Local Docker only');
 const candidate=command('git',['rev-parse','HEAD']).trim();const migrations=committedMigrations(candidate);
 const relative=path.relative(process.cwd(),path.resolve(privateDir));
 assert.ok(relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative),'Private output must be outside checkout');
 fs.mkdirSync(privateDir,{mode:0o700});
 const material=createMaterial();privateJson(path.join(privateDir,'material.json'),material);
 privateJson(path.join(privateDir,'migrations.json'),migrations);
 // Pull only reviewed content-addressed references during preparation, not isolated runtime.
 for(const image of Object.values(images))command('docker',['pull',image],{timeout:600000});
 const runner=prepareBrowserRunner({candidate,baseImage:images.node,manifestPath:path.join(privateDir,'runner.json')});
 const appBase=prepareAppBase(runner.imageId);
 // Build-time public configuration only. Server secret keys are supplied at runtime, not baked in.
 const buildDir=path.join(privateDir,'app-build');fs.mkdirSync(buildDir,{mode:0o700});
 const dockerfile=`FROM ${appBase}\nUSER root\nWORKDIR /work\nENV NEXT_PUBLIC_SITE_URL=${ORIGIN} NEXT_PUBLIC_SUPABASE_URL=http://gateway:8000 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${material.publishableKey} R2_ENDPOINT=http://storage:9000 R2_PRIVATE_BUCKET=synthetic-private\nRUN chmod -R u+w /work && npm run build\nUSER 1000:1000\nCMD ["node","node_modules/next/dist/bin/next","start","--hostname","app","--port","3000"]\n`;
 fs.writeFileSync(path.join(buildDir,'Dockerfile'),dockerfile,{mode:0o600});
 const log=fs.openSync(path.join(privateDir,'app-build.log'),'wx',0o600);
 try {command('docker',['build','--pull=false','--iidfile',path.join(privateDir,'app-image-id'),buildDir],{timeout:1200000,stdio:['pipe',log,log]});}
 finally{fs.closeSync(log);}
 assert.equal(JSON.parse(command('docker',['image','inspect',appBase]))[0].Id,runner.imageId,'App base changed during build');
 const app=fs.readFileSync(path.join(privateDir,'app-image-id'),'utf8').trim();assert.match(app,/^sha256:[a-f0-9]{64}$/);
 const plan=createPlan({candidate,images:{...images,runner:runner.imageId,app},material});
 privateJson(path.join(privateDir,'plan.json'),plan);
 privateJson(path.join(privateDir,'preparation.json'),{candidate,images,runner:runner.imageId,app,appBase,recipeSha256:hash(dockerfile),
  phase:'prepared-not-provisioned',plannedContainers:7,plannedNetworks:1});
 return {candidate,phase:'prepared-not-provisioned',plannedContainers:7,plannedNetworks:1};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  const [action,input,output]=process.argv.slice(2);
  if(action==='gateway') {
   const m=JSON.parse(process.env.BOOTSTRAP_MATERIAL);
   createGateway(m).listen(8000,'0.0.0.0');
  }else if(action==='buckets') {
   const cfg=JSON.parse(fs.readFileSync(0,'utf8'));await initializeBuckets(cfg);
  }else if(action==='prepare') {
   console.log(JSON.stringify(prepareBootstrap(JSON.parse(fs.readFileSync(input,'utf8')),output)));
  }else if(action==='start') {
   // Starting seven containers and one network needs owner approval for this exact plan.
   const plan=readPrivate(path.join(input,'plan.json'));
   assert.equal(output,`START-${plan.candidate}`,'Exact candidate start confirmation required');
   console.log(JSON.stringify(bootstrapPrepared({planPath:path.join(input,'plan.json'),materialPath:path.join(input,'material.json'),
    statePath:path.join(input,'state.json'),manifest:committedMigrations(plan.candidate)})));
  }else throw Error('Unknown bootstrap action');
 }catch{console.error('Disposable bootstrap failed; resources, if any, remain recorded. No production access or acceptance claim.');process.exitCode=1;}
}
