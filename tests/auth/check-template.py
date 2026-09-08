"""Verify only disposable template bytes. Never print container env, URLs or keys."""
import http.client,ipaddress,json,os,pathlib,subprocess,time
from urllib.parse import urlparse

def inspect(name):
 result=subprocess.run(['docker','inspect',name],capture_output=True,check=False)
 if result.returncode:raise RuntimeError()
 return json.loads(result.stdout)[0]

phase='read disposable Auth configuration'
try:
 auth=inspect('supabase_auth_redwan-auth-ci')
 env=dict(item.split('=',1) for item in auth['Config']['Env'] if '=' in item)
 target=urlparse(env.get('GOTRUE_MAILER_TEMPLATES_RECOVERY',''))
 phase='require configured recovery template'
 if target.scheme!='http' or target.hostname!='supabase_kong_redwan-auth-ci' or target.port!=8088 or target.query or target.username or target.password or target.path!='/email/recovery.html':raise RuntimeError()
 phase='make synthetic template readable by Kong'
 template=pathlib.Path(os.environ['RUNNER_TEMP'])/'redwan-auth-ci/supabase/recovery-ci.html'
 expected=template.read_bytes()
 if b'{{ .TokenHash }}' not in expected or b'{{ .SiteURL }}' not in expected:raise RuntimeError()
 # Setup uses umask 077. Kong runs as its own non-root UID and cannot read a
 # host-owned 0600 bind-mounted template. This file contains only synthetic
 # Go-template placeholders, not a token, email, key, or private config.
 was_private=(template.stat().st_mode & 0o777)==0o600
 template.chmod(0o644)
 print('Synthetic template had owner-only permissions:',was_private)
 phase='verify local template server content'
 kong=inspect('supabase_kong_redwan-auth-ci')
 ip=next(value['IPAddress'] for value in kong['NetworkSettings']['Networks'].values() if value.get('IPAddress'))
 if not ipaddress.ip_address(ip).is_private:raise RuntimeError()
 matched=False;last_status=0;deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  connection=http.client.HTTPConnection(ip,8088,timeout=3)
  try:
   connection.request('GET','/email/recovery.html')
   response=connection.getresponse();last_status=response.status
   matched=response.status==200 and response.read(len(expected)+1)==expected
   if matched:break
  except Exception:pass
  finally:connection.close()
  time.sleep(0.25)
 if not matched:
  print('Synthetic template response status:',last_status)
  raise RuntimeError()
 print('Disposable recovery endpoint matches the exact synthetic template.')
 phase='reload disposable Auth after template readiness'
 result=subprocess.run(['docker','restart','supabase_auth_redwan-auth-ci'],capture_output=True)
 if result.returncode:raise RuntimeError()
 deadline=time.monotonic()+30;healthy=False
 while time.monotonic()<deadline:
  state=inspect('supabase_auth_redwan-auth-ci')['State']
  if state.get('Running') and state.get('Health',{}).get('Status')=='healthy':healthy=True;break
  time.sleep(0.25)
 if not healthy:raise RuntimeError()
 print('Disposable Auth healthy after verified template readiness.')
except Exception:
 print('::error::Disposable template verification failed at '+phase)
 raise SystemExit(1)
