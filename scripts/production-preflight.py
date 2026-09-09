"""Read-only production metadata probes. No app imports, SDKs, subprocesses or writes to providers."""
import datetime,hashlib,hmac,http.client,json,os,re,ssl,sys
from urllib.parse import urlsplit,quote
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

CODES={'PASS','FAIL','MISSING','INVALID','DENIED','UNAVAILABLE','UNKNOWN','NOT_CHECKED','RESTRICTED'}
LABELS={'supabase-url','supabase-key-format','supabase-jwks','supabase-data-access','outbox-table','auth-config-access','auth-site','auth-smtp','auth-recovery-template','resend-domain','r2-private-access','r2-private-cors','r2-public-access','r2-public-cors','public-cdn-config','production-backup','migration-ledger','vercel-environment','cron-active','preflight'}
RESULT={}
def emit(label,code):
 assert label in LABELS and code in CODES
 RESULT[label]=code
 print(label+': '+code,flush=True)

def hostname(value,kind):
 if not isinstance(value,str):raise ValueError()
 u=urlsplit(value)
 if u.scheme!='https' or u.username or u.password or u.port not in (None,443) or u.query or u.fragment or u.path not in ('','/'):raise ValueError()
 pattern=r'[a-z0-9]{20}\.supabase\.co' if kind=='supabase' else r'[a-f0-9]{32}\.r2\.cloudflarestorage\.com'
 if not re.fullmatch(pattern,u.hostname or ''):raise ValueError()
 return u.hostname

def request(host,path,headers=None,method='GET'):
 # No redirects, no arbitrary endpoints, no object listing or customer row reads.
 allowed=False
 if re.fullmatch(r'[a-z0-9]{20}\.supabase\.co',host):
  allowed=method=='GET' and path in ['/auth/v1/.well-known/jwks.json','/rest/v1/profiles?select=id&limit=0','/rest/v1/email_outbox?select=id&limit=0']
 elif host=='api.supabase.com':allowed=method=='GET' and bool(re.fullmatch(r'/v1/projects/[a-z0-9]{20}/config/auth',path))
 elif host=='api.resend.com':allowed=method=='GET' and path=='/domains'
 elif re.fullmatch(r'[a-f0-9]{32}\.r2\.cloudflarestorage\.com',host):allowed=bool(re.fullmatch(r'/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](?:\?cors=)?',path)) and ((method=='HEAD' and '?' not in path) or (method=='GET' and path.endswith('?cors=')))
 if not allowed:raise ValueError('Disallowed probe')
 c=http.client.HTTPSConnection(host,timeout=15,context=ssl.create_default_context())
 try:
  c.request(method,path,headers={'User-Agent':'redwan-readonly-preflight','Accept':'application/json',**(headers or {})})
  r=c.getresponse();body=r.read(524289)
  if len(body)>524288:raise ValueError('Bounded response exceeded')
  return r.status,body
 finally:c.close()

def status(code):
 if code in (401,403):return 'DENIED'
 return 'PASS' if 200<=code<300 else 'UNAVAILABLE'

def json_get(host,path,headers):
 code,body=request(host,path,headers)
 try:data=json.loads(body)
 except Exception:data=None
 return code,data

