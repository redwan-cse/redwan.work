import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';u,p,i=[str(uuid.uuid4()) for _ in range(3)];phase='fixtures'
def sql(text,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=60)
 if (r.returncode==0)!=ok:raise RuntimeError('Synthetic SQL failure')
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id) values('{u}');insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic financial snapshot');insert into public.invoices(id,project_id,currency) values('{i}','{p}','USD');insert into public.invoice_items(invoice_id,description,qty,unit_price_cents,position) select '{i}','Synthetic item',1,100,g from generate_series(1,1007) g;")
 phase='complete item snapshot'
 v=json.loads(sql(f"select public.invoice_contents_snapshot('{i}');"));assert len(v['items'])==1007 and v['payments']==[];assert sum(x['unit_price_cents'] for x in v['items'])==100700
 phase='complete payment snapshot'
 sql(f"select public.send_invoice_atomic('{i}');insert into public.payments(invoice_id,method,reference,amount_cents) select '{i}','bank','Synthetic reference '||g,1 from generate_series(1,1007) g;")
 v=json.loads(sql(f"select public.invoice_contents_snapshot('{i}');"));assert len(v['items'])==1007 and len(v['payments'])==1007;assert sum(x['amount_cents'] for x in v['payments'])==1007
 phase='snapshot privileges'
 for role in ['anon','authenticated']:assert sql(f"select has_function_privilege('{role}','public.invoice_contents_snapshot(uuid)','execute');")=='f'
 print('Passed: complete 1007-item and 1007-payment snapshot, exact amounts and service-only privileges.')
except Exception:print('::error::Invoice contents acceptance failed at '+phase+'.');raise SystemExit(1)
finally:
 sql(f"delete from public.email_outbox where recipient_id='{u}';delete from public.email_log where entity_id='{i}';delete from public.invoices where id='{i}';delete from public.projects where id='{p}';delete from auth.users where id='{u}';")
 assert sql(f"select count(*) from public.profiles where id='{u}';")=='0'
