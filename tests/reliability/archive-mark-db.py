import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';u=str(uuid.uuid4());p=str(uuid.uuid4());key=f'archive/project_{p}/verified_{uuid.uuid4()}.zip'
def sql(s,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=ok:raise RuntimeError()
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id) values('{u}');insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic');")
 old=sql(f"select public.project_cleanup_snapshot('{p}');")
 sql(f"insert into public.milestones(project_id,title) values('{p}','Concurrent milestone');")
 sql(f"select public.mark_project_archived('{p}','{old}'::jsonb,'{key}');",False)
 assert sql(f"select archived_at is null from public.projects where id='{p}';")=='t'
 sql(f"select public.mark_project_archived('{p}',public.project_cleanup_snapshot('{p}'),'{key}');")
 assert sql(f"select archived_at is not null and archive_key='{key}' from public.projects where id='{p}';")=='t'
 for role in ['anon','authenticated']:assert sql(f"select has_function_privilege('{role}','public.mark_project_archived(uuid,jsonb,text)','execute');")=='f'
 print('Passed: snapshot mismatch refusal, verified archive transition and service-only privilege.')
except Exception:print('::error::Archive marking acceptance failed.');raise SystemExit(1)
finally:
 sql(f"delete from public.projects where id='{p}';delete from auth.users where id='{u}';")
