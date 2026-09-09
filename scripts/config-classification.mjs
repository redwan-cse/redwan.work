// One-shot metadata classification. Never emit provider bodies, URLs or credentials.
import https from 'node:https';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = 'redwan-cse/redwan.work';
const branch = 'refs/heads/fix/direct-public-asset-uploads';
const invoiceHead = 'b2919343d146adfdff92ed4471436aabe495fdd9';
export const codes = new Set(['MISSING','INVALID','CANONICAL','JURISDICTION','WHITESPACE','NON_HTTPS','NON_ROOT','OTHER_HOST','PRODUCTION_ORIGIN','PRODUCTION_WITH_PATH','LOCAL_ORIGIN','OTHER_ORIGIN','PRESENT','ABSENT','AVAILABLE','DENIED','UNAVAILABLE','TABLE_NOT_IN_CACHE','RELATION_MISSING','UNEXPECTED_RESPONSE','VERIFIED','UNVERIFIED','REQUIRED','NOT_LISTED','BLOCKED','CLEAN','UNKNOWN']);
export const labels = new Set(['r2-endpoint','auth-access','auth-site','recovery-token-hash','recovery-confirmation-url','recovery-reset-path','recovery-site-url','outbox-schema','invoice-signature','signed-commit-rule','classic-protection','invoice-merge-state']);

