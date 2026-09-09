import https from 'node:https';
import {isDeepStrictEqual} from 'node:util';
import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const FIELDS=['site_url','mailer_templates_recovery_content'];
export const LINK='{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery';
const CODES=new Set(['VERIFIED','ALREADY_CORRECT','REFUSED','ROLLED_BACK','NEEDS_PRIVATE_REVIEW']);
export function replacement(html) {
  if(typeof html!=='string'||html.length>262144) throw new Error('Refused');
  // Preserve all existing presentation and unrelated links. Refuse ambiguity.
  const old=/\bhref(\s*=\s*)(["'])\s*\{\{\s*\.ConfirmationURL\s*\}\}\s*\2/gi;
  const matches=[...html.matchAll(old)];
  if(matches.length!==1 || [...html.matchAll(/\{\{\s*\.ConfirmationURL\s*\}\}/g)].length!==1) {
    if(matches.length===0 && html.includes(LINK) && !/\{\{\s*\.ConfirmationURL\s*\}\}/.test(html)) return html;
    throw new Error('Refused');
  }
  return html.replace(old,(_all,spacing,quote)=>'href'+spacing+quote+LINK+quote);
}
export function validPatch(body) {
  return body && typeof body==='object' && !Array.isArray(body) &&
    isDeepStrictEqual(Object.keys(body).sort(),[...FIELDS].sort()) &&
    FIELDS.every(k=>typeof body[k]==='string') && body.site_url.length<=2048 && body.mailer_templates_recovery_content.length<=262144;
}
export function targetPath(url) {
  if(typeof url!=='string'||/\s/.test(url)) throw new Error('Refused');
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) throw new Error('Refused');
  return '/v1/projects/'+u.hostname.split('.')[0]+'/config/auth';
}
export function permitted(host,path,method,body) {
  if(host==='api.supabase.com' && /^\/v1\/projects\/[a-z0-9]{20}\/config\/auth$/.test(path)) return (method==='GET' && body===undefined)||(method==='PATCH'&&validPatch(body));
  return host==='api.github.com' && /^\/repos\/redwan-cse\/redwan\.work\/statuses\/[a-f0-9]{40}$/.test(path) && method==='POST' && body?.context==='production-auth/correction' && CODES.has(body.description) && body.state===(['VERIFIED','ALREADY_CORRECT'].includes(body.description)?'success':'failure') && isDeepStrictEqual(Object.keys(body).sort(),['context','description','state']);
}
export function request(host,path,method,token,body) {
  if(!permitted(host,path,method,body)) return Promise.reject(new Error('Refused'));
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:host,port:443,path,method,rejectUnauthorized:true,headers:{Authorization:'Bearer '+token,'User-Agent':'redwan-approved-auth-correction','Accept':'application/json','Content-Type':'application/json'}},res=>{
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>524288)res.destroy(new Error('Refused'));else chunks.push(chunk);});
      res.on('error',()=>reject(new Error('Unavailable')));
      res.on('end',()=>{let data=null;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}resolve({status:res.statusCode,data});});
    });
    req.setTimeout(15000,()=>req.destroy(new Error('Unavailable')));
    req.on('error',()=>reject(new Error('Unavailable')));
    if(body!==undefined)req.write(JSON.stringify(body));
    req.end();
  });
}
function selected(config) {return Object.fromEntries(FIELDS.map(k=>[k,config[k]]));}
function remainder(config) {return Object.fromEntries(Object.entries(config).filter(([k])=>!FIELDS.includes(k)));}
async function read(io) {
  const response=await io('GET');
  if(response.status!==200||!response.data||typeof response.data!=='object'||Array.isArray(response.data)||!validPatch(selected(response.data))) throw new Error('Refused');
  return response.data;
}
export async function correct(io,save=()=>{}) {
  let before,desired,attempted=false;
  try {
    before=await read(io);
    desired={site_url:'https://redwan.work',mailer_templates_recovery_content:replacement(before.mailer_templates_recovery_content)};
    if(isDeepStrictEqual(selected(before),desired)) return 'ALREADY_CORRECT';
    // Snapshot only the two approved values, privately. No raw full-config file.
    await save(selected(before));
    const fresh=await read(io);
    if(!isDeepStrictEqual(fresh,before)) return 'REFUSED';
    attempted=true;
    const response=await io('PATCH',desired);
    const after=await read(io);
    if(response.status===200&&isDeepStrictEqual(selected(after),desired)&&isDeepStrictEqual(remainder(after),remainder(before))) return 'VERIFIED';
  } catch {}
  if(!attempted) return 'REFUSED';
  // Never blindly overwrite a concurrent third-party edit. No automatic PATCH retry.
  try {
    const current=await read(io);
    if(FIELDS.some(k=>current[k]!==desired[k]&&current[k]!==before[k])) return 'NEEDS_PRIVATE_REVIEW';
    if(isDeepStrictEqual(selected(current),selected(before))) return 'ROLLED_BACK';
    await io('PATCH',selected(before));
    const restored=await read(io);
    return isDeepStrictEqual(selected(restored),selected(before))?'ROLLED_BACK':'NEEDS_PRIVATE_REVIEW';
  } catch {return 'NEEDS_PRIVATE_REVIEW';}
}
async function main() {
  const e=process.env;
  if(e.GITHUB_REPOSITORY!=='redwan-cse/redwan.work'||e.GITHUB_REF!=='refs/heads/fix/direct-public-asset-uploads'||e.GITHUB_RUN_ATTEMPT!=='1'||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')) throw new Error('Refused');
  const resultFile=e.RUNNER_TEMP+'/auth-fix-result.json';
  if(process.argv[2]==='apply') {
    if(e.APPROVED_AUTH_FIELDS!=='site_url,mailer_templates_recovery_content'||!e.SUPABASE_ACCESS_TOKEN) throw new Error('Refused');
    let code='REFUSED';
    try {
      const path=targetPath(e.NEXT_PUBLIC_SUPABASE_URL);
      code=await correct((method,body)=>request('api.supabase.com',path,method,e.SUPABASE_ACCESS_TOKEN,body),
        original=>writeFileSync(e.RUNNER_TEMP+'/auth-fix-rollback.json',JSON.stringify(original),{mode:0o600,flag:'wx'}));
    } catch {}
    if(!CODES.has(code)) throw new Error('Refused');
    writeFileSync(resultFile,JSON.stringify({code}),{mode:0o600,flag:'wx'});
    console.log('production-auth: '+code);
  } else if(process.argv[2]==='report') {
    const {code}=JSON.parse(readFileSync(resultFile,'utf8'));
    if(!CODES.has(code)) throw new Error('Refused');
    const response=await request('api.github.com','/repos/redwan-cse/redwan.work/statuses/'+e.GITHUB_SHA,'POST',e.GITHUB_TOKEN,{state:['VERIFIED','ALREADY_CORRECT'].includes(code)?'success':'failure',context:'production-auth/correction',description:code});
    if(response.status!==201) throw new Error('Unavailable');
    if(!['VERIFIED','ALREADY_CORRECT'].includes(code)) process.exitCode=1;
  } else throw new Error('Refused');
}
if(import.meta.url.startsWith('file:')&&process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('production-auth: REFUSED');process.exitCode=1;});
