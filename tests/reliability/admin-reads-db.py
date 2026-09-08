import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';users=[str(uuid.uuid4()) for _ in range(2)]
def sql(value,success=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=success:raise RuntimeError()
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id) values('{users[0]}'),('{users[1]}');update public.profiles set role='admin' where id='{users[0]}';insert into public.projects(client_id,name) select '{users[1]}','Synthetic page' from generate_series(1,31);")
 overview=json.loads(sql(f"select public.admin_overview('{users[0]}');"));assert overview['clients']==1 and overview['activeClients']==1
 first=json.loads(sql(f"select public.admin_projects_page('{users[0]}',1,false,1,'');"));second=json.loads(sql(f"select public.admin_projects_page('{users[0]}',2,false,1,'');"));assert first['total']==31 and len(first['projects'])==25 and len(second['projects'])==6;assert len(first['clients'])==1
 sql(f"select public.admin_overview('{users[1]}');",False);sql(f"update public.profiles set is_active=false where id='{users[0]}';");sql(f"select public.admin_projects_page('{users[0]}');",False)
 print('Passed: exact admin aggregates, bounded project/client pages and current-role denial.')
except Exception:print('::error::Admin reads acceptance failed.');raise SystemExit(1)
finally:
 ids=','.join(f"'{u}'" for u in users);sql(f'delete from public.projects where client_id in ({ids});delete from auth.users where id in ({ids});');assert sql(f'select count(*) from public.profiles where id in ({ids});')=='0'
