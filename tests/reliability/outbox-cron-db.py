import http.server,json,pathlib,secrets,subprocess,threading,time,uuid
C='supabase_db_redwan-reliability-ci';phase='setup';server=None;secret_id=None;request_ids=[];received=[];token=secrets.token_urlsafe(48)
CMD=['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def sql(s,ok=True):
 r=subprocess.run(CMD,input=s,text=True,capture_output=True,timeout=40)
 if (r.returncode==0)!=ok:raise RuntimeError('Disposable scheduler SQL failed')
 return r.stdout.strip()
try:
 # This suite is reached only in the local reliability database workflow.
 info=json.loads(subprocess.run(['docker','inspect',C],capture_output=True,text=True,check=True).stdout)[0]
 assert info['Name']=='/'+C
 network=next(n for n in info['NetworkSettings']['Networks'].values() if n.get('Gateway') and n.get('IPAddress'))
 gateway=network['Gateway'];db_ip=network['IPAddress']
 import ipaddress
 assert ipaddress.ip_address(gateway).is_private and ipaddress.ip_address(db_ip).is_private
 class Handler(http.server.BaseHTTPRequestHandler):
  def do_GET(self):
   valid=self.client_address[0]==db_ip and self.path=='/api/cron/email-outbox' and self.headers.get('Authorization')=='Bearer '+token
   received.append(valid)
   self.send_response(200 if valid else 401);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"completed":0,"failed":0,"deferred":0}')
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('0.0.0.0',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 source=pathlib.Path('supabase/operations/install_email_outbox_cron.sql').read_text()
 target='https://redwan.work/api/cron/email-outbox';assert source.count(target)==1
 # Only the isolated test copy changes destination; committed installer stays HTTPS/fixed-host.
 fixture=source.replace(target,f'http://{gateway}:{server.server_port}/api/cron/email-outbox')
 phase='installation'
 sql(fixture);assert sql("select count(*) from cron.job where jobname='redwan-email-outbox' and schedule='*/5 * * * *' and active=false;")=='1'
 phase='missing credential refusal'
 sql('select app_scheduler.invoke_email_outbox();',False);assert received==[]
 for role in ['anon','authenticated','service_role']:
  assert sql(f"select has_function_privilege('{role}','app_scheduler.invoke_email_outbox()','execute');")=='f'
 phase='vault credential'
 secret_id=sql(f"select vault.create_secret('{token}','redwan_email_outbox_cron_secret');");uuid.UUID(secret_id)
 phase='actual pg_net delivery'
 rid=int(sql('select app_scheduler.invoke_email_outbox();'));request_ids.append(rid)
 deadline=time.monotonic()+15
 while not received and time.monotonic()<deadline:time.sleep(.1)
 assert received==[True]
 phase='actual cron execution'
 # Accelerated test-only schedule; assert shipped five-minute configuration above.
 sql("select cron.alter_job(jobid,schedule:='1 second',active:=true) from cron.job where jobname='redwan-email-outbox';")
 deadline=time.monotonic()+20
 while len(received)<2 and time.monotonic()<deadline:time.sleep(.1)
 sql("select cron.alter_job(jobid,active:=false) from cron.job where jobname='redwan-email-outbox';")
 assert len(received)>=2 and all(received)
 phase='reinstall inactive and singular'
 sql(fixture);assert sql("select count(*) from cron.job where jobname='redwan-email-outbox' and schedule='*/5 * * * *' and active=false;")=='1'
 phase='invalid credential refusal'
 sql(f"select vault.update_secret('{secret_id}', 'short');")
 sql('select app_scheduler.invoke_email_outbox();',False)
 print('Passed: disabled five-minute installation, missing/invalid Vault denial, service-role denial, actual pg_net GET and real scheduled cron delivery, idempotent inactive reinstall.')
except Exception:
 print('::error::Outbox cron acceptance failed at '+phase+'.');raise SystemExit(1)
finally:
 # Only this suite owns this job/name in this fresh local database.
 sql("select cron.unschedule(jobid) from cron.job where jobname='redwan-email-outbox';")
 if secret_id:sql(f"delete from vault.secrets where id='{secret_id}';")
 if server:server.shutdown();server.server_close()
 assert sql("select count(*) from cron.job where jobname='redwan-email-outbox';")=='0'
 assert sql("select count(*) from vault.secrets where name='redwan_email_outbox_cron_secret';")=='0'
 # Disposable stack teardown clears internal pg_net queues/responses and test function.
