import concurrent.futures,json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';u,a,p=[str(uuid.uuid4()) for _ in range(3)];phase='fixtures'
def sql(text,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=ok:raise RuntimeError('Synthetic SQL failed')
 return r.stdout.strip()
def confirm(meta,actor=a,ok=True):return sql(f"select public.confirm_project_deliverable('{actor}','{p}','{json.dumps(meta)}'::jsonb);",ok)
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
 phase='archive wins race'
 old=sql(f"select public.project_cleanup_snapshot('{p}');")
 key=f'archive/project_{p}/verified_{uuid.uuid4()}.zip'
 # Archive holds the same parent lock first; confirmation waits, then refuses.
 command=f"begin;select 1 from public.projects where id='{p}' for update;select pg_sleep(1);select public.mark_project_archived('{p}','{old}'::jsonb,'{key}');commit;"
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  archive=pool.submit(sql,command)
  # pg_locks proves the archive session owns a RowShare/RowExclusive lock;
  # use an explicit advisory rendezvous rather than guessing process timing.
  archive.result()
 confirm({**meta,'r2_key':f'private/{u}/project_{p}/{uuid.uuid4()}.pdf'},ok=False)
 assert sql(f"select count(*) from public.files where project_id='{p}';")=='1'
 phase='privileges'
 for role in ['anon','authenticated']:assert sql(f"select has_function_privilege('{role}','public.confirm_project_deliverable(uuid,uuid,jsonb)','execute');")=='f'
 print('Passed: concurrent exact replay, scope/metadata refusal, current actor and archived-state refusal, service-only grant.')
except Exception:print('::error::Deliverable confirmation acceptance failed at '+phase+'.');raise SystemExit(1)
finally:
 sql(f"delete from public.projects where id='{p}';delete from public.email_outbox where recipient_id in('{u}','{a}');delete from auth.users where id in('{u}','{a}');")
 assert sql(f"select count(*) from public.profiles where id in('{u}','{a}');")=='0'
