import base64,http.client,json,os
ROOT='/repos/redwan-cse/redwan.work';BRANCH='fix/direct-public-asset-uploads';EXPECTED='d374bae66990d25e7266438e980c1fb13fc4610a'
def api(path,body=None,method='GET'):
 c=http.client.HTTPSConnection('api.github.com',timeout=20)
 try:
  c.request(method,ROOT+path,None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['EDIT_TOKEN'],'User-Agent':'archive-integration','Content-Type':'application/json','Accept':'application/vnd.github+json'})
  r=c.getresponse();raw=r.read()
  if r.status not in(200,201):raise RuntimeError()
  return json.loads(raw)
 finally:c.close()
try:
 event=json.load(open(os.environ['GITHUB_EVENT_PATH']));head=event['pull_request']['head']
 if os.environ['GITHUB_REPOSITORY']!='redwan-cse/redwan.work' or head['ref']!=BRANCH or head['repo']['full_name']!='redwan-cse/redwan.work':raise RuntimeError()
 base=api('/git/ref/heads/'+BRANCH)['object']['sha'];commit=api('/git/commits/'+base);tree=api('/git/trees/'+commit['tree']['sha']+'?recursive=1')
 if tree.get('truncated'):raise RuntimeError()
 if next(e['sha'] for e in tree['tree'] if e['path']=='lib/crm/projects.ts')!=EXPECTED:print('Baseline changed; no operation.');raise SystemExit(0)
 source=base64.b64decode(api('/git/blobs/'+EXPECTED)['content']).decode()
 start=source.index('export async function archiveProject(');end=source.index('export async function purgeArchivedProject(',start)
 source=source[:start]+"export async function archiveProject(projectId: string): Promise<{ ok: true; archiveKey: string } | { ok: false; error: string }> {\n  return verifiedArchive(projectId);\n}\n\n"+source[end:]
 source=source.replace("import * as archiverNS from 'archiver';","import { archiveProject as verifiedArchive } from '@/lib/crm/verified-archive';")
 for line in ['  ARCHIVE_MAX_BYTES,\n','  getPrivateObjectBytes,\n','  putPrivateObject,\n']:source=source.replace(line,'')
 blob=api('/git/blobs',{'content':source,'encoding':'utf-8'},'POST');newtree=api('/git/trees',{'base_tree':commit['tree']['sha'],'tree':[{'path':'lib/crm/projects.ts','mode':'100644','type':'blob','sha':blob['sha']}]},'POST');new=api('/git/commits',{'message':'fix: replace legacy archive path with verified full snapshot backup','tree':newtree['sha'],'parents':[base]},'POST');api('/git/refs/heads/'+BRANCH,{'sha':new['sha'],'force':False},'PATCH')
 print('Archive wrapper connected on development branch only. Fresh-head verification required.')
except Exception:print('::error::Verified archive integration failed.');raise SystemExit(1)
