import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
assert.equal(process.env.GITHUB_REPOSITORY,'redwan-cse/redwan.work');
assert.equal(process.env.GITHUB_REF,'refs/heads/fix/direct-public-asset-uploads');
const integration='a8e6c8349adef339cf2dbfaf75d4a4c3ed93e3ea',main='27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a';
const refs={48:'4e9ca493fd6cdd11a82be742670455b752ca4c95',49:'b2919343d146adfdff92ed4471436aabe495fdd9',50:'7f1de0f3cfeaa31658f9fdcd574a40050f3c232a',51:'b06e8637741e5067a8908138feea96ebc1d9253a',52:'b86ce1ab93f5ea3501389f3d1c34d85332d4d826',53:'9afddf9fe753263f01b0b4ee5e79208dfc1a03fd',54:'71193183dd974040769f4f32ccb9a2c7fdec9adb',55:'d4fcd550fed53bfe56119a91488822ea51e59b4d'};
function git(args,allowed=[0]){const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:10*1024*1024,timeout:60000});assert.ok(allowed.includes(r.status),'Git inspection failed');return r;}
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
async function api(path,body){const r=await fetch('https://api.github.com/repos/redwan-cse/redwan.work'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};}
async function record(context,description){console.log(context+': '+description);appendFileSync(process.env.GITHUB_STEP_SUMMARY,context+': '+description+'\n\n');const r=await api('/statuses/'+process.env.GITHUB_SHA,{state:'success',context:'sequence-evidence/'+context,description:description.slice(0,140)});assert.equal(r.status,201);}
// These statuses attest only successful evidence collection, never release readiness.
for(const [pr,sha] of Object.entries(refs)){
 const ancestor=git(['merge-base','--is-ancestor',sha,integration],[0,1]).status===0;
 if(ancestor){await record('pr-'+pr,'Exact PR head is already an ancestor of tested integration.');continue;}
 const merge=git(['merge-tree','--write-tree',integration,sha],[0,1]);
 const base=git(['merge-base',integration,sha]).stdout.trim();
 const paths=git(['diff','--name-only',base,sha]).stdout.trim().split('\n').filter(Boolean);
 appendFileSync(process.env.GITHUB_STEP_SUMMARY,'PR '+pr+' divergent-side paths:\n'+paths.map(p=>'`'+p+'`').join('\n')+'\n\n');
 const conflicts=merge.stdout.split('\n').filter(l=>l.startsWith('CONFLICT')).length;
 await record('pr-'+pr,`Divergent: ${paths.length} changed paths; trial merge ${merge.status===0?'clean':'conflicts'} (${conflicts}).`);
 for(const path of paths){const safe=path.replace(/[^a-zA-Z0-9._/-]/g,'_');await record('pr-'+pr+'/'+safe,'Divergent-side changed path; inspect before adoption.');}
}
for(const [label,sha] of [['main',main],['integration',integration]]){
 const lock=JSON.parse(git(['show',sha+':package-lock.json']).stdout);
 for(const name of ['next','lodash','ajv','minimatch']){
  const versions=[...new Set(Object.entries(lock.packages).filter(([p])=>p==='node_modules/'+name||p.endsWith('/node_modules/'+name)).map(([,v])=>v.version))].sort();
  assert.ok(versions.every(v=>/^[0-9A-Za-z.+-]+$/.test(v)));
  await record(label+'-'+name,versions.length?versions.join(', '):'Not installed in this exact lockfile.');
 }
}
for(const [label,path] of [['main-protection','/branches/main/protection'],['main-rules','/rules/branches/main']]){
 const r=await api(path);
 if(r.status!==200){await record(label,'Settings read HTTP '+r.status+'; requirements remain unknown.');continue;}
 if(label==='main-rules'){
  assert.ok(Array.isArray(r.data));await record(label,'Active rule types: '+[...new Set(r.data.map(x=>x.type))].join(', '));
 }else await record(label,'Required approvals: '+String(r.data.required_pull_request_reviews?.required_approving_review_count??0)+'; required status count: '+String(r.data.required_status_checks?.contexts?.length??0));
}