class Links(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.links.extend(v for k,v in attrs if k=='href' and v)

def recovery_template(value):
 if not isinstance(value,str):return False
 parser=Links();parser.feed(value)
 expected='{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery'
 return len(parser.links)==1 and parser.links[0]==expected

def supabase(env):
 url=env.get('NEXT_PUBLIC_SUPABASE_URL','')
 if not url:emit('supabase-url','MISSING');return
 try:host=hostname(url,'supabase')
 except Exception:emit('supabase-url','INVALID');return
 emit('supabase-url','PASS')
 pub=env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','');secret=env.get('SUPABASE_SECRET_KEY','')
 emit('supabase-key-format','PASS' if pub.startswith('sb_publishable_') and secret.startswith('sb_secret_') else 'INVALID')
 try:
  code,data=json_get(host,'/auth/v1/.well-known/jwks.json',{})
  valid=isinstance(data,dict) and isinstance(data.get('keys'),list) and any(k.get('kty') in ('EC','RSA','OKP') and 'd' not in k for k in data['keys'] if isinstance(k,dict))
  emit('supabase-jwks',('PASS' if valid else 'FAIL') if code==200 else status(code))
 except Exception:emit('supabase-jwks','UNAVAILABLE')
 if secret.startswith('sb_secret_'):
  for label,path in [('supabase-data-access','/rest/v1/profiles?select=id&limit=0'),('outbox-table','/rest/v1/email_outbox?select=id&limit=0')]:
   try:
    code,data=json_get(host,path,{'apikey':secret})
    emit(label,('PASS' if data==[] else 'FAIL') if code==200 else status(code))
   except Exception:emit(label,'UNAVAILABLE')
 else:emit('supabase-data-access','NOT_CHECKED');emit('outbox-table','NOT_CHECKED')
 access=env.get('SUPABASE_ACCESS_TOKEN','')
 if not access:emit('auth-config-access','MISSING');return
 try:
  code,data=json_get('api.supabase.com','/v1/projects/'+host.split('.')[0]+'/config/auth',{'Authorization':'Bearer '+access})
  emit('auth-config-access',status(code))
  if code!=200 or not isinstance(data,dict):return
  emit('auth-site','PASS' if str(data.get('site_url','')).rstrip('/')=='https://redwan.work' else 'FAIL')
  emit('auth-smtp','PASS' if data.get('smtp_host') and data.get('smtp_user') and data.get('smtp_admin_email') else 'FAIL')
  emit('auth-recovery-template','PASS' if recovery_template(data.get('mailer_templates_recovery_content')) else 'FAIL')
 except Exception:emit('auth-config-access','UNAVAILABLE')

def resend(env):
 key=env.get('RESEND_API_KEY','')
 if not key:emit('resend-domain','MISSING');return
 try:
  code,data=json_get('api.resend.com','/domains',{'Authorization':'Bearer '+key})
  if isinstance(data,dict) and data.get('name')=='restricted_api_key':emit('resend-domain','RESTRICTED');return
  if code!=200:emit('resend-domain',status(code));return
  rows=data.get('data') if isinstance(data,dict) else None
  if not isinstance(rows,list):emit('resend-domain','UNKNOWN');return
  sender=env.get('RESEND_FROM_EMAIL','')
  valid=sender=='no-reply@redwan.work' and any(d.get('name')=='redwan.work' and d.get('status')=='verified' for d in rows if isinstance(d,dict))
  emit('resend-domain','PASS' if valid else 'UNKNOWN' if data.get('has_more') else 'FAIL')
 except Exception:emit('resend-domain','UNAVAILABLE')

def signed_headers(host,bucket,access,secret,method,query):
 if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',bucket) or not access or not secret:raise ValueError()
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%SZ');day=now.strftime('%Y%m%d')
 empty=hashlib.sha256(b'').hexdigest();names='host;x-amz-content-sha256;x-amz-date'
 canonical='\n'.join([method,'/'+quote(bucket,safe=''),query,'host:'+host+'\nx-amz-content-sha256:'+empty+'\nx-amz-date:'+stamp+'\n',names,empty])
 scope=day+'/auto/s3/aws4_request';string='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
 k=('AWS4'+secret).encode()
 for item in [day,'auto','s3','aws4_request']:k=hmac.new(k,item.encode(),hashlib.sha256).digest()
 signature=hmac.new(k,string.encode(),hashlib.sha256).hexdigest()
 return {'Host':host,'x-amz-content-sha256':empty,'x-amz-date':stamp,'Authorization':'AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders='+names+', Signature='+signature}

def cors_allows(body):
 root=ET.fromstring(body)
 for rule in root:
  fields={}
  for el in rule:fields.setdefault(el.tag.split('}')[-1],[]).append(el.text or '')
  origins=fields.get('AllowedOrigin',[]);methods=fields.get('AllowedMethod',[]);hs=[x.lower() for x in fields.get('AllowedHeader',[])]
  if 'https://redwan.work' in origins and 'PUT' in methods and ('*' in hs or 'content-type' in hs):return True
 return False

def r2(env):
 try:host=hostname(env.get('R2_ENDPOINT',''),'r2')
 except Exception:
  for kind in ['private','public']:emit('r2-'+kind+'-access','INVALID');emit('r2-'+kind+'-cors','NOT_CHECKED')
  return
 for kind in ['private','public']:
  prefix='R2_'+kind.upper();bucket=env.get(prefix+'_BUCKET','');access=env.get(prefix+'_ACCESS_KEY_ID','');secret=env.get(prefix+'_SECRET_ACCESS_KEY','')
  if not all([bucket,access,secret]):emit('r2-'+kind+'-access','MISSING');continue
  for method,query,label in [('HEAD','','access'),('GET','cors=','cors')]:
   try:
    hs=signed_headers(host,bucket,access,secret,method,query);code,body=request(host,'/'+quote(bucket,safe='')+('?' +query if query else ''),hs,method)
    result=status(code)
    if 200<=code<300 and label=='cors':result='PASS' if cors_allows(body) else 'FAIL'
    emit('r2-'+kind+'-'+label,result)
   except Exception:emit('r2-'+kind+'-'+label,'UNAVAILABLE')

def main():
 if os.environ.get('GITHUB_REPOSITORY')!='redwan-cse/redwan.work' or os.environ.get('GITHUB_REF')!='refs/heads/fix/direct-public-asset-uploads' or os.environ.get('PREFLIGHT_READ_ONLY')!='true':raise ValueError()
 for probe in [supabase,resend,r2]:probe(os.environ)
 emit('public-cdn-config','PASS' if os.environ.get('NEXT_PUBLIC_R2_PUBLIC_BASE_URL','').rstrip('/')=='https://cdn.redwan.work' else 'INVALID')
 for name in ['production-backup','migration-ledger','vercel-environment','cron-active']:emit(name,'NOT_CHECKED')
 # Only fixed labels/codes reach disk; raw responses/secrets remain in memory.
 path=os.path.join(os.environ['RUNNER_TEMP'],'production-preflight-safe.json')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as stream:json.dump(RESULT,stream)

if __name__=='__main__':
 try:main()
 except BaseException:
  print('preflight: UNAVAILABLE');sys.exit(1)
