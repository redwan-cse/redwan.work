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
 for name,path in [('code-alerts','/code-scanning/alerts?state=open&per_page=100'),('secret-alerts','/secret-scanning/alerts?state=open&per_page=100'),('dependency-alerts','/dependabot/alerts?state=open&per_page=100'),('protection','/branches/main/protection')]:
  code,data=api(path)
  if code!=200:publish(name,'inventory unavailable; HTTP '+str(code));continue
  if isinstance(data,list):
   publish(name,'open visible alerts='+str(len(data))+(' (first page only)' if len(data)==100 else ''))
   if name=='code-alerts':
    for item in data[:10]:
     instance=item.get('most_recent_instance',{});location=instance.get('location',{});path=location.get('path','');rule=item.get('rule',{}).get('id','');ref=instance.get('ref','')
     if all(isinstance(v,str) and re.fullmatch(r'[A-Za-z0-9_./()\[\]: -]{0,500}',v) for v in [path,rule,ref]):
      publish('alert-'+str(item['number']),f"{path}:{location.get('start_line',0)} {rule} {ref}")
  else:
   checks=data.get('required_status_checks') or {};contexts=checks.get('contexts',[])
   publish(name,'required='+str(len(contexts))+' force-push='+str(data.get('allow_force_pushes',{}).get('enabled'))+' deletion='+str(data.get('allow_deletions',{}).get('enabled')))
 # Read only this known failed AI job, with no raw log publication.
 c=http.client.HTTPSConnection('api.github.com',timeout=20)
 c.request('GET',ROOT+'/actions/jobs/102027521710/logs',headers={'Authorization':'Bearer '+os.environ['REVIEW_TOKEN'],'User-Agent':'redwan-read-only-review','Accept':'application/vnd.github+json'})
 r=c.getresponse();code=r.status;location=r.getheader('Location');body=r.read(10000000);c.close()
 if code==302 and location:
  url=urllib.parse.urlsplit(location)
  if url.scheme!='https' or url.username or url.password or not url.hostname or not(url.hostname.endswith('.blob.core.windows.net') or url.hostname.endswith('.actions.githubusercontent.com')):raise RuntimeError()
  c=http.client.HTTPSConnection(url.hostname,timeout=20);c.request('GET',url.path+('?' + url.query if url.query else ''));r=c.getresponse();code=r.status;body=r.read(10000000);c.close()
 if code==200:
  text=body.decode(errors='replace').lower()
  classification='unsupported model before review' if 'the requested model is not supported' in text else 'permission failure' if 'resource not accessible' in text else 'logs retrieved; cause needs manual review'
  publish('ai-review',classification)
 else:publish('ai-review','job log unavailable; HTTP '+str(code))
 target=102027571539;deadline=time.monotonic()+600
 while time.monotonic()<deadline:
  code,check=api('/check-runs/'+str(target))
  if code!=200:publish('acceptance','check unavailable; HTTP '+str(code));break
  if check.get('status')=='completed':
   code,annotations=api('/check-runs/'+str(target)+'/annotations?per_page=100')
   phases=['fixtures','startup','invite delivery','invite preview','invite activation','invite replay','browser expiry','deactivation','reactivation','partial ban failure','partial unban failure','protected administrator','cleanup','storage setup','contact upload','public upload','recovery fixtures','financial refusal','recovery preparation','physical deletion','restore verified archive']
   messages=' '.join(str(a.get('message','')) for a in annotations) if code==200 and isinstance(annotations,list) else ''
   found=[phase for phase in phases if ' at '+phase in messages]
   publish('acceptance',str(check.get('conclusion'))+('; '+', '.join(found) if found else '; no allowlisted failure phase'));break
  time.sleep(15)
 else:publish('acceptance','still running at observation deadline')
except Exception:
 print('::error::Safe review evidence collection failed; no repository settings were modified.');raise SystemExit(1)
