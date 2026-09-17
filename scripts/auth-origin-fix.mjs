// Synthetic adapter only: no network, credentials, environment, disk or CLI entry point.
import {isDeepStrictEqual as equal} from 'node:util';
export const FIELDS=Object.freeze(['site_url','mailer_templates_recovery_content']);
export const LINK='{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery';
export function replacement(html) {
  if(typeof html!=='string'||html.length>262144)throw Error('TEMPLATE');
  const old=/\bhref(\s*=\s*)(["'])\s*\{\{\s*\.ConfirmationURL\s*\}\}\s*\2/gi;
  const matches=[...html.matchAll(old)];
  if(matches.length!==1||[...html.matchAll(/\{\{\s*\.ConfirmationURL\s*\}\}/g)].length!==1) {
    if(matches.length===0&&html.includes(LINK)&&!/\{\{\s*\.ConfirmationURL\s*\}\}/.test(html))return html;
    throw Error('TEMPLATE');
  }
  return html.replace(old,(_all,space,quote)=>'href'+space+quote+LINK+quote);
}
export function validPatch(body) {
  return !!body&&typeof body==='object'&&!Array.isArray(body)&&
    equal(Object.keys(body).sort(),[...FIELDS].sort())&&FIELDS.every(k=>typeof body[k]==='string')&&
    body.site_url.length<=2048&&body.mailer_templates_recovery_content.length<=262144;
}
const selected=x=>Object.fromEntries(FIELDS.map(k=>[k,x[k]]));
const rest=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!FIELDS.includes(k)));
const status=x=>Number.isInteger(x)&&x>=100&&x<=599?x:null;
const validConfig=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&validPatch(selected(x));

// All results are constructed from literals and bounded numbers; never copy error/provider text.
export async function correct(io,save=()=>{},wait=async()=>{}) {
  const r={outcome:'REFUSED',stage:'BASELINE',cause:'NONE',update_http:null,read_http:null,rollback_http:null,
    targets:'UNKNOWN',unrelated:'UNKNOWN',verify_reads:0,rollback_reads:0,read_errors:0,first_read_error:'NONE',
    rollback_attempted:false,rollback_verified:false};
  const failRead=reason=>{
    r.read_errors++;if(r.first_read_error==='NONE')r.first_read_error=reason;return {ok:false,reason};
  };
  async function read() {
    let response;
    try{response=await io('GET');}catch{r.read_http=null;return failRead('TRANSPORT_ERROR');}
    r.read_http=status(response?.status);
    if(r.read_http!==200)return failRead('READ_HTTP');
    if(!validConfig(response.data))return failRead('INVALID_READBACK');
    // Defensive copy stops mutable fixture/provider objects corrupting before/after evidence.
    try{return {ok:true,config:structuredClone(response.data)};}catch{return failRead('INVALID_READBACK');}
  }
  const initial=await read();
  if(!initial.ok){r.cause=initial.reason;return r;}
  const before=initial.config;
  let desired;
  r.stage='PREPARE';
  try{desired={site_url:'https://redwan.work',mailer_templates_recovery_content:replacement(before.mailer_templates_recovery_content)};}
  catch{r.cause='TEMPLATE';return r;}
  if(equal(selected(before),desired)){
    r.outcome='ALREADY_CORRECT';r.targets='DESIRED';r.unrelated='UNCHANGED';return r;
  }
  r.stage='SNAPSHOT';
  try{await save(selected(before));}catch{r.cause='SNAPSHOT_ERROR';return r;}
  r.stage='RECHECK';
  const fresh=await read();
  if(!fresh.ok){r.cause=fresh.reason;return r;}
  if(!equal(fresh.config,before)){r.cause='BASELINE_CHANGED';return r;}
  r.stage='UPDATE';
  try{r.update_http=status((await io('PATCH',structuredClone(desired)))?.status);}
  catch{r.cause='TRANSPORT_ERROR';}
  if(r.update_http!==200&&r.cause==='NONE')r.cause=r.update_http!==null&&r.update_http>=400&&r.update_http<500?'HTTP_REJECTED':'HTTP_UNCERTAIN';

  function observe(config) {
    r.targets=equal(selected(config),desired)?'DESIRED':equal(selected(config),selected(before))?'ORIGINAL':
      FIELDS.every(k=>config[k]===desired[k]||config[k]===before[k])?'PARTIAL':'FOREIGN';
    // Drift is sticky: later equality does not erase a previously observed change.
    if(!equal(rest(config),rest(before)))r.unrelated='CHANGED';
    else if(r.unrelated==='UNKNOWN')r.unrelated='UNCHANGED';
  }
  let latest=null;
  r.stage='VERIFY';
  for(let attempt=1;attempt<=3;attempt++){
    if(attempt>1)try{await wait(attempt);}catch{r.cause=r.cause==='NONE'?'WAIT_ERROR':r.cause;break;}
    r.verify_reads++;
    const sample=await read();
    if(!sample.ok){latest=null;continue;}
    latest=sample.config;observe(latest);
    if(r.targets==='FOREIGN'){r.outcome='CONFLICT';if(r.cause==='NONE')r.cause='THIRD_PARTY';return r;}
    if(r.targets==='DESIRED'&&r.unrelated==='UNCHANGED'&&r.update_http===200){
      r.outcome='VERIFIED';return r;
    }
  }
  if(r.update_http!==200){
    r.outcome=r.cause==='HTTP_REJECTED'&&latest&&r.targets==='ORIGINAL'&&r.unrelated==='UNCHANGED'?'UPDATE_REJECTED':'UPDATE_UNCERTAIN';
    return r; // No write retry or speculative rollback after ambiguous/rejected transport.
  }
  if(!latest){r.outcome='UPDATE_UNCERTAIN';if(r.cause==='NONE')r.cause='READBACK_UNAVAILABLE';return r;}
  if(r.targets==='ORIGINAL'){
    r.outcome='NOT_OBSERVED';if(r.cause==='NONE')r.cause=r.unrelated==='CHANGED'?'UNRELATED_DRIFT':'TARGET_NOT_OBSERVED';
    return r; // Original values observed is NOT proof of a rollback or eventual non-application.
  }
  if(r.cause==='NONE')r.cause=r.unrelated==='CHANGED'?'UNRELATED_DRIFT':'TARGET_MISMATCH';
  r.stage='ROLLBACK_GUARD';
  const guard=await read();
  if(!guard.ok){r.outcome='UPDATE_UNCERTAIN';return r;}
  observe(guard.config);
  if(!equal(selected(guard.config),selected(latest))){
    r.outcome='CONFLICT';return r; // Even an allowed-value race must not be overwritten.
  }
  r.stage='ROLLBACK';
  r.rollback_attempted=true;
  try{r.rollback_http=status((await io('PATCH',selected(before)))?.status);}catch{r.rollback_http=null;}
  r.stage='ROLLBACK_VERIFY';
  for(let attempt=1;attempt<=3;attempt++){
    if(attempt>1)try{await wait(attempt);}catch{break;}
    r.rollback_reads++;
    const sample=await read();
    if(!sample.ok)continue;
    const owned=FIELDS.every(k=>sample.config[k]===before[k]||sample.config[k]===desired[k]);
    if(!owned){r.outcome='CONFLICT';return r;}
    // Successful response AND observed originals required. Lost acknowledgement stays explicit.
    if(r.rollback_http===200&&equal(selected(sample.config),selected(before))){
      r.rollback_verified=true;r.outcome='ROLLBACK_VERIFIED';return r;
    }
  }
  r.outcome='ROLLBACK_UNVERIFIED';return r;
}
