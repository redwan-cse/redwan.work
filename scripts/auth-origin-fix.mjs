// No network, environment, filesystem or production entry point remains.
// Historical executable/tests: 296ed616abdb0d43e81d32fa0ff2caed472862a6.
// Pure functions retained only for synthetic change/rollback verification.
import {isDeepStrictEqual} from 'node:util';
export const FIELDS=['site_url','mailer_templates_recovery_content'];
export const LINK='{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery';
const CODES=new Set(['VERIFIED','ALREADY_CORRECT','REFUSED','ROLLED_BACK','NEEDS_PRIVATE_REVIEW']);
export function replacement(html) {
  if(typeof html!=='string'||html.length>262144) throw new Error('Refused');
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
    await save(selected(before));
    const fresh=await read(io);
    if(!isDeepStrictEqual(fresh,before)) return 'REFUSED';
    attempted=true;
    const response=await io('PATCH',desired);
    const after=await read(io);
    if(response.status===200&&isDeepStrictEqual(selected(after),desired)&&isDeepStrictEqual(remainder(after),remainder(before))) return 'VERIFIED';
  } catch {}
  if(!attempted) return 'REFUSED';
  try {
    const current=await read(io);
    if(FIELDS.some(k=>current[k]!==desired[k]&&current[k]!==before[k])) return 'NEEDS_PRIVATE_REVIEW';
    if(isDeepStrictEqual(selected(current),selected(before))) return 'ROLLED_BACK';
    await io('PATCH',selected(before));
    const restored=await read(io);
    return isDeepStrictEqual(selected(restored),selected(before))?'ROLLED_BACK':'NEEDS_PRIVATE_REVIEW';
  } catch {return 'NEEDS_PRIVATE_REVIEW';}
}
