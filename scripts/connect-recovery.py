"""Bounded one-time developer edit. Fixed GitHub host and branch, exact baseline."""
import base64,http.client,json,os
BRANCH='fix/recoverable-retention'
ROOT='/repos/redwan-cse/redwan.work'
def api(path,body=None,method='GET'):
    connection=http.client.HTTPSConnection('api.github.com',timeout=20)
    try:
        connection.request(method,ROOT+path,body=None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['EDIT_TOKEN'],'User-Agent':'redwan-development-ci','Accept':'application/vnd.github+json','Content-Type':'application/json'})
        response=connection.getresponse();data=response.read()
        if response.status not in (200,201):raise RuntimeError()
        return json.loads(data)
    finally:connection.close()
try:
    if os.environ.get('GITHUB_REPOSITORY')!='redwan-cse/redwan.work':raise RuntimeError()
    event=json.load(open(os.environ['GITHUB_EVENT_PATH']))
    head=event['pull_request']['head']
    if head['ref']!=BRANCH or head['repo']['full_name']!='redwan-cse/redwan.work':raise RuntimeError()
    base=api('/git/ref/heads/'+BRANCH)['object']['sha']
    item=api('/contents/lib/crm/projects.ts?ref='+base)
    if item['sha']!='a8e14bde1a6f376c604f08fab40f3e42298c43d7':
        print('Source baseline changed; no mutation.');raise SystemExit(0)
    source=base64.b64decode(item['content']).decode()
    start=source.index('export async function purgeArchivedProject(projectId: string): Promise<CrmResult> {')
    end=source.index('\nexport async function listArchivedProjects()',start)
    replacement="export async function purgeArchivedProject(projectId: string): Promise<CrmResult> {\n  const { purgeArchivedProject: prepareRecovery } = await import('@/lib/crm/retention');\n  return prepareRecovery(projectId);\n}\n"
    source=source[:start]+replacement+source[end:]
    source=source.replace('  deletePrivateObjects,\n','')
    blob=api('/git/blobs',{'content':source,'encoding':'utf-8'},'POST')
    commit=api('/git/commits/'+base)
    tree=api('/git/trees',{'base_tree':commit['tree']['sha'],'tree':[{'path':'lib/crm/projects.ts','mode':'100644','type':'blob','sha':blob['sha']}]},'POST')
    new=api('/git/commits',{'message':'fix: route project purge through verified recovery preparation','tree':tree['sha'],'parents':[base]},'POST')
    api('/git/refs/heads/'+BRANCH,{'sha':new['sha'],'force':False},'PATCH')
    print('Exact project purge delegation applied. Main untouched. Fresh-head CI required.')
except Exception:
    print('::error::Cleanup delegation edit failed. No production operations attempted.');raise SystemExit(1)
