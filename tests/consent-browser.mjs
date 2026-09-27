// Actual desktop/mobile form, mocked local transports only. Separate CI covers
// the real route/parser/database/storage. This is not hosted-provider evidence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {consentBundle} from './reliability/consent-fixture.mjs';
const {chromium}=createRequire(process.env.BROWSER_TOOLS_DIR+'/package.json')('playwright');
const base='http://127.0.0.1:3421';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3421'],{stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
const nextPolicy={...consentBundle,version:'synthetic-f20-v2',policyText:'SYNTHETIC ONLY: revised text requiring explicit review.'};
let browser;
try{
 let ready=false;
 for(let i=0;i<120;i++){try{if((await fetch(base+'/contact')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready);browser=await chromium.launch({headless:true});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Dhaka',serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  let readsAvailable=false,posts=0,uploads=0;const payloads=[];
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.href==='https://challenges.cloudflare.com/turnstile/v0/api.js')return route.fulfill({contentType:'application/javascript',body:"window.turnstile={reset(){window.onTurnstileSuccess?.('synthetic-'+crypto.randomUUID())}};const timer=setInterval(()=>{if(window.onTurnstileSuccess){clearInterval(timer);window.turnstile.reset();}},25);"});
   if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/contact'&&req.method()==='GET')return route.fulfill({status:readsAvailable?200:503,contentType:'application/json',body:JSON.stringify(readsAvailable?{policy:consentBundle}:{code:'consent_unavailable'})});
   if(url.pathname==='/api/uploads/presign')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({uploads:[{filename:'fixture.pdf',key:'contact/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf',uploadUrl:base+'/synthetic-upload'}]})});
   if(url.pathname==='/synthetic-upload'){uploads++;return route.fulfill({status:200,body:''});}
   if(url.pathname==='/api/contact'&&req.method()==='POST'){
    posts++;payloads.push(await new Response(req.postDataBuffer(),{headers:{'Content-Type':req.headers()['content-type']}}).formData());
    return route.fulfill({status:posts===1?409:200,contentType:'application/json',body:JSON.stringify(posts===1?{code:'consent_stale',policy:nextPolicy}:{success:true,ticketRef:'TKT-2000'})});
   }
   return route.continue();
  });
  await page.goto(base+'/contact');
  const reload=page.getByRole('button',{name:'Load privacy policy again',exact:true});
  await reload.waitFor();assert.equal(await page.locator('#gdprConsent').isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Send Request',exact:true}).isDisabled(),true);
  await page.locator('#name').fill('Synthetic preserved draft');await page.locator('#email').fill('synthetic@example.test');
  await page.locator('#projectSummary').fill('Synthetic inquiry with enough details to preserve across a policy refresh.');
  readsAvailable=true;await reload.click();
  await page.waitForFunction(()=>!document.querySelector('#gdprConsent')?.disabled);
  assert.equal(await page.locator('#name').inputValue(),'Synthetic preserved draft');
  await page.locator('[id="service-Consulting"]').click();
  await page.locator('#urgency').click();await page.getByRole('option',{name:'Flexible',exact:true}).click();
  await page.locator('#budgetMin').fill('100');await page.locator('#budgetMax').fill('500');
  await page.locator('#contactAttachments').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic')});
  await page.getByRole('button',{name:'Remove fixture.pdf',exact:true}).waitFor();
  await page.locator('#gdprConsent').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('#gdprConsent').getAttribute('aria-checked'),'true');
  await page.evaluate(()=>{const form=document.querySelector('form');form.requestSubmit();form.requestSubmit();});
  await page.getByText(nextPolicy.policyText,{exact:true}).waitFor();
  assert.equal(posts,1,'Duplicate event must not submit twice');
  assert.equal(await page.locator('#gdprConsent').getAttribute('aria-checked'),'false');
  assert.equal(await page.locator('#name').inputValue(),'Synthetic preserved draft');
  assert.equal(await page.locator('#budgetMin').inputValue(),'100');
  assert.equal(await page.locator('#budgetMax').inputValue(),'500');
  assert.equal(await page.getByRole('button',{name:'Remove fixture.pdf',exact:true}).count(),1);
  assert.deepEqual(payloads[0].getAll('consentPolicyVersion'),[consentBundle.version]);
  assert.deepEqual(payloads[0].getAll('gdprConsent'),['true']);
  assert.equal(JSON.parse(payloads[0].get('attachments')).length,1);
  await page.getByRole('button',{name:'Send Request',exact:true}).click();
  await page.getByRole('dialog').waitFor();assert.equal(posts,1,'Fresh consent must be explicit');
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.locator('#gdprConsent').focus();await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Send Request',exact:true}).click();
  await page.getByText('TKT-2000',{exact:true}).waitFor();
  assert.equal(posts,2);assert.equal(uploads,1,'Stale recovery must not reupload files');
  assert.deepEqual(payloads[1].getAll('consentPolicyVersion'),[nextPolicy.version]);
  assert.deepEqual(payloads[1].getAll('gdprConsent'),['true']);
  assert.deepEqual(JSON.parse(payloads[1].get('attachments')),JSON.parse(payloads[0].get('attachments')));
  assert.equal(await page.locator('#name').inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Remove fixture.pdf',exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await context.close();
  console.log('Passed: F20 policy loading, fail-closed read, preserved draft/files, duplicate-submit refusal, stale review/recheck and persisted-reference UI at width '+width+'.');
 }
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
