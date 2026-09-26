import os,subprocess,uuid,json
if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('Disposable CI required')
C='supabase_db_redwan-reliability-ci';a,u,p,f,op,newid=[str(uuid.uuid4()) for _ in range(6)];hash_='b'*64;phase='schema'
def sql(s,code=None):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=s,text=True,capture_output=True,timeout=45)
 if code is None:
  if r.returncode:raise AssertionError('Synthetic query failed')
 elif not r.returncode or f'{code}:' not in r.stderr:raise AssertionError('Wrong rejection')
 return r.stdout.strip()
try:
 assert sql("select to_regprocedure('public.restore_recovery_import(uuid,uuid,jsonb)') is not null;")=='t'
 phase='fixtures'
 sql(f"insert into auth.users(id,raw_app_meta_data) values('{a}','{{\"role\":\"admin\"}}'),('{u}','{{\"role\":\"client\"}}');update public.profiles set role='admin',is_active=true where id='{a}';update public.profiles set role='client',is_active=true where id='{u}';insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic parent');")
 snapshot={'id':f,'project_id':p,'ticket_id':None,'uploaded_by':a,'kind':'deliverable','bucket':'private','filename':'Synthetic.pdf','mime':'application/pdf','size_bytes':4,'r2_key':f'private/{u}/project_{p}/{f}.pdf'}
 quoted=json.dumps(snapshot).replace("'","''")
 sql(f"insert into public.file_recovery(file_id,requested_by,file_snapshot,recovery_key,sha256,archive_bytes) values('{f}','{a}','{quoted}','archive/project_{f}/individual_{f}.zip','{hash_}',1000);")
 phase='admin-only import'
 sql(f"select public.open_recovery_import('{u}','{op}');",'P0001')
 sql(f"select public.open_recovery_import('{a}','{op}');")
 sql(f"select public.seal_recovery_import('{a}','{op}','{hash_}');")
 mapping={'files':[{'source_id':f,'id':newid,'key':f'private/{u}/project_{p}/{newid}.pdf'}]}
 m=json.dumps(mapping)
 phase='unauthorized restore'
 sql(f"select public.restore_recovery_import('{u}','{op}','{m}');",'P0001')
 phase='atomic restore'
 sql(f"select public.restore_recovery_import('{a}','{op}','{m}');")
 assert sql(f"select count(*) from public.files where id='{newid}';")=='1'
 assert sql(f"select count(*) from public.email_outbox where entity_id='{newid}' and state in('pending','processing');")=='0'
 phase='idempotent duplicate confirmation'
 sql(f"select public.restore_recovery_import('{a}','{op}','{m}');")
 assert sql(f"select count(*) from public.files where id='{newid}';")=='1'
 phase='table write denial'
 for role in ['anon','authenticated','service_role']:sql(f'set role {role};delete from public.recovery_imports;','42501')
 print('Passed: admin-only verified import, no-overwrite target rows, idempotent confirmation and silent restore notification handling.')
except Exception:print('::error::Recovery import SQL failed at '+phase+'.');raise SystemExit(1)
finally:
 if sql("select to_regclass('public.recovery_imports') is not null;")=='t':sql(f"delete from public.recovery_imports where id='{op}';")
 sql(f"delete from public.file_recovery where file_id='{f}';delete from public.projects where id='{p}';delete from public.email_outbox where recipient_id in('{a}','{u}');delete from auth.users where id in('{a}','{u}');")
 print('Passed: exact recovery import fixture cleanup.')
