import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_REPOSITORY,'redwan-cse/redwan.work');assert.equal(process.env.GITHUB_REF,'refs/heads/fix/direct-public-asset-uploads');
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const response=await fetch('https://api.github.com/repos/redwan-cse/redwan.work/check-runs/102116704644/annotations?per_page=100',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
assert.equal(response.ok,true);const annotations=await response.json();assert.ok(Array.isArray(annotations));
const categories=['Project transaction','Deliverable confirmation','Invoice contents'];
const phases=['fixtures','parallel additions','concurrent reorder serialization','mid-statement rollback','validation and financial refusal','archived mutations refused','large project completeness','privileges','parallel replay','scope and metadata refusal','archive wins concurrent race','complete item snapshot','complete payment snapshot','snapshot privileges'];
let description='Prior SQL check failed; no recognized safe phase annotation.';
for(const a of annotations){for(const category of categories)for(const phase of phases)if(String(a.message??'').includes(category+' acceptance failed at '+phase+'.'))description='Prior SQL failure: '+category+' / '+phase;}
if(annotations.some(a=>String(a.message??'').includes('Disposable database setup failed at migrations')))description='Prior SQL failure: disposable setup / migrations';
console.log(description);
const posted=await fetch(`https://api.github.com/repos/redwan-cse/redwan.work/statuses/${process.env.GITHUB_SHA}`,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(30000),body:JSON.stringify({state:'success',context:'diagnostics/prior-sql-phase',description:description.slice(0,140)})});assert.equal(posted.ok,true);
