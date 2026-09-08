import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
assert.equal(process.env.GITHUB_REPOSITORY,'redwan-cse/redwan.work');assert.equal(process.env.GITHUB_REF,'refs/heads/fix/direct-public-asset-uploads');
const integration='a8e6c8349adef339cf2dbfaf75d4a4c3ed93e3ea',main='27ab3e3f1895b0d81231ddf1b83174fc24ad1f8a',foundation='4e9ca493fd6cdd11a82be742670455b752ca4c95',consent='9afddf9fe753263f01b0b4ee5e79208dfc1a03fd';
function git(args,allowed=[0]){const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:10*1024*1024,timeout:60000});assert.ok(allowed.includes(r.status),'Git inspection failed');return r;}
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
async function api(path,body){const r=await fetch('https://api.github.com/repos/redwan-cse/redwan.work'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};}
async function record(context,description){console.log(context+': '+description);appendFileSync(process.env.GITHUB_STEP_SUMMARY,context+': '+description+'\n\n');const r=await api('/statuses/'+process.env.GITHUB_SHA,{state:'success',context:'sequence-evidence/'+context,description:description.slice(0,140)});assert.equal(r.status,201);}
const versions=[];
for(const [label,sha] of [['main',main],['integration',integration]]){
 const lock=JSON.parse(git(['show',sha+':package-lock.json']).stdout);
 for(const name of ['next','lodash','ajv','minimatch']){const vs=[...new Set(Object.entries(lock.packages).filter(([p])=>p==='node_modules/'+name||p.endsWith('/node_modules/'+name)).map(([,v])=>v.version))].sort();assert.ok(vs.every(v=>/^[0-9A-Za-z.+-]+$/.test(v)));versions.push(label+' '+name+'='+vs.join(','));}
}
await record('versions-main',versions.slice(0,4).join('; '));await record('versions-integration',versions.slice(4).join('; '));
const m=git(['merge-tree','--write-tree',integration,foundation],[0,1]);const paths=[...new Set(m.stdout.split('\n').filter(l=>/^[0-9]{6} [0-9a-f]{40} [123]\t/.test(l)).map(l=>l.split('\t')[1]))];await record('foundation-conflicts',paths.join(', ')||'No paths reported.');
const base=git(['merge-base',integration,consent]).stdout.trim();const diff=git(['diff','--name-only',base,consent]).stdout.trim().split('\n');appendFileSync(process.env.GITHUB_STEP_SUMMARY,'PR53 divergent paths: '+diff.join(', ')+'\n');await record('consent-divergence',diff.join(', '));
// Actual settings availability is in summary; no bypass or settings mutation.
for(const [label,path] of [['main-protection','/branches/main/protection'],['main-rules','/rules/branches/main']]){const r=await api(path);const text=label+': HTTP '+r.status+(r.status===200?' readable':' requirements remain unknown');console.log(text);appendFileSync(process.env.GITHUB_STEP_SUMMARY,text+'\n');}
