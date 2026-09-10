import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
if(process.argv[2]!=='child'){
 for(const p of ['.env','.env.local','.env.production','.env.production.local'])assert.equal(existsSync(p),false);
 const s=JSON.parse(readFileSync(process.env.AUTH_STATUS_FILE,'utf8')),u=new URL(s.API_URL);
 assert.ok(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&u.port==='54321');
 assert.ok(s.PUBLISHABLE_KEY.startsWith('sb_publishable_')&&s.SECRET_KEY.startsWith('sb_secret_'));
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','BROWSER_TOOLS_DIR','CI','RUNNER_TEMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SITE_URL:'http://localhost:3399',NEXT_PUBLIC_SUPABASE_URL:u.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:s.PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:s.SECRET_KEY,LEAD_IP_HASH_SALT:randomBytes(32).toString('hex')});
 const r=spawnSync(process.execPath,[resolve('tests/wave-redirect-diagnose.mjs'),'child'],{env,encoding:'utf8',maxBuffer:1024*1024});process.exit(r.status??1);
}
const origin='http://localhost:3399',api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const admin=createClient(api,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),safe=r=>{if(r.error)throw Error('Synthetic fixture failure');return r.data;};
const {chromium}=createRequire(resolve(process.env.BROWSER_TOOLS_DIR,'package.json'))('playwright');
let user,project,server,browser;const result={phase:'fixtures',cases:[],cleanup:false};
try{
 const email='redirect-'+randomBytes(12).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url');
 user=safe(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:'client'}})).user.id;
 safe(await admin.from('profiles').update({role:'client',is_active:true}).eq('id',user));project=safe(await admin.from('projects').insert({client_id:user,name:'Synthetic redirect fixture'}).select('id').single()).id;
 result.phase='build';const build=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{env:process.env,encoding:'utf8',maxBuffer:20*1024*1024});assert.equal(build.status,0);
 result.phase='startup';server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3399'],{env:{...process.env,NODE_ENV:'production'},stdio:'ignore'});
 let ready=false;for(let i=0;i<150;i++){if(server.exitCode!==null)break;try{const r=await fetch(origin+'/login');await r.text();if(r.ok){ready=true;break;}}catch{}await delay(200);}assert.ok(ready);browser=await chromium.launch({headless:true});
 const pairs=[['/portal','/portal'],['/portal/projects/'+project,'/portal/projects/'+project],['/portal?filter=open-items','/portal?filter=open-items'],['/portal/../portal?filter=active','/portal?filter=active'],['//outside.invalid','/portal'],['/'+String.fromCharCode(9)+'/outside.invalid','/portal'],['/'+String.fromCharCode(10)+'/outside.invalid','/portal'],['/'+String.fromCharCode(92)+'outside.invalid','/portal'],['/portal/..//outside.invalid','/portal'],['/%2foutside.invalid','/portal'],['/portal%09','/portal'],['/admin','/portal']];
 result.phase='cases';
 for(const [index,[next,expected]] of pairs.entries()){
  const row={index,pass:false,stage:'login',kind:'none',origin:false,path:'unknown',expectedPath:false,query:false,postedNext:false};result.cases.push(row);
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>[origin,api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);
  try{
   await page.goto(origin+'/login?next='+encodeURIComponent(next));await page.locator('#email').fill(email);await page.locator('#password').fill(password);
   row.postedNext=(await page.locator('input[name="next"]').inputValue())===next;
   row.stage='submit';await page.getByRole('button',{name:'Sign in',exact:true}).click();
   row.stage='navigation';await page.waitForURL(u=>u.pathname!=='/login');row.stage='assertion';assert.equal(page.url(),origin+expected);row.pass=true;
  }catch(e){row.kind=e.name==='TimeoutError'?'timeout':e.code==='ERR_ASSERTION'?'assertion':'other';}
  finally{
   const u=new URL(page.url()),wanted=new URL(expected,origin);row.origin=u.origin===origin;row.expectedPath=u.pathname===wanted.pathname;row.query=u.search===wanted.search;row.path=['/portal','/admin','/login','/portal/projects/'+project].includes(u.pathname)?(u.pathname.includes(project)?'project':u.pathname.slice(1)):'other';
   await context.close();
  }
 }
 result.phase='complete';
}catch{result.phase+='-failed';}
finally{
 try{
  if(browser)await browser.close();if(server?.pid&&server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill('SIGTERM');await Promise.race([done,delay(5000)]);if(server.exitCode===null&&server.signalCode===null){server.kill('SIGKILL');await done;}}
  if(project){safe(await admin.from('projects').delete().eq('id',project));assert.equal(safe(await admin.from('projects').select('id').eq('id',project)).length,0);}
  if(user){safe(await admin.auth.admin.deleteUser(user));assert.equal(safe(await admin.from('profiles').select('id').eq('id',user)).length,0);}result.cleanup=true;
 }catch{result.cleanup=false;}
 writeFileSync(resolve(process.env.RUNNER_TEMP,'redirect-result.json'),JSON.stringify(result),{mode:0o600});
}
process.exit(result.phase==='complete'&&result.cleanup&&result.cases.length===12&&result.cases.every(r=>r.pass)?0:1);
