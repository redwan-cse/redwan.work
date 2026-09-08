"""Exact-baseline, development-branch-only mechanical integration. Never main."""
import base64,http.client,json,os,re
ROOT='/repos/redwan-cse/redwan.work';BRANCH='fix/direct-public-asset-uploads'
def api(path,body=None,method='GET'):
 c=http.client.HTTPSConnection('api.github.com',timeout=20)
 try:
  c.request(method,ROOT+path,None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['EDIT_TOKEN'],'User-Agent':'reviewed-boundaries','Accept':'application/vnd.github+json','Content-Type':'application/json'})
  r=c.getresponse();data=r.read()
  if r.status not in(200,201):raise RuntimeError()
  return json.loads(data)
 finally:c.close()
def once(s,old,new):
 if s.count(old)!=1:raise RuntimeError('baseline mismatch')
 return s.replace(old,new,1)
def projects(s):
 # Preserve control flow and validation; strip only provider-derived error copy.
 s=re.sub(r'`([^`\n]*?)\$\{(?:error\?\.message \?\? \'no row\'|\w+\.message|msg)\}`',lambda m:repr(m.group(1).rstrip(': ')+'.'),s)
 s=s.replace('error: msg','error: \'Archive download unavailable.\'')
 return s
def admin(s):
 s=once(s,"import { headers } from 'next/headers';\n", "import { validateDeliverable } from '@/lib/crm/deliverable-validation';\n")
 start=s.index('// Actions derive origins from request headers only')
 end=s.index('export async function convertLeadAction',start)
 s=s[:start]+s[end:]
 block="  const h = await headers();\n  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';\n  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');"
 if s.count(block)!=2:raise RuntimeError()
 s=s.replace(block,"  let origin: string;\n  try { origin = await emailOrigin(); } catch { return { error: 'Account email configuration unavailable.' }; }")
 s=s.replace('`${proto}://${host}`','origin')
 s=once(s,"return { notice: 'Client invited — ask them to check their inbox.' };","return { notice: 'Client setup completed. New accounts receive an invitation; existing accounts keep their sign-in.' };")
 s=once(s,"return { notice: 'Invitation sent.' };","return { notice: 'Client setup completed. New accounts receive an invitation; existing accounts keep their sign-in.' };")
 start=s.index('  const sizeOk = await verifyStoredObjectSize(meta.key, meta.size_bytes);')
 end=s.index('  const result = await createFileRow({',start)
 s=s[:start]+"  const validated = await validateDeliverable(projectId, meta);\n  if (!validated) return { error: 'Attachment data is invalid. Please re-upload your files.' };\n  meta = validated;\n\n"+s[end:]
 s=once(s,'  verifyStoredObjectSize,\n','')
 s=re.sub(r'`Project lookup failed: \$\{error.message\}`',"'Project lookup failed.'",s)
 s=s.replace('error: msg',"error: 'Upload preparation failed. Please try again.'")
 s=s.replace("console.error('Asset upload failed:', e instanceof Error ? e.message : e);","console.error('Asset upload failed.');")
 s=s.replace("console.error('Asset delete failed:', e instanceof Error ? e.message : e);","console.error('Asset delete failed.');")
 return s
def detail(s):
 s=once(s,"import {listProjects} from '@/lib/crm/projects';","import {DraftProjectEditor} from '@/components/admin/draft-project-editor';")
 s=once(s,'DeleteItemButton,DraftInvoiceForm,InvoiceLifecycleControls','DeleteItemButton,InvoiceLifecycleControls')
 s=once(s,'({params}:{params:Promise<{id:string}>})','({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{projectPage?:string;projectSearch?:string}>})')
 s=once(s," const projects=draft?(await listProjects({archived:false})).filter(project=>project.status==='active'):[];"," const choices = await searchParams;")
 s=once(s,'{draft&&<DraftInvoiceForm invoice={invoice} items={items} projects={projects.map(project=>({id:project.id,name:project.name,client_name:project.client_name,client_email:project.client_email}))}/>}','{draft&&<DraftProjectEditor invoice={invoice} items={items} page={choices.projectPage} search={choices.projectSearch}/>}')
 return s
try:
 event=json.load(open(os.environ['GITHUB_EVENT_PATH']));head=event['pull_request']['head']
 if os.environ.get('GITHUB_REPOSITORY')!='redwan-cse/redwan.work' or head['ref']!=BRANCH or head['repo']['full_name']!='redwan-cse/redwan.work':raise RuntimeError()
 base=api('/git/ref/heads/'+BRANCH)['object']['sha']
 specs=[('lib/crm/projects.ts','0a362c2b3ef78cbe4b226360f6fc34abdde409b9',projects),('lib/crm/admin-actions.ts','6dc94d4572be1c7c70effe2abc961c3b59cab107',admin),('app/(admin)/admin/invoices/[id]/page.tsx','a2ab50b081bca83370f4e7809dec55c853c2c64c',detail)]
 # Blob API avoids constructing paths from runtime input.
 changes=[]
 for path,expected,transform in specs:
  # The tree lookup verifies exact file identity against the current branch.
  tree=api('/git/trees/'+api('/git/commits/'+base)['tree']['sha']+'?recursive=1')
  if tree.get('truncated'):raise RuntimeError()
  current=next(e['sha'] for e in tree['tree'] if e['path']==path)
  if current!=expected:print('Reviewed baseline changed; no branch update.');raise SystemExit(0)
  blob=api('/git/blobs/'+expected);source=base64.b64decode(blob['content']).decode();updated=transform(source)
  if updated==source:raise RuntimeError()
  changes.append((path,updated))
 entries=[]
 for path,content in changes:
  blob=api('/git/blobs',{'content':content,'encoding':'utf-8'},'POST');entries.append({'path':path,'mode':'100644','type':'blob','sha':blob['sha']})
 original=api('/git/commits/'+base);tree=api('/git/trees',{'base_tree':original['tree']['sha'],'tree':entries},'POST')
 commit=api('/git/commits',{'message':'fix: finish reviewed admin diagnostics and draft project selector','tree':tree['sha'],'parents':[base]},'POST')
 api('/git/refs/heads/'+BRANCH,{'sha':commit['sha'],'force':False},'PATCH')
 print('Three reviewed source files updated on the development branch. Fresh-head CI and diff inspection required.')
except Exception:
 print('::error::Reviewed boundary integration failed; no production operations attempted.');raise SystemExit(1)
