"""One-use exact-blob mechanical edit, development branch only. No production API."""
import base64,hashlib,http.client,json,os
ROOT='/repos/redwan-cse/redwan.work';BRANCH='fix/direct-public-asset-uploads'
if os.environ.get('GITHUB_REPOSITORY')!='redwan-cse/redwan.work' or os.environ.get('GITHUB_REF')!='refs/heads/'+BRANCH:raise SystemExit('Unexpected development context')
def api(method,path,body=None):
 c=http.client.HTTPSConnection('api.github.com',timeout=30)
 c.request(method,ROOT+path,body=None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','User-Agent':'bounded-project-contract-edit','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'})
 r=c.getresponse();raw=r.read();c.close()
 if r.status not in (200,201):raise RuntimeError('Repository edit refused')
 return json.loads(raw)
def source(sha):
 blob=api('GET','/git/blobs/'+sha);raw=base64.b64decode(blob['content']);assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==sha;return raw.decode()
def replace(s,old,new,count=1):
 assert s.count(old)==count,'Source baseline mismatch'
 return s.replace(old,new)
head=api('GET','/git/ref/heads/'+BRANCH)['object']['sha']
assert head==os.environ['GITHUB_SHA'],'Branch advanced before edit'
commit=api('GET','/git/commits/'+head)
targets={'lib/crm/admin-actions.ts':'7e26227224ddfc63203b90b56d3f8c6a884f8f50','components/admin/project-forms.tsx':'da9653885fc78339b3d6fe380e46fc6abd398ce0'}
for path,sha in targets.items():
 current=api('GET','/contents/'+path+'?ref='+head);assert current['sha']==sha,'Inspected source changed'
s=source(targets['lib/crm/admin-actions.ts'])
s=replace(s,"import { validateDeliverable }", "import { parseMilestoneMoney } from '@/lib/crm/milestone-money';\nimport { validateDeliverable }")
a=s.index('  let amount_cents: number | undefined;');b=s.index('\n  const result = await addMilestone(',a)
s=s[:a]+"  const parsed = parseMilestoneMoney(String(formData.get('amount_cents') ?? ''), String(formData.get('amount') ?? ''));\n  if (!parsed.ok) return { error: 'Invalid amount. Use whole cents or at most two decimal places.' };\n  const amount_cents = parsed.amount_cents;\n"+s[b:]
a=s.index("    if (formData.has('amount_cents')) {");b=s.index('\n  }\n\n  const result = await updateMilestone(',a)
s=s[:a]+"    if (formData.has('amount_cents') || formData.has('amount')) {\n      const parsed = parseMilestoneMoney(String(formData.get('amount_cents') ?? ''), String(formData.get('amount') ?? ''));\n      if (!parsed.ok) return { error: 'Invalid amount. Use whole cents or at most two decimal places.' };\n      if (parsed.amount_cents !== undefined) patch.amount_cents = parsed.amount_cents;\n    }"+s[b:]
s=replace(s,"admin.from('projects').select('client_id').eq('id', projectId).maybeSingle()","admin.from('projects').select('client_id').eq('id', projectId).is('archived_at', null).maybeSingle()")
s=replace(s,'Project archived. Download the backup from the Projects list within 30 days.','Project archived with a verified backup. Download it from the Projects list; recovery copies are retained.')
c=source(targets['components/admin/project-forms.tsx'])
c=replace(c,'  function onDelete() {\n    setError(null);',"  function onDelete() {\n    if (!window.confirm('Delete this milestone? Financially referenced milestones cannot be deleted.')) return;\n    setError(null);")
c=replace(c,'Amount ($)','Amount')
c=replace(c,'Delete forever','Prepare cleanup',3)
c=replace(c,'This will permanently delete the project, its milestones, files, and backup ZIP. Type', 'This verifies and retains a recovery backup, removes project records, and queues source files for deletion. Projects with invoices are refused. Type')
entries=[]
for path,text in [('lib/crm/admin-actions.ts',s),('components/admin/project-forms.tsx',c)]:
 blob=api('POST','/git/blobs',{'content':text,'encoding':'utf-8'});entries.append({'path':path,'mode':'100644','type':'blob','sha':blob['sha']})
tree=api('POST','/git/trees',{'base_tree':commit['tree']['sha'],'tree':entries})
new=api('POST','/git/commits',{'message':'fix: integrate exact milestone amounts and truthful cleanup copy','tree':tree['sha'],'parents':[head]})
assert api('GET','/git/ref/heads/'+BRANCH)['object']['sha']==head,'Branch advanced during edit'
api('PATCH','/git/refs/heads/'+BRANCH,{'sha':new['sha'],'force':False})
print('Updated exactly two inspected development files; no main or production changes.')
