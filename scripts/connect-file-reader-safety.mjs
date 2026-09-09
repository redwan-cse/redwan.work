import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_REPOSITORY,'redwan-cse/redwan.work');assert.equal(process.env.GITHUB_REF,'refs/heads/fix/direct-public-asset-uploads');
const root='https://api.github.com/repos/redwan-cse/redwan.work',branch='fix/direct-public-asset-uploads';
async function api(path,body,method){const r=await fetch(root+path,{method:method??(body?'POST':'GET'),headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});assert.ok(r.ok,'Exact development integration refused');return r.json();}
const head=(await api('/git/ref/heads/'+branch)).object.sha;assert.equal(head,process.env.GITHUB_SHA);
const targets={'lib/crm/files.ts':'633a69a3cd3f4294b5a462788835431f90e0ea62','lib/crm/projects.ts':'e83d3f886c4550bab38fd46b6c1a3c602ef33389','lib/crm/invoices.ts':'f9e45321d5d0dfdd36d8c018dcb9553278134f04'};
const entries=[];
for(const [path,sha] of Object.entries(targets)){
 const f=await api('/contents/'+path+'?ref='+head);assert.equal(f.sha,sha);let s=Buffer.from(f.content,'base64').toString('utf8');
 if(path.endsWith('/files.ts')){
  const a=s.indexOf('export async function deleteOwnedFile('),b=s.indexOf('export async function listTicketAttachmentRows(',a);assert.ok(a>0&&b>a);
  s=s.slice(0,a)+"export {deleteOwnedFile} from '@/lib/crm/file-deletion';\n"+s.slice(b);
  // Legacy full-enumeration helpers must fail explicitly on a cap or stalled cursor.
  s=s.replace("for(const row of rows){out.push", "if(rows.length&&rows[rows.length-1].id<=after)throw new Error('Deliverable pagination stalled.');if(out.length+rows.length>10000)throw new Error('Use paginated deliverables.');for(const row of rows){out.push");
  s=s.replace("for(const row of data??[])keys.push(row.r2_key);", "if(data?.length&&data[data.length-1].id<=after)throw new Error('Orphan pagination stalled.');if(keys.length+(data?.length??0)>10000)throw new Error('Use bounded orphan maintenance.');for(const row of data??[])keys.push(row.r2_key);");
 }else if(path.endsWith('/projects.ts')){
  const a=s.indexOf('async function hydrateProjectRow('),b=s.indexOf('export async function createProject(',a);assert.ok(a>0&&b>a);
  s=s.slice(0,a)+"export {listProjects,listArchivedProjects,listOwnProjects} from '@/lib/crm/compatibility-readers';\n"+s.slice(b);
  for(const [start,end] of [['export async function listArchivedProjects(', 'export async function getArchiveDownloadUrl('],['export async function listOwnProjects(', 'export async function countOwnActiveProjects(']]){const x=s.indexOf(start),y=s.indexOf(end,x);assert.ok(x>0&&y>x);s=s.slice(0,x)+s.slice(y);}
 }else{
  const a=s.indexOf('export async function listInvoices('),b=s.indexOf('export async function getInvoiceDetail(',a);assert.ok(a>0&&b>a);
  s=s.slice(0,a)+"export {listInvoices,countUnpaidInvoices,countOwnOutstandingInvoices} from '@/lib/crm/compatibility-readers';\n\n"+s.slice(b);
  const x=s.indexOf('export async function countUnpaidInvoices('),y=s.indexOf('export async function submitPayment(',x);assert.ok(x>0&&y>x);s=s.slice(0,x)+s.slice(y);
 }
 const blob=await api('/git/blobs',{content:s,encoding:'utf-8'});entries.push({path,mode:'100644',type:'blob',sha:blob.sha});
}
const base=await api('/git/commits/'+head),tree=await api('/git/trees',{base_tree:base.tree.sha,tree:entries}),commit=await api('/git/commits',{message:'fix: connect durable file deletion and bounded compatibility readers',tree:tree.sha,parents:[head]});assert.equal((await api('/git/ref/heads/'+branch)).object.sha,head);await api('/git/refs/heads/'+branch,{sha:commit.sha,force:false},'PATCH');console.log('Connected exactly three inspected development files.');
