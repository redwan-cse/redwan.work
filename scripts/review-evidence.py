import http.client,json,os,re,time,urllib.parse
ROOT='/repos/redwan-cse/redwan.work'
def api(path,body=None):
 c=http.client.HTTPSConnection('api.github.com',timeout=20)
 try:
  c.request('POST' if body else 'GET',ROOT+path,None if body is None else json.dumps(body),headers={'Authorization':'Bearer '+os.environ['REVIEW_TOKEN'],'User-Agent':'redwan-read-only-review','Accept':'application/vnd.github+json','Content-Type':'application/json'})
  r=c.getresponse();data=r.read();return r.status,json.loads(data) if data else None
 finally:c.close()
def publish(context,description):
 sha=os.environ['REVIEW_SHA'];assert re.fullmatch('[0-9a-f]{40}',sha)
 code,_=api('/statuses/'+sha,{'state':'success','context':'review/'+context,'description':description[:140]});assert code==201
try:
 # A status marked success means collection succeeded, never that these inventory
 # counts or another job's checks passed. Missing permissions remain explicit.
 for name,path in [('code-alerts','/code-scanning/alerts?state=open&per_page=100'),('secret-alerts','/secret-scanning/alerts?state=open&per_page=100'),('dependency-alerts','/dependabot/alerts?state=open&per_page=100'),('protection','/branches/main/protection')]:
  code,data=api(path)
  if code!=200:publish(name,'inventory unavailable; HTTP '+str(code));continue
  if isinstance(data,list):publish(name,'open visible alerts='+str(len(data))+(' (first page only)' if len(data)==100 else ''))
  else:
   checks=data.get('required_status_checks') or {};contexts=checks.get('contexts',[])
   publish(name,'required='+str(len(contexts))+' force-push='+str(data.get('allow_force_pushes',{}).get('enabled'))+' deletion='+str(data.get('allow_deletions',{}).get('enabled')))
 target=102027571539
 deadline=time.monotonic()+600
 while time.monotonic()<deadline:
  code,check=api('/check-runs/'+str(target))
  if code!=200:publish('acceptance','check unavailable; HTTP '+str(code));break
  if check.get('status')=='completed':
   code,annotations=api('/check-runs/'+str(target)+'/annotations?per_page=100')
   phases=['fixtures','startup','invite delivery','invite preview','invite activation','invite replay','browser expiry','deactivation','reactivation','partial ban failure','partial unban failure','protected administrator','cleanup','storage setup','contact upload','public upload','recovery fixtures','financial refusal','recovery preparation','physical deletion','restore verified archive']
   messages=' '.join(str(a.get('message','')) for a in annotations) if code==200 and isinstance(annotations,list) else ''
   found=[phase for phase in phases if ' at '+phase in messages]
   publish('acceptance',str(check.get('conclusion'))+('; '+', '.join(found) if found else '; no allowlisted failure phase'))
   break
  time.sleep(15)
 else:publish('acceptance','still running at observation deadline')
except Exception:
 print('::error::Safe review evidence collection failed; no repository settings were modified.');raise SystemExit(1)
