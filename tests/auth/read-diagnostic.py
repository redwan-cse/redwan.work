import http.client,json,os,re
ROOT='/repos/redwan-cse/redwan.work'
def api(path,body=None):
 c=http.client.HTTPSConnection('api.github.com',timeout=15)
 try:
  c.request('POST' if body is not None else 'GET',ROOT+path,None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['DIAGNOSTIC_TOKEN'],'User-Agent':'redwan-ci','Accept':'application/vnd.github+json','Content-Type':'application/json'})
  r=c.getresponse();data=r.read()
  if r.status not in (200,201):raise RuntimeError()
  return json.loads(data)
 finally:c.close()
phases=['read disposable Auth configuration','require configured recovery template','verify local template server content','reload disposable Auth after template readiness','extract actual href without reconstructing token','validate template subject']
try:
 annotations=api('/check-runs/101928474580/annotations?per_page=100')
 matched=[phase for phase in phases if any(phase in str(a.get('message','')) for a in annotations)]
 description='phase: '+('; '.join(matched) if matched else 'not present in check annotations')
 sha=os.environ['DIAGNOSTIC_SHA']
 if not re.fullmatch('[0-9a-f]{40}',sha):raise RuntimeError()
 api('/statuses/'+sha,{'state':'success','context':'mailbox/failure-phase','description':description[:140]})
 print(description)
except Exception:
 print('::error::Safe mailbox annotation retrieval unavailable.');raise SystemExit(1)
