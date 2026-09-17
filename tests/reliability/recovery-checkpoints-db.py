import os,subprocess,uuid,json
if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('Disposable CI required')
C='supabase_db_redwan-reliability-ci';a,u,p,f,op=[str(uuid.uuid4()) for _ in range(5)];fid=str(uuid.uuid5(uuid.NAMESPACE_URL,op));prefix=f'private/{u}/project_{p}/';key=prefix+fid+'.pdf';source=prefix+fid[:14]+'4'+fid[15:]+'.pdf';phase='setup';sha='c'*64
# Keys are synthetic proof fixtures. This suite does not claim storage writes.
def sql(s,code=None):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=s,text=True,capture_output=True,timeout=30)
 if code is None:
  if r.returncode:raise AssertionError('SQL failure')
 elif not r.returncode or f'{code}:' not in r.stderr:raise AssertionError('Wrong denial')
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id,raw_app_meta_data)values('{a}','{{\"role\":\"admin\"}}'),('{u}','{{\"role\":\"client\"}}');update public.profiles set role='admin',is_active=true where id='{a}';")
 snapshot=json.dumps({'id':f,'r2_key':source,'size_bytes':4,'filename':'Synthetic.pdf','mime':'application/pdf','bucket':'private','kind':'deliverable','project_id':p,'ticket_id':None})
 sql(f"insert into public.file_recovery(file_id,requested_by,file_snapshot,recovery_key,sha256,archive_bytes)values('{f}','{a}','{snapshot}','archive/project_{f}/individual_{f}.zip','{sha}',1000);")
 sql(f"select public.open_recovery_import('{a}','{op}');select public.seal_recovery_import('{a}','{op}','{sha}');")
 plan=json.dumps({'files':[{'source_id':f,'id':fid,'key':key}]})
 phase='plan persisted before storage'
 sql(f"select public.plan_recovery_objects('{a}','{op}','{plan}');")
 assert sql(f"select object_plan->'files'->0->>'key' from public.recovery_imports where id='{op}';")==key
 sql(f"select public.checkpoint_recovery_object('{a}','{op}','{f}');",'P0001')
 phase='proof required and checkpoint idempotent'
 sql(f"select public.register_immutable_upload('{source}','{key}','{sha}',4);")
 for _ in range(2):assert sql(f"select public.checkpoint_recovery_object('{a}','{op}','{f}');")=='t'
 assert sql(f"select jsonb_array_length(completed_files) from public.recovery_imports where id='{op}';")=='1'
 phase='foreign actor and changed plan denied'
 sql(f"select public.plan_recovery_objects('{u}','{op}','{plan}');",'P0001')
 changed=json.dumps({'files':[]});sql(f"select public.plan_recovery_objects('{a}','{op}','{changed}');",'P0001')
 for role in ['anon','authenticated']:sql(f"set role {role};select public.plan_recovery_objects('{a}','{op}','{plan}');",'42501')
 print('Passed: planned-key durability, proof-before-checkpoint, idempotency and actor/plan conflict denial.')
except Exception:print('::error::Recovery checkpoint SQL failed at '+phase);raise SystemExit(1)
finally:
 sql(f"delete from public.recovery_imports where id='{op}';delete from public.file_recovery where file_id='{f}';delete from public.immutable_uploads where r2_key='{key}';delete from auth.users where id in('{a}','{u}');")
 assert sql(f"select count(*) from public.recovery_imports where id='{op}';")=='0'
