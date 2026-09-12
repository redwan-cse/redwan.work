import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';

// CI metadata stays in this parent; builds/servers receive disposable keys only.
if(process.argv[2]!=='child'){
 for(const file of ['.env','.env.local','.env.production','.env.production.local'])assert.equal(existsSync(file),false);
 const status=JSON.parse(readFileSync(process.env.AUTH_STATUS_FILE,'utf8')),api=new URL(status.API_URL);
 assert.ok(['localhost','127.0.0.1'].includes(api.hostname)&&api.protocol==='http:'&&api.port==='54321');
 assert.ok(status.PUBLISHABLE_KEY.startsWith('sb_publishable_')&&status.SECRET_KEY.startsWith('sb_secret_'));
 const workspace=process.cwd(),scratch=mkdtempSync(join(tmpdir(),'wave-browser-')),baseline=join(scratch,'baseline');
 const report={baseline:null,candidate:null,complete:false};
 try{
  mkdirSync(baseline);
  execFileSync('git',['archive','--output='+join(scratch,'baseline.tar'),'8d0bd70f5f155ea1791265507274ecb8a2c56f0b'],{stdio:'ignore'});
  execFileSync('tar',['-xf',join(scratch,'baseline.tar'),'-C',baseline],{stdio:'ignore'});
  assert.equal(createHash('sha256').update(readFileSync(join(baseline,'package-lock.json'))).digest('hex'),createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'));
  execFileSync('cp',['-al',join(workspace,'node_modules'),join(baseline,'node_modules')],{stdio:'ignore'});
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','BROWSER_TOOLS_DIR','CI'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SITE_URL:'http://localhost:3399',NEXT_PUBLIC_SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:status.SECRET_KEY,LEAD_IP_HASH_SALT:randomBytes(32).toString('hex'),TURNSTILE_SECRET_KEY:'synthetic',NEXT_PUBLIC_TURNSTILE_SITE_KEY:'synthetic',DISPOSABLE_AUTH_CI:'true'});
  for(const mode of ['baseline','candidate']){
   const resultPath=join(scratch,mode+'.json');
   const child=spawnSync(process.execPath,[resolve('tests/wave-one-browser.mjs'),'child'],{env:{...env,WAVE_ROOT:mode==='baseline'?baseline:workspace,WAVE_RESULT:resultPath},encoding:'utf8',maxBuffer:1024*1024});
   if(existsSync(resultPath))report[mode]=JSON.parse(readFileSync(resultPath,'utf8'));
   if(child.status!==0)break;
  }
  report.complete=Boolean(report.baseline?.infrastructure&&report.candidate?.infrastructure&&report.baseline?.cleanup&&report.candidate?.cleanup);
 }catch{report.complete=false;}
 finally{writeFileSync(join(process.env.RUNNER_TEMP,'wave-browser-result.json'),JSON.stringify(report),{mode:0o600});rmSync(scratch,{recursive:true,force:true});}
 const groups=['A01','I01','I02'];
 const red=report.complete&&groups.every(k=>report.baseline[k].pass>0&&report.baseline[k].fail>0);
 const green=report.complete&&groups.every(k=>report.candidate[k].pass>0&&report.candidate[k].fail===0);
 console.log('Baseline real-browser regression reproduction: '+(red?'confirmed':'not established'));
 console.log('Candidate real-browser and persistence acceptance: '+(green?'PASS':'FAIL'));
 process.exit(red&&green?0:1);
}

assert.equal(process.env.DISPOSABLE_AUTH_CI,'true');
const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL),origin='http://localhost:3399',root=process.env.WAVE_ROOT;
assert.ok(['localhost','127.0.0.1'].includes(api.hostname)&&api.port==='54321'&&api.protocol==='http:');
const {chromium}=createRequire(resolve(process.env.BROWSER_TOOLS_DIR,'package.json'))('playwright');
const admin=createClient(api.origin,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const report={A01:{pass:0,fail:0},I01:{pass:0,fail:0},I02:{pass:0,fail:0},infrastructure:false,cleanup:false,phase:'startup'};
const safe=r=>{if(r.error)throw Error('Synthetic service assertion failed');return r.data;};
const hash=s=>createHash('sha256').update(s).digest('hex');
const email='wave-'+randomBytes(12).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url'),rateHashes=new Set();
let user,project,browser,server,ipIndex=0;
const preload=join(mkdtempSync(join(tmpdir(),'wave-preload-')),'network.mjs');
writeFileSync(preload,`const realFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.href==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Promise.resolve(new Response(JSON.stringify({success:true}),{status:200}));if(!['localhost','127.0.0.1'].includes(u.hostname)||!['54321','3399'].includes(u.port)||u.protocol!=='http:')throw Error('External fetch blocked in disposable acceptance');return realFetch(input,init);};`,{mode:0o600});
async function check(group,fn){try{await fn();report[group].pass++;}catch{report[group].fail++;}}
function ip(){const value='192.0.2.'+(++ipIndex);rateHashes.add(hash(process.env.LEAD_IP_HASH_SALT+value));return value;}
async function context(width=1280){
 const c=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Dhaka',serviceWorkers:'block'});
 await c.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.href==='https://challenges.cloudflare.com/turnstile/v0/api.js')return route.fulfill({contentType:'application/javascript',body:"window.turnstile={reset(){window.onTurnstileSuccess?.('synthetic-'+crypto.randomUUID())}};const timer=setInterval(()=>{if(window.onTurnstileSuccess){clearInterval(timer);window.turnstile.reset();}},25);"});
  if(![origin,api.origin].includes(u.origin))return route.abort();
  if(u.origin===origin&&u.pathname==='/api/contact'&&route.request().method()==='POST'){
   const f=await new Response(route.request().postDataBuffer(),{headers:{'Content-Type':route.request().headers()['content-type']}}).formData();
   const token=f.get('cf-turnstile-response');if(typeof token==='string')rateHashes.add(hash(token));
   return route.continue({headers:{...route.request().headers(),'cf-connecting-ip':ip()}});
  }
  return route.continue();
 });
 return c;
}
async function fill(page){
 await page.goto(origin+'/contact');await page.locator('#name').fill('Synthetic Contract');await page.locator('#email').fill(email);
 await page.locator('#projectSummary').fill('Synthetic approved-wave contact verification with no customer data.');
 await page.locator('[id="service-Consulting"]').click();await page.locator('#urgency').click();await page.getByRole('option',{name:'Flexible',exact:true}).click();await page.locator('#gdprConsent').click();
}
async function rows(){return safe(await admin.from('leads').select('id,nda_required,budget_min,budget_max,consent_at,attachments').eq('email',email));}
async function post(entries){
 const f=new FormData();for(const [k,v] of [['name','Synthetic'],['email',email],['projectSummary','Synthetic HTTP contract acceptance.'],['gdprConsent','true'],...entries])f.append(k,v);
 const token=randomUUID();f.set('cf-turnstile-response',token);rateHashes.add(hash(token));
 return fetch(origin+'/api/contact',{method:'POST',body:f,headers:{origin,host:'localhost:3399','cf-connecting-ip':ip()}});
}
try{
 report.phase='fixtures';user=safe(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:'client'}})).user.id;
 safe(await admin.from('profiles').update({role:'client',is_active:true}).eq('id',user));
 project=safe(await admin.from('projects').insert({client_id:user,name:'Synthetic wave project'}).select('id').single()).id;
 // Each source tree must launch its own Next package, or AsyncLocalStorage stores diverge.
 report.phase='build';const build=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build'],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:20*1024*1024});if(build.status!==0)throw Error('Build failed');
 report.phase='server';server=spawn(process.execPath,['--import',preload,join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3399'],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:'ignore'});
 let ready=false;for(let i=0;i<150;i++){if(server.exitCode!==null)break;try{const r=await fetch(origin+'/login');await r.text();if(r.ok){ready=true;break;}}catch{}await delay(200);}assert.ok(ready);browser=await chromium.launch({headless:true});
 report.phase='A01';
 const destinations=[['/portal','/portal'],['/portal/projects/'+project,'/portal/projects/'+project],['/portal?filter=open-items','/portal?filter=open-items'],['/portal/../portal?filter=active','/portal?filter=active'],['//outside.invalid','/portal'],['/'+String.fromCharCode(9)+'/outside.invalid','/portal'],['/'+String.fromCharCode(10)+'/outside.invalid','/portal'],['/'+String.fromCharCode(92)+'outside.invalid','/portal'],['/portal/..//outside.invalid','/portal'],['/%2foutside.invalid','/portal'],['/portal%09','/portal'],['/admin','/portal']];
 for(const [next,expected] of destinations)await check('A01',async()=>{
  const c=await context();try{const p=await c.newPage();p.setDefaultTimeout(10000);await p.goto(origin+'/login?next='+encodeURIComponent(next));await p.locator('#email').fill(email);await p.locator('#password').fill(password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL(u=>u.pathname!=='/login');assert.equal(p.url(),origin+expected);}finally{await c.close();}
 });
 report.phase='I01';
 for(const width of [1280,390])for(const checked of [false,true])await check('I01',async()=>{
  const before=await rows(),c=await context(width);try{const p=await c.newPage();p.setDefaultTimeout(10000);await fill(p);if(checked)await p.locator('#ndaConfidentiality').click();await p.getByRole('button',{name:'Send Request',exact:true}).click();await p.getByText('Your Ticket ID:',{exact:false}).waitFor();const after=await rows();assert.equal(after.length,before.length+1);const row=after.find(r=>!before.some(b=>b.id===r.id));assert.equal(row.nda_required,checked);assert.equal(row.budget_min,null);assert.equal(row.budget_max,null);assert.deepEqual(row.attachments,[]);assert.ok(Number.isFinite(Date.parse(row.consent_at)));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}finally{await c.close();}
 });
 for(const values of [['Yes - NDA or strict confidentiality required'],['true'],['false'],[''],[],['unknown'],['true','true'],['','']])await check('I01',async()=>{
  const before=await rows(),r=await post(values.map(v=>['ndaConfidentiality',v]));const accepted=values.length<=1&&(values.length===0||['Yes - NDA or strict confidentiality required','true','false',''].includes(values[0]));assert.equal(r.status,accepted?200:400);const after=await rows();assert.equal(after.length,before.length+(accepted?1:0));if(accepted)assert.equal(after.find(r=>!before.some(b=>b.id===r.id)).nda_required,['Yes - NDA or strict confidentiality required','true'].includes(values[0]));
 });
 report.phase='I02';
 for(const [min,max] of [['0','0'],['10','10'],['0','10000000']])await check('I02',async()=>{
  const before=await rows(),c=await context();try{const p=await c.newPage();await fill(p);await p.locator('#budgetMin').fill(min);await p.locator('#budgetMax').fill(max);await p.getByRole('button',{name:'Send Request',exact:true}).click();await p.getByText('Your Ticket ID:',{exact:false}).waitFor();const after=await rows();assert.equal(after.length,before.length+1);const row=after.find(r=>!before.some(b=>b.id===r.id));assert.deepEqual([row.budget_min,row.budget_max],[Number(min),Number(max)]);}finally{await c.close();}
 });
 for(const [min,max] of [['1.5','2'],['1e3','2000'],['','1'],['2','1'],['0','10000001']])await check('I02',async()=>{
  const before=await rows(),c=await context(390);try{const p=await c.newPage();await fill(p);let sends=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/contact')sends++;});await p.locator('#budgetMin').fill(min);await p.locator('#budgetMax').fill(max);await p.getByRole('button',{name:'Send Request',exact:true}).click();await p.getByRole('dialog').waitFor({timeout:4000});assert.equal(sends,0);assert.equal((await rows()).length,before.length);assert.equal(await p.locator('#budgetMin').inputValue(),min);assert.equal(await p.locator('#budgetMax').inputValue(),max);}finally{await c.close();}
 });
 for(const [min,max] of [['1.5','2'],['1e3','2000'],['100USD','200'],['-1','0'],['+1','2'],['2','1'],['','1'],['1',''],['0','10000001']])await check('I02',async()=>{const before=await rows();assert.equal((await post([['budgetMin',min],['budgetMax',max]])).status,400);assert.equal((await rows()).length,before.length);});
 report.infrastructure=true;
}catch{report.infrastructure=false;}
finally{
 try{
  if(browser)await browser.close();
  if(server?.pid&&server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill('SIGTERM');await Promise.race([done,delay(5000)]);if(server.exitCode===null&&server.signalCode===null){server.kill('SIGKILL');await done;}}
  safe(await admin.from('leads').delete().eq('email',email));assert.equal((await rows()).length,0);
  if(rateHashes.size){safe(await admin.from('rate_limits').delete().in('key_hash',[...rateHashes]));const r=await admin.from('rate_limits').select('key_hash',{count:'exact',head:true}).in('key_hash',[...rateHashes]);safe(r);assert.equal(r.count,0);}
  if(project){safe(await admin.from('projects').delete().eq('id',project));assert.equal(safe(await admin.from('projects').select('id').eq('id',project)).length,0);}
  if(user){safe(await admin.auth.admin.deleteUser(user));assert.equal(safe(await admin.from('profiles').select('id').eq('id',user)).length,0);}
  rmSync(dirname(preload),{recursive:true,force:true});report.cleanup=true;
 }catch{report.cleanup=false;}
 writeFileSync(process.env.WAVE_RESULT,JSON.stringify(report),{mode:0o600});
}
process.exit(report.infrastructure&&report.cleanup?0:1);
