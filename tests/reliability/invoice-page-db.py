import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';users=[str(uuid.uuid4()) for _ in range(3)];projects=[str(uuid.uuid4()) for _ in range(2)];phase='fixtures'
def sql(v,success=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=v,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=success:raise RuntimeError()
 return r.stdout.strip()
try:
 sql('insert into auth.users(id) values '+','.join(f"('{u}')" for u in users)+';'+f"update public.profiles set role='admin' where id='{users[0]}';")
 for i,p in enumerate(projects):sql(f"insert into public.projects(id,client_id,name) values('{p}','{users[i+1]}','Synthetic');insert into public.invoices(project_id,currency) select '{p}','USD' from generate_series(1,31);")
 phase='bounded pages and total count'
 first=json.loads(sql(f"select public.invoice_page('{users[0]}',1,null);"));second=json.loads(sql(f"select public.invoice_page('{users[0]}',2,null);"))
 assert first['total']==62 and len(first['items'])==25 and len(second['items'])==25
 assert not(set(i['id'] for i in first['items'])&set(i['id'] for i in second['items']))
 phase='client draft isolation'
 own=json.loads(sql(f"select public.invoice_page('{users[1]}',1,null);"));assert own['total']==0 and own['items']==[]
 phase='inactive and direct role denial'
 sql(f"update public.profiles set is_active=false where id='{users[0]}';");sql(f"select public.invoice_page('{users[0]}',1,null);",False)
 for role in ['anon','authenticated']:sql(f"set role {role};select public.invoice_page('{users[1]}',1,null);",False)
 print('Passed: bounded invoice pages, exact totals, no page overlap, client draft isolation and role/state denial.')
except Exception:
 print('::error::Invoice page acceptance failed at '+phase);raise SystemExit(1)
finally:
 try:
  ps=','.join(f"'{p}'" for p in projects);us=','.join(f"'{u}'" for u in users)
  sql(f'delete from public.invoices where project_id in ({ps});delete from public.projects where id in ({ps});delete from auth.users where id in ({us});')
  assert sql(f'select count(*) from public.profiles where id in ({us});')=='0'
 except Exception:print('::error::Invoice page fixture cleanup failed.');raise SystemExit(1)
