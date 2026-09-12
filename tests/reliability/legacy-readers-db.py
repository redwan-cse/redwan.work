import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';a,u,v,p,q=[str(uuid.uuid4()) for _ in range(5)];phase='fixtures'
def sql(s,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=60)
 if (r.returncode==0)!=ok:raise RuntimeError()
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id,raw_app_meta_data) values('{a}','{{\"role\":\"admin\"}}'),('{u}','{{\"role\":\"client\"}}'),('{v}','{{\"role\":\"client\"}}');update public.profiles set role='admin' where id='{a}';insert into public.projects(id,client_id,name) values('{p}','{u}','Own'),('{q}','{v}','Foreign');insert into public.invoices(project_id,currency) select '{q}','USD' from generate_series(1,1007);")
 phase='scope before limit'
 assert len(json.loads(sql(f"select public.legacy_project_rows('{u}',false);")))==1
 assert json.loads(sql(f"select public.legacy_invoice_rows('{u}','client',null);"))==[]
 sql(f"select public.legacy_invoice_rows('{a}','admin',null);",False)
 phase='exact count beyond list limit'
 sql(f"insert into public.invoice_items(invoice_id,description,qty,unit_price_cents) select id,'Synthetic',1,100 from public.invoices where project_id='{q}';select public.send_invoice_atomic(id) from public.invoices where project_id='{q}';")
 assert sql("select public.outstanding_invoice_count(null);")=='1007';assert sql(f"select public.outstanding_invoice_count('{u}');")=='0';assert sql(f"select public.outstanding_invoice_count('{v}');")=='1007'
 phase='revoked actor'
 sql(f"update public.profiles set is_active=false where id='{u}';");sql(f"select public.legacy_invoice_rows('{u}','client',null);",False)
 phase='privileges'
 for role in ['anon','authenticated']:
  for fn in ['public.legacy_project_rows(uuid,boolean)','public.legacy_invoice_rows(uuid,text,text)','public.outstanding_invoice_count(uuid)']:assert sql(f"select has_function_privilege('{role}','{fn}','execute');")=='f'
 print('Passed: ownership filtering before limits, explicit oversize refusal, 1007 exact counts, inactive actor and privilege denial.')
except Exception:print('::error::Legacy reader acceptance failed at '+phase+'.');raise SystemExit(1)
finally:
 sql(f"delete from public.email_outbox where recipient_id in('{a}','{u}','{v}');delete from public.invoices where project_id in('{p}','{q}');delete from public.projects where id in('{p}','{q}');delete from auth.users where id in('{a}','{u}','{v}');")
