// Component logic with synthetic hooks, DOM elements and transport, not browser acceptance.
import assert from 'node:assert/strict';
import test,{beforeEach,afterEach,after} from 'node:test';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../app/(admin)/admin/recovery/page.tsx',import.meta.url),'utf8');
let compiled;
try{
 const ts=await import('typescript');
 compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
}catch(e){
 // Isolated sandbox has esbuild preinstalled instead of the repository's TypeScript.
 if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;
 const esbuild=await import('esbuild');compiled=(await esbuild.transform(source,{loader:'tsx',format:'esm',jsx:'automatic'})).code;
}
const f={};globalThis.__resumeUI=f;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
f.state=initial=>{const i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return [f.slots[i],v=>{f.slots[i]=typeof v==='function'?v(f.slots[i]):v;}];};
f.ref=value=>{const i=f.cursor++;if(!(i in f.slots))f.slots[i]={current:value};return f.slots[i];};
f.callback=(fn,deps)=>{const i=f.cursor++;if(!same(f.slots[i]?.deps,deps))f.slots[i]={fn,deps};return f.slots[i].fn;};
f.effect=(fn,deps)=>{const i=f.cursor++;if(!same(f.slots[i]?.deps,deps)){f.slots[i]?.cleanup?.();f.slots[i]={deps};f.effects.push(()=>{f.slots[i].cleanup=fn();});}};
const modules={
 react:'export const useState=v=>globalThis.__resumeUI.state(v),useRef=v=>globalThis.__resumeUI.ref(v),useCallback=(f,d)=>globalThis.__resumeUI.callback(f,d),useEffect=(f,d)=>globalThis.__resumeUI.effect(f,d);',
 'react/jsx-runtime':'export const Fragment="fragment";export function jsx(type,props){return {type,props};}export const jsxs=jsx;',
 'next/link':'export default "a";',
 '@/components/ui/button':'export const Button="button";',
 '@/components/ui/card':'export const Card="section",CardContent="div",CardHeader="header",CardTitle="h2";',
 '@/components/ui/label':'export const Label="label";'
};
const hooks=registerHooks({resolve(s,c,n){if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};return n(s,c);}});
const {default:Page}=await import('data:text/javascript,'+encodeURIComponent(compiled));
after(()=>{hooks.deregister();delete globalThis.__resumeUI;});
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
const id='22222222-2222-4222-8222-222222222222';
const key='recovery-import-id';
const ready=()=>({id,state:'ready',kind:'project',name:'Original project',files:2,completed:1,expiresAt:'2999-01-01T00:00:00Z',notice:'Review scope'});
beforeEach(()=>{
 Object.assign(f,{slots:[],cursor:0,effects:[],calls:[],stored:new Map([[key,id]]),saved:ready(),failGet:false,failRestore:false});
 globalThis.window={sessionStorage:{getItem:k=>f.stored.get(k)??null,setItem:(k,v)=>f.stored.set(k,v),removeItem:k=>f.stored.delete(k)}};
 globalThis.fetch=async(url,options={})=>{
  f.calls.push({url,options});
  if(String(url).includes('?page='))return Response.json({files:[],projects:[],hasNext:false});
  if(String(url).includes('?importId='))return f.failGet?Response.json({error:'Saved import unavailable.'},{status:400}):Response.json(f.saved);
  const body=JSON.parse(options.body);
  if(body.action==='restore'){
   if(f.failRestore)throw Error('Response lost');
   return Response.json({result:{projectId:id,fileIds:[]}});
  }
  throw Error('Unexpected mutation: '+body.action);
 };
});
afterEach(()=>{for(const s of f.slots)s?.cleanup?.();globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;});
function render(){f.cursor=0;const tree=Page();const effects=f.effects.splice(0);for(const effect of effects)effect();return tree;}
async function settle(){await new Promise(r=>setImmediate(r));return render();}
function all(tree){if(!tree||typeof tree!=='object')return [];return [tree,...[tree.props?.children].flat(Infinity).flatMap(all)];}
function text(tree){if(tree===null||tree===undefined||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return [tree.props?.children].flat(Infinity).map(text).join(' ');}
function button(tree,label){const b=all(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,`Missing button ${label}`);return b;}
async function confirmAndRestore(tree){const check=all(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.ok(check);check.props.onChange({target:{checked:true}});tree=render();await button(tree,'Resume restore').props.onClick();return settle();}
test('reload loads same ID without POST and requires a fresh confirmation',async()=>{
 render();const tree=await settle();assert.match(text(tree),/1 of 2 files checkpointed/);
 assert.equal(button(tree,'Resume restore').props.disabled,true);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 assert.ok(f.calls.some(c=>c.url===`/api/recovery?importId=${id}`));
});
test('explicit resume sends the original ID, never opens another upload',async()=>{
 render();const tree=await confirmAndRestore(await settle());
 const posts=f.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].options.body),{action:'restore',id});
 assert.match(text(tree),/Restore completed/);assert.equal(f.stored.get(key),id);
});
test('lost final response is recovered by inspecting saved result without another POST',async()=>{
 f.failRestore=true;render();let tree=await confirmAndRestore(await settle());assert.match(text(tree),/Response lost/);assert.equal(f.stored.get(key),id);
 f.saved={id,state:'completed',result:{projectId:id,fileIds:[]},expiresAt:'2000-01-01T00:00:00Z'};
 await button(tree,'Load saved import').props.onClick();tree=await settle();assert.match(text(tree),/saved result does not run the restore again/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('completed import reload displays result without mutation or confirmation',async()=>{
 f.saved={id,state:'completed',result:{projectId:id,fileIds:[]},expiresAt:'2000-01-01T00:00:00Z'};
 render();const tree=await settle();assert.match(text(tree),/Restore completed/);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 assert.equal(all(tree).some(n=>n.type==='input'&&n.props.type==='checkbox'),false);
});
test('foreign or missing import fails visibly without creating a new one',async()=>{
 f.failGet=true;render();const tree=await settle();assert.match(text(tree),/Saved import unavailable/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(f.stored.get(key),id);
});
test('expired import cannot restore and forget only removes browser reference',async()=>{
 f.saved={id,state:'expired',expiresAt:'2000-01-01T00:00:00Z'};
 render();let tree=await settle();assert.match(text(tree),/expired after 24 hours/);assert.equal(all(tree).some(n=>n.type==='input'&&n.props.type==='checkbox'),false);
 button(tree,'Forget browser reference').props.onClick();tree=render();assert.equal(f.stored.has(key),false);assert.match(text(tree),/server import and staged data remain retained/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});
test('unsealed import offers ZIP check rather than claiming it is ready to restore',async()=>{
 f.saved={id,state:'uploading',expiresAt:'2999-01-01T00:00:00Z'};render();const tree=await settle();
 assert.equal(button(tree,'Check uploaded ZIP').props.disabled,false);assert.equal(all(tree).some(n=>n.type==='input'&&n.props.type==='checkbox'),false);
});