export function r2Category(value) {
  if (!value) return 'MISSING';
  if (typeof value !== 'string') return 'INVALID';
  if (/\s/.test(value)) return 'WHITESPACE';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return 'NON_HTTPS';
    if (u.username || u.password || u.port || u.search || u.hash) return 'INVALID';
    if (u.pathname !== '/') return 'NON_ROOT';
    if (/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(u.hostname)) return 'CANONICAL';
    if (/^[a-f0-9]{32}\.(eu|fedramp)\.r2\.cloudflarestorage\.com$/.test(u.hostname)) return 'JURISDICTION';
    return 'OTHER_HOST';
  } catch { return 'INVALID'; }
}
export function siteCategory(value) {
  if (!value) return 'MISSING';
  if (typeof value !== 'string' || /\s/.test(value)) return 'INVALID';
  try {
    const u = new URL(value);
    if (u.username || u.password || !['http:','https:'].includes(u.protocol)) return 'INVALID';
    if (u.origin === 'https://redwan.work') return u.pathname === '/' && !u.search && !u.hash ? 'PRODUCTION_ORIGIN' : 'PRODUCTION_WITH_PATH';
    if (['localhost','127.0.0.1','[::1]'].includes(u.hostname)) return 'LOCAL_ORIGIN';
    return 'OTHER_ORIGIN';
  } catch { return 'INVALID'; }
}
export function templateCategories(value) {
  const text = typeof value === 'string' ? value : '';
  return {
    'recovery-token-hash': /\{\{\s*\.TokenHash\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-confirmation-url': /\{\{\s*\.ConfirmationURL\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-reset-path': /\/reset-password\?/.test(text) ? 'PRESENT' : 'ABSENT',
    'recovery-site-url': /\{\{\s*\.SiteURL\s*\}\}/.test(text) ? 'PRESENT' : 'ABSENT',
  };
}
export function outboxCategory(status, body) {
  if (status === 200) return Array.isArray(body) && body.length === 0 ? 'AVAILABLE' : 'UNEXPECTED_RESPONSE';
  if ([401,403].includes(status)) return 'DENIED';
  if (body?.code === 'PGRST205') return 'TABLE_NOT_IN_CACHE';
  if (body?.code === '42P01') return 'RELATION_MISSING';
  if (body?.code === '42501') return 'DENIED';
  return 'UNAVAILABLE';
}
export function allowRequest(host, path, method) {
  if (method === 'GET' && /^[a-z0-9]{20}\.supabase\.co$/.test(host)) return path === '/rest/v1/email_outbox?select=id&limit=0';
  if (host === 'api.supabase.com' && method === 'GET') return /^\/v1\/projects\/[a-z0-9]{20}\/config\/auth$/.test(path);
  if (host !== 'api.github.com') return false;
  const base = '/repos/' + repo;
  if (method === 'GET') return [base+'/commits/'+invoiceHead,base+'/rules/branches/main',base+'/branches/main/protection',base+'/pulls/49'].includes(path);
  return method === 'POST' && /^\/repos\/redwan-cse\/redwan\.work\/statuses\/[a-f0-9]{40}$/.test(path);
}
export function request(host, path, headers, method = 'GET', payload) {
  if (!allowRequest(host,path,method)) return Promise.reject(new Error('Request refused'));
  return new Promise((resolve,reject) => {
    const req = https.request({hostname:host,port:443,path,method,rejectUnauthorized:true,headers:{'User-Agent':'redwan-metadata-classification','Accept':'application/json',...headers}}, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => {size += chunk.length; if (size > 524288) res.destroy(new Error('Response refused')); else chunks.push(chunk);});
      res.on('error', () => reject(new Error('Response unavailable')));
      res.on('end', () => {
        let body; try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {body=null;}
        resolve({status:res.statusCode,body}); // Never follow a redirect.
      });
    });
    req.setTimeout(15000,()=>req.destroy(new Error('Request timed out')));
    req.on('error',()=>reject(new Error('Request unavailable')));
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}
function emit(result,label,code) {
  if (!labels.has(label) || !codes.has(code)) throw new Error('Invalid result');
  result[label]=code;
  console.log(label+': '+code);
}
export async function production(env, transport=request) {
  const result = {};
  emit(result,'r2-endpoint',r2Category(env.R2_ENDPOINT));
  let host;
  try {
    const u = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash || !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) throw new Error();
    host=u.hostname;
  } catch {emit(result,'auth-access','INVALID');emit(result,'outbox-schema','INVALID');return result;}
  if (env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) {
    try {const r=await transport(host,'/rest/v1/email_outbox?select=id&limit=0',{'apikey':env.SUPABASE_SECRET_KEY});emit(result,'outbox-schema',outboxCategory(r.status,r.body));}
    catch {emit(result,'outbox-schema','UNAVAILABLE');}
  } else emit(result,'outbox-schema','MISSING');
  if (!env.SUPABASE_ACCESS_TOKEN) {emit(result,'auth-access','MISSING');return result;}
  try {
    const r=await transport('api.supabase.com','/v1/projects/'+host.split('.')[0]+'/config/auth',{'Authorization':'Bearer '+env.SUPABASE_ACCESS_TOKEN});
    emit(result,'auth-access',r.status===200 ? 'AVAILABLE' : [401,403].includes(r.status) ? 'DENIED' : 'UNAVAILABLE');
    if (r.status===200 && r.body && typeof r.body === 'object' && !Array.isArray(r.body)) {
      emit(result,'auth-site',siteCategory(r.body.site_url));
      for (const [k,v] of Object.entries(templateCategories(r.body.mailer_templates_recovery_content))) emit(result,k,v);
    }
  } catch {emit(result,'auth-access','UNAVAILABLE');}
  return result;
}
async function github(env) {
  const result={}; const base='/repos/'+repo;
  const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28'};
  for (const [label,path] of [['invoice-signature','/commits/'+invoiceHead],['signed-commit-rule','/rules/branches/main'],['classic-protection','/branches/main/protection'],['invoice-merge-state','/pulls/49']]) {
    try {
      const r=await request('api.github.com',base+path,headers);let code='UNAVAILABLE';
      if ([401,403].includes(r.status)) code='DENIED';
      if(r.status===200) {
        if(label==='invoice-signature') code=r.body?.commit?.verification?.verified===true ? 'VERIFIED' : r.body?.commit?.verification?.verified===false ? 'UNVERIFIED' : 'UNKNOWN';
        if(label==='signed-commit-rule') code=Array.isArray(r.body) ? r.body.some(x=>x.type==='required_signatures') ? 'REQUIRED' : 'NOT_LISTED' : 'UNKNOWN';
        if(label==='classic-protection') code='AVAILABLE'; // No raw rule/user lists.
        if(label==='invoice-merge-state') code=r.body?.mergeable_state==='blocked' ? 'BLOCKED' : r.body?.mergeable_state==='clean' ? 'CLEAN' : 'UNKNOWN';
      }
      emit(result,label,code);
    } catch {emit(result,label,'UNAVAILABLE');}
  }
  return result;
}
async function main() {
  const env=process.env;
  if(env.GITHUB_REPOSITORY!==repo || env.GITHUB_REF!==branch || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')) throw new Error('Context refused');
  const file=env.RUNNER_TEMP+'/configuration-categories.json';
  if(process.argv[2]==='production') writeFileSync(file,JSON.stringify(await production(env)),{mode:0o600,flag:'wx'});
  else if(process.argv[2]==='report') {
    const result={...JSON.parse(readFileSync(file,'utf8')),...await github(env)};
    for(const [k,v] of Object.entries(result)) if(!labels.has(k)||!codes.has(v)) throw new Error('Result refused');
    for(const [context,keys] of [['config/storage',['r2-endpoint','outbox-schema']],['config/auth',['auth-site','recovery-token-hash','recovery-confirmation-url']],['config/template',['recovery-reset-path','recovery-site-url','auth-access']],['release/signatures',['invoice-signature','signed-commit-rule','classic-protection','invoice-merge-state']]]) {
      const description=keys.map(k=>k+'='+ (result[k]||'UNKNOWN')).join('; ');
      // Multiple narrowly sized statuses preserve all finite categories without raw bodies.
      for(const key of keys) {
        const response=await request('api.github.com','/repos/'+repo+'/statuses/'+env.GITHUB_SHA,{Authorization:'Bearer '+env.GITHUB_TOKEN,'Content-Type':'application/json'},'POST',{state:'success',context:'classification/'+key,description:key+'='+ (result[key]||'UNKNOWN')});
        if(response.status!==201) throw new Error('Report unavailable');
      }
      void context; void description;
    }
  } else throw new Error('Mode refused');
}
if (import.meta.url.startsWith('file:') && process.argv[1] === fileURLToPath(import.meta.url)) main().catch(()=>{console.error('classification: UNAVAILABLE');process.exitCode=1;});
