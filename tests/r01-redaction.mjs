import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {writeFileSync} from 'node:fs';
import {inspect} from 'node:util';
const sentinel='SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE';
const f={rpc:[],signs:0,fetches:0,mode:'ok',pageError:null,countError:false,blogCalls:0,revalidateCalls:0,revalidateError:false};globalThis.__r01=f;
const admin={rpc:async()=>{const r=f.rpc.shift();if(r instanceof Error)throw r;return r??{data:true,error:null};},from(){let head=false;const q={select(_s,options){head=options?.head===true;return q;},eq(){return q;},ilike(){return q;},order(){return q;},range(){return q;},then(resolve,reject){return Promise.resolve({data:[],count:0,error:head?(f.countError?{message:sentinel}:null):f.pageError}).then(resolve,reject);}};return q;}};globalThis.__r01Admin=admin;
const modules={
 'server-only':'export {};',
 'next/server':'export class NextRequest extends Request{};export class NextResponse{static json(body,init={}){return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json"}});}}',
 'next/cache':'export function revalidatePath(){const f=globalThis.__r01;f.revalidateCalls++;if(f.revalidateError)throw Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE");}',
 '@/lib/supabase/admin':'export function getSupabaseAdmin(){return globalThis.__r01Admin;}',
 '@/lib/contact/lead-schema':'export async function sha256Hex(){return "synthetic-hash";}',
 '@/lib/mime':'export function isAllowedMime(){return true;}',
 '@/lib/r2':'export const CONTACT_MAX_FILES=5;export function isR2Configured(){return true;}export function validateContactFile(){return {ok:true,ext:"pdf"};}export async function presignContactUpload(){const f=globalThis.__r01;f.signs++;if(f.mode==="sign")throw Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE");return {key:"synthetic-key",uploadUrl:"https://example.test/synthetic"};}',
 '@/lib/email':'export const HANDOFF_MARKER="handoff";',
 'googleapis':'export const google={auth:{GoogleAuth:class{}},blogger(){return {posts:{async list(){const f=globalThis.__r01;f.blogCalls++;if(f.mode==="blog")throw Object.assign(Error("SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE"),{response:{data:"SYNTHETIC_PRIVATE_RECIPIENT_FILENAME_TOKEN_REFERENCE"}});return {data:{items:[]}};}}};}};'
};
registerHooks({resolve(s,c,n){if(Object.hasOwn(modules,s))return {url:'data:text/javascript,'+encodeURIComponent(modules[s]),shortCircuit:true};if(s.startsWith('@/lib/'))return {url:new URL('../'+s.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};return n(s,c);}});
const presign=await import('../app/api/uploads/presign/route.ts'),blog=await import('../lib/blogger.ts'),email=await import('../lib/crm/email-log.ts'),revalidate=await import('../app/api/revalidate/route.ts');
const results={};const original={error:console.error,warn:console.warn,fetch:globalThis.fetch};let logs=[];
function reset(){Object.assign(f,{rpc:[],signs:0,fetches:0,mode:'ok',pageError:null,countError:false,blogCalls:0,revalidateCalls:0,revalidateError:false});logs=[];blog.clearBlogCache();process.env.LEAD_IP_HASH_SALT='synthetic';process.env.TURNSTILE_SECRET_KEY='synthetic';process.env.REVALIDATION_SECRET='synthetic';process.env.BLOGGER_BLOG_ID='synthetic';process.env.GOOGLE_CREDENTIALS_B64=Buffer.from('{}').toString('base64');}
console.error=(...args)=>logs.push(inspect(args));console.warn=(...args)=>logs.push(inspect(args));
globalThis.fetch=async(input)=>{assert.equal(String(input),'https://challenges.cloudflare.com/turnstile/v0/siteverify');f.fetches++;if(f.mode==='fetch')throw Error(sentinel);if(f.mode==='json')return {json:async()=>{throw Error(sentinel);}};if(f.mode==='timeout')throw Object.assign(Error(sentinel),{name:'AbortError'});return new Response(JSON.stringify(f.mode==='denial'?{success:false,'error-codes':[sentinel]}:{success:true}));};
function request(origin='https://example.test'){return new Request('https://example.test/api/uploads/presign',{method:'POST',headers:{origin,host:'example.test','Content-Type':'application/json'},body:JSON.stringify({files:[{filename:'fixture.pdf',mime:'application/pdf',size:10}],turnstileToken:'synthetic'})});}
function clean(value){assert.equal(inspect(value).includes(sentinel),false);assert.equal(logs.join('\n').includes(sentinel),false);}
async function check(name,fn){reset();try{await fn();results[name]='PASS';}catch(e){results[name]=e.code==='ERR_ASSERTION'?'ASSERTION_FAIL':'EXECUTION_FAIL';}}
try{
 for(const [name,mode,rpc,status] of [['rate-error','ok',[{error:{message:sentinel},data:null}],503],['rate-throw','ok',[Error(sentinel)],503],['replay-error','ok',[{data:true,error:null},{error:{message:sentinel},data:null}],503],['provider-throw','fetch',[],503],['provider-json','json',[],503],['provider-denial','denial',[],400],['signing','sign',[],500]])await check('presign-'+name,async()=>{f.mode=mode;f.rpc=rpc;const r=await presign.POST(request());assert.equal(r.status,status);assert.equal(f.signs,mode==='sign'?1:0);if(name.startsWith('rate'))assert.equal(f.fetches,0);clean(await r.text());assert.ok(logs.length>0);});
 await check('presign-request-context',async()=>{const r=await presign.POST(request('https://'+sentinel+'.test'));assert.equal(r.status,403);assert.equal(f.fetches,0);assert.equal(f.signs,0);clean(await r.text());});
 await check('presign-timeout-control',async()=>{f.mode='timeout';const r=await presign.POST(request());assert.equal(r.status,408);assert.equal(f.signs,0);clean(await r.text());});
 await check('presign-success-control',async()=>{const r=await presign.POST(request());assert.equal(r.status,200);assert.equal(f.signs,1);assert.equal(f.fetches,1);clean(await r.json());});
 await check('blog-upstream-error',async()=>{f.mode='blog';const r=await blog.getBlogPostsPage(1,9);assert.equal(f.blogCalls,1);assert.deepEqual(r,{posts:[],totalItems:0});clean(r);assert.ok(logs.length>0);});
 await check('blog-credential-parse-error',async()=>{process.env.GOOGLE_CREDENTIALS_B64=Buffer.from(sentinel).toString('base64');const r=await blog.getBlogPostsPage(1,9);assert.equal(f.blogCalls,0);assert.deepEqual(r,{posts:[],totalItems:0});clean(r);});
 await check('blog-cache-control',async()=>{await blog.getBlogPostsPage(1,9);await blog.getBlogPostsPage(1,9);assert.equal(f.blogCalls,1);clean(logs);});
 await check('email-page-error',async()=>{f.pageError={code:'SYNTHETIC',message:sentinel};await assert.rejects(email.listEmailLogs(1,{email:sentinel}),{message:'Email log is unavailable.'});clean(logs);assert.ok(logs.length>0);});
 await check('email-range-control',async()=>{f.pageError={code:'PGRST103',message:sentinel};const r=await email.listEmailLogs(2);assert.deepEqual(r.rows,[]);clean(r);});
 await check('email-count-control',async()=>{f.countError=true;const r=await email.listEmailLogs();assert.deepEqual(r.counts,{sent:null,failed:null});clean(r);});
 function reval(token='synthetic',path='/blogs'){const r=new Request('https://example.test/api/revalidate?path='+encodeURIComponent(path),{method:'POST',headers:{authorization:'Bearer '+token}});r.nextUrl=new URL(r.url);return r;}
 await check('revalidate-throw',async()=>{f.revalidateError=true;const r=await revalidate.POST(reval());assert.equal(r.status,500);assert.equal(f.revalidateCalls,1);clean(await r.json());});
 await check('revalidate-denial-control',async()=>{assert.equal((await revalidate.POST(reval('wrong'))).status,401);assert.equal((await revalidate.POST(reval('synthetic','/admin'))).status,400);delete process.env.REVALIDATION_SECRET;assert.equal((await revalidate.POST(reval())).status,401);assert.equal(f.revalidateCalls,0);clean(logs);});
 await check('revalidate-success-control',async()=>{const r=await revalidate.POST(reval());assert.equal(r.status,200);assert.equal(f.revalidateCalls,1);assert.equal((await r.json()).revalidated,true);clean(logs);});
}finally{console.error=original.error;console.warn=original.warn;globalThis.fetch=original.fetch;}
writeFileSync(process.argv[2],JSON.stringify(results),{mode:0o600});
for(const [name,result] of Object.entries(results))console.log(name+': '+result);
process.exitCode=Object.values(results).every(v=>v==='PASS')?0:1;
