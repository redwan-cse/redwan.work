import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';users=[str(uuid.uuid4()) for _ in range(2)];project=str(uuid.uuid4());phase='fixtures'
def sql(text,success=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=success:raise RuntimeError()
 return r.stdout.strip()
try:
 sql('insert into auth.users(id) values '+','.join(f"('{u}')" for u in users)+';')
 sql(f"insert into public.projects(id,client_id,name) values('{project}','{users[0]}','Synthetic');insert into public.projects(client_id,name) select '{users[0]}','Synthetic empty' from generate_series(1,12);")
 sql(f"insert into public.files(bucket,r2_key,kind,project_id,uploaded_by,filename,mime,size_bytes) select 'private','private/{users[0]}/project_{project}/'||gen_random_uuid()::text||'.pdf','deliverable','{project}','{users[0]}','fixture.pdf','application/pdf',17 from generate_series(1,31);")
 phase='bounded dashboard and accurate aggregate';dashboard=json.loads(sql(f"select public.portal_dashboard('{users[0]}');"));assert dashboard['activeProjects']==13 and len(dashboard['projects'])==4
 phase='bounded grouped files';groups=json.loads(sql(f"select public.portal_files_page('{users[0]}',null,1);"));assert groups['total']==13 and len(groups['items'])==10;assert all(len(p['files'])<=10 for p in groups['items'])
 phase='complete file paging and foreign scope';first=json.loads(sql(f"select public.portal_files_page('{users[0]}','{project}',1);"));second=json.loads(sql(f"select public.portal_files_page('{users[0]}','{project}',2);"));assert first['total']==31 and len(first['items'][0]['files'])==25 and len(second['items'][0]['files'])==6;assert json.loads(sql(f"select public.portal_files_page('{users[1]}','{project}',1);"))['items']==[]
 phase='inactive denial';sql(f"update public.profiles set is_active=false where id='{users[0]}';");sql(f"select public.portal_dashboard('{users[0]}');",False)
 print('Passed: dashboard bounds, exact aggregates, grouped files, full pagination and ownership denial.')
except Exception:print('::error::Portal reads acceptance failed at '+phase);raise SystemExit(1)
finally:
 ids=','.join(f"'{u}'" for u in users);sql(f'delete from public.email_outbox where recipient_id in ({ids});delete from public.projects where client_id in ({ids});delete from auth.users where id in ({ids});');assert sql(f'select count(*) from public.profiles where id in ({ids});')=='0'
