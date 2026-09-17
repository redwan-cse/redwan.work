import concurrent.futures,json,subprocess,time,uuid
C='supabase_db_redwan-reliability-ci';u,a,p=[str(uuid.uuid4()) for _ in range(3)];phase='fixtures';holder=None
CMD=['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1']
def sql(text,ok=True):
 r=subprocess.run(CMD,input=text,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=ok:raise RuntimeError('Synthetic SQL failed')
 return r.stdout.strip()
def confirm(meta,actor=a,ok=True):return sql(f"set application_name='synthetic-deliverable-confirm';select public.confirm_project_deliverable('{actor}','{p}','{json.dumps(meta)}'::jsonb);",ok)
meta={'r2_key':f'private/{u}/project_{p}/{uuid.uuid4()}.pdf','filename':'Synthetic.pdf','mime':'application/pdf','size_bytes':17}
try:
 sql(f"insert into auth.users(id,raw_app_meta_data) values('{u}','{{\"role\":\"client\"}}'),('{a}','{{\"role\":\"admin\"}}');update public.profiles set role='admin',is_active=true where id='{a}';insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic confirm project');")
 phase='parallel replay'
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:ids=list(pool.map(lambda _:confirm(meta),range(8)))
 assert len(set(ids))==1
 assert sql(f"select count(*) from public.files where project_id='{p}';")=='1'
 phase='scope and metadata refusal'
 for bad in [{**meta,'filename':'Different.pdf'},{**meta,'r2_key':meta['r2_key'].replace(u,a)},{**meta,'size_bytes':1.5},{**meta,'size_bytes':0},{**meta,'filename':None}]:confirm(bad,ok=False)
 confirm(meta,actor=u,ok=False)
 phase='archive wins concurrent race'
 old=sql(f"select public.project_cleanup_snapshot('{p}');")
 key=f'archive/project_{p}/verified_{uuid.uuid4()}.zip'
 holder=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 holder.stdin.write(f"begin;select 'parent-locked' from public.projects where id='{p}' for update;\n");holder.stdin.flush()
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  assert pool.submit(holder.stdout.readline).result(timeout=10).strip()=='parent-locked'
  waiting=pool.submit(confirm,{**meta,'r2_key':f'private/{u}/project_{p}/{uuid.uuid4()}.pdf'},a,False)
  deadline=time.monotonic()+10;blocked=False
  while time.monotonic()<deadline:
   blocked=sql("select exists(select 1 from pg_stat_activity where application_name='synthetic-deliverable-confirm' and wait_event_type='Lock');")=='t'
   if blocked:break
   if waiting.done():raise RuntimeError('Confirmation did not wait for parent')
   time.sleep(0.05)
  assert blocked
  holder.stdin.write(f"select public.mark_project_archived('{p}','{old}'::jsonb,'{key}');commit;\n");holder.stdin.close();holder.stdin=None
  holder.communicate(timeout=10);assert holder.returncode==0
  waiting.result(timeout=10)
 assert sql(f"select count(*) from public.files where project_id='{p}';")=='1'
 phase='privileges'
 for role in ['anon','authenticated']:assert sql(f"select has_function_privilege('{role}','public.confirm_project_deliverable(uuid,uuid,jsonb)','execute');")=='f'
 print('Passed: concurrent exact replay, scope/metadata refusal, verified lock-wait then archive refusal, current actor and service-only grant.')
except Exception:print('::error::Deliverable confirmation acceptance failed at '+phase+'.');raise SystemExit(1)
finally:
 if holder and holder.poll() is None:
  holder.kill();holder.communicate(timeout=10)
 sql(f"delete from public.projects where id='{p}';delete from public.email_outbox where recipient_id in('{u}','{a}');delete from auth.users where id in('{u}','{a}');")
 assert sql(f"select count(*) from public.profiles where id in('{u}','{a}');")=='0'
