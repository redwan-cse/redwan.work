import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const source=readFileSync('components/enhanced-contact-form.tsx','utf8');
const fields=['gdprConsent','name','email','country','whatsAppNumber','preferredContactMethod','timeZone','preferredContactDate','bestTimeToContact','serviceType','company','projectUrlOrFiles','projectSummary','ndaConfidentiality','urgency','budgetMin','budgetMax','howDidYouFindMe','sourcePage','deviceType','attachments','cf-turnstile-response'];
const dead=['budgetRange','ticketId','userAgent'];
const mode=process.argv[2];
if(mode==='red') {
  assert.match(source,/formFields\.append\('entry\./,'Baseline must reproduce legacy serialization');
  for(const key of dead)assert.ok(source.includes(`formFields.append('${key}'`));
  console.log('RED reproduced: retired entry fields and unused mirrors are still serialized');
}else if(mode==='source') {
  assert.doesNotMatch(source,/entry\.\d|Google Forms|GOOGLE FORMS|Apps Script|googleFormsDate|generateTicketId|budgetRangeFormatted/);
  for(const key of dead)assert.ok(!source.includes(`formFields.append('${key}'`));
  const start=source.indexOf('const formFields = new FormData();');
  const end=source.indexOf('const response = await fetch',start);
  assert.ok(start>0&&end>start);
  const serialize=new Function('formData','submissionData','attachedFiles','submitToken',source.slice(start,end)+'return formFields;');
  const input=Object.fromEntries(fields.map(k=>[k,'fixture-'+k]));
  const attachment={key:'contact/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.pdf',filename:'fixture.pdf',mime:'application/pdf',size_bytes:10};
  for(const consent of [true,false]) {
    const data=serialize({...input,gdprConsent:consent},input,[attachment],'synthetic-token');
    assert.deepEqual([...data.keys()].sort(),[...fields].sort());
    assert.deepEqual(data.getAll('gdprConsent'),[String(consent)]);
    assert.deepEqual(JSON.parse(data.get('attachments')),[attachment]);
    for(const k of fields.filter(k=>!['gdprConsent','attachments','cf-turnstile-response'].includes(k)))assert.equal(data.get(k),input[k]);
    assert.equal(data.get('cf-turnstile-response'),'synthetic-token');
  }
  const empty=serialize({...input,gdprConsent:true},input,[],null);
  assert.equal(empty.has('attachments'),false);assert.equal(empty.has('cf-turnstile-response'),false);
  console.log('GREEN: exact live payload, consent variants, attachment metadata and token preserved');
}else if(mode==='browser') {
  const require=createRequire(process.env.BROWSER_TOOLS_DIR+'/package.json');
  const {chromium}=require('playwright');
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3417'],{stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  const base='http://127.0.0.1:3417';let browser;
  try {
    let ready=false;
    for(let i=0;i<120;i++){try{const r=await fetch(base+'/contact');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
    assert.ok(ready,'Built server must start');browser=await chromium.launch({headless:true});
    for(const width of [1280,390]) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Dhaka'});
      const page=await context.newPage();let requests=0;let reply='failure';let payload;
      await page.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.origin!==base)return route.abort();
        if(u.pathname==='/api/contact'&&route.request().method()==='POST') {
          requests++;
          payload=await new Response(route.request().postDataBuffer(),{headers:{'Content-Type':route.request().headers()['content-type']}}).formData();
          return route.fulfill({status:reply==='failure'?503:200,contentType:'application/json',body:JSON.stringify(reply==='failure'?{error:'Synthetic unavailable'}:reply==='missing'?{success:true}:{success:true,ticketRef:'TKT-SYNTHETIC-27'})});
        }
        return route.continue();
      });
      await page.goto(base+'/contact');
      await page.locator('#name').fill('Synthetic Contact');await page.locator('#email').fill('fixture@example.test');
      await page.locator('#projectSummary').fill('Synthetic request with enough detail for contact validation.');
      await page.locator('[id="service-Consulting"]').click();
      await page.locator('#urgency').click();await page.getByRole('option',{name:'Flexible',exact:true}).click();
      await page.locator('#budgetMin').fill('100');await page.locator('#budgetMax').fill('500');
      await page.getByRole('button',{name:'Send Request',exact:true}).click();
      await page.getByRole('dialog').waitFor();assert.equal(requests,0,'Missing consent must not submit');
      await page.getByRole('button',{name:'Got it',exact:true}).click();
      await page.locator('#gdprConsent').click();
      await page.getByRole('button',{name:'Send Request',exact:true}).click();
      await page.getByText('Failed to submit form. Please try again or contact us directly.',{exact:true}).waitFor();
      assert.equal(await page.locator('#name').inputValue(),'Synthetic Contact');
      assert.equal(await page.getByText('Your Ticket ID:',{exact:false}).count(),0);
      assert.deepEqual(payload.getAll('gdprConsent'),['true']);
      assert.equal(payload.get('budgetMin'),'100');assert.equal(payload.get('budgetMax'),'500');
      for(const key of payload.keys())assert.ok(fields.includes(key),'Only consumed payload names allowed');
      for(const key of dead)assert.equal(payload.has(key),false);
      reply='missing';await page.getByRole('button',{name:'Send Request',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
      assert.equal(await page.getByText('Your Ticket ID:',{exact:false}).count(),0);
      reply='success';await page.getByRole('button',{name:'Send Request',exact:true}).click();
      await page.getByText('TKT-SYNTHETIC-27',{exact:true}).waitFor();
      assert.equal(await page.locator('#name').inputValue(),'');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      await context.close();console.log('Browser success/failure/consent/reference/mobile phase: PASS');
    }
  }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}else throw Error('Choose red, source or browser');
