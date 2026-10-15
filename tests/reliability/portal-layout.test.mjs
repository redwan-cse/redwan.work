import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(path,'utf8');
function blob(text){return createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');}
test('document root has no marketing chrome or competing main landmark',()=>{
 const source=read('app/layout.tsx');
 assert.doesNotMatch(source, /<(?:Navigation|Footer|WhatsAppButton|main)\b/);
 assert.match(source, /<ThemeProvider[^>]*>[\s\S]*\{children\}/);
 assert.match(source, /export const metadata: Metadata/);
 assert.match(source, /JSON.stringify\(personJsonLd\)/);
 assert.doesNotMatch(source, /usePathname|use client/);
});
test('marketing frame owns exactly one main and the existing public chrome',()=>{
 const source=read('components/marketing-frame.tsx');
 assert.equal((source.match(/<main\b/g)||[]).length,1);
 for(const name of ['Navigation','Footer','WhatsAppButton'])assert.match(source,new RegExp('<'+name+'\\s*/>'));
 assert.doesNotMatch(source,/use client|usePathname|headers\(/);
});
test('all public routes explicitly use the public frame without URL relocation',()=>{
 for(const path of ['app/page.tsx','app/blogs/layout.tsx','app/contact/layout.tsx','app/portfolio/layout.tsx','app/privacy/layout.tsx','app/resume/layout.tsx','app/services/layout.tsx','app/(auth)/layout.tsx','app/not-found.tsx']){
  const source=read(path);assert.match(source,/<MarketingFrame[\s>]/,path);assert.doesNotMatch(source,/usePathname/,path);
 }
 for(const route of ['blogs','contact','portfolio','privacy','resume','services'])assert.ok(read('app/'+route+'/page.tsx').length);
 assert.match(read('app/resume/layout.tsx'),/canonical: '\/resume'/);
 assert.match(read('app/(auth)/layout.tsx'),/index: false, follow: false/);
});
test('portal unavailable views stay in their own shell without misleading marketing links',()=>{
 for(const role of ['admin','client']){
  const route=role==='admin'?'admin':'portal';
  const source=read(`app/(${role})/${route}/not-found.tsx`);
  assert.doesNotMatch(source,/<main\b|MarketingFrame|Navigation|Footer|WhatsAppButton/);
  assert.match(source,new RegExp('href="/'+route+'"'));
 }
 const error=read('app/error.tsx');assert.equal((error.match(/<main\b/g)||[]).length,1);
 assert.doesNotMatch(error,/MarketingFrame|error\.message|console\.error/);
});
test('recovery source is byte-identical except its nested landmark tag',()=>{
 const source=read('app/(admin)/admin/recovery/page.tsx');assert.doesNotMatch(source,/<main\b/);
 const restored=source.replace('return <div className="mx-auto max-w-4xl','return <main className="mx-auto max-w-4xl').replace('</CardContent></Card></div>;','</CardContent></Card></main>;');
 assert.equal(blob(restored),'a126a7d70cf280e593a707fd26f6808ff10177a6');
});
test('invoice source is byte-identical except its nested landmark tag',()=>{
 const source=read('app/(client)/portal/invoices/[id]/page.tsx');assert.doesNotMatch(source,/<main\b/);
 const restored=source.replace('      <div className="space-y-6">','      <main className="space-y-6">').replace('      </div>\n    </div>','      </main>\n    </div>');
 assert.equal(blob(restored),'bacf39b7d00bd65897d5585b357403bc0fb72b2f');
});
