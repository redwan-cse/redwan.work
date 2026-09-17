import json,subprocess,uuid,concurrent.futures
C='supabase_db_redwan-reliability-ci';users=[str(uuid.uuid4()) for _ in range(2)];ticket=str(uuid.uuid4());phase='fixtures'
def sql(value,success=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=success:raise RuntimeError()
 return r.stdout.strip()
try:
 # Test scripts run sequentially on a disposable DB. Only drain fixture events;
 # freeze earlier synthetic events so claim selection is deterministic.
 sql("update public.email_outbox set next_attempt_at=now()+interval '1 day' where state='pending';")
 sql(f"insert into auth.users(id) values('{users[0]}'),('{users[1]}');update public.profiles set role='admin' where id='{users[0]}';")
 phase='transaction rollback leaves no event'
 sql(f"begin;insert into public.tickets(id,client_id,subject) values('{ticket}','{users[1]}','Synthetic');rollback;")
 assert sql(f"select count(*) from public.email_outbox where entity_id='{ticket}';")=='0'
 phase='creation persists one recipient event'
 sql(f"insert into public.tickets(id,client_id,subject) values('{ticket}','{users[1]}','Synthetic');insert into public.ticket_messages(ticket_id,author_id,body) values('{ticket}','{users[1]}','First message');")
 assert sql(f"select count(*) from public.email_outbox where entity_id='{ticket}';")=='1'
 phase='concurrent claims never lease the same event'
 def claim(_):return sql("select row_to_json(e) from public.claim_email_event() e;")
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:claimed=[v for v in pool.map(claim,range(6)) if v]
 assert len(claimed)==1
 event=json.loads(claimed[0]);event_id=event['id'];lease=event['lease_token']
 phase='stale completion is fenced'
 assert sql(f"select public.finish_email_event('{event_id}','{uuid.uuid4()}','accepted','synthetic-provider',null);")=='f'
 assert sql(f"select public.finish_email_event('{event_id}','{lease}','pending',null,'provider_timeout');")=='t'
 assert sql(f"select state from public.email_outbox where id='{event_id}';")=='pending'
 phase='audit and outcome atomicity'
 sql(f"update public.email_outbox set next_attempt_at=now() where id='{event_id}';")
 again=json.loads(claim(0));assert again['id']==event_id and again['lease_token']!=lease
 assert sql(f"select public.finish_email_event('{event_id}','{again['lease_token']}','accepted','synthetic-provider',null);")=='t'
 assert sql(f"select count(*) from public.email_log where entity_id='{ticket}' and resend_id='synthetic-provider' and status='sent';")=='1'
 phase='reply and manual status event capture'
 sql(f"insert into public.ticket_messages(ticket_id,author_id,body) values('{ticket}','{users[0]}','Synthetic reply');")
 assert sql(f"select count(*) from public.email_outbox where entity_id='{ticket}' and template='reply-posted';")=='1'
 assert sql(f"select count(*) from public.email_outbox where entity_id='{ticket}' and template='status-changed';")=='0'
 sql(f"update public.tickets set status='closed' where id='{ticket}';")
 assert sql(f"select count(*) from public.email_outbox where entity_id='{ticket}' and template='status-changed';")=='1'
 phase='crashed final attempt becomes visible failure'
 sql(f"update public.email_outbox set state='processing',attempts=5,lease_until=now()-interval '1 minute' where entity_id='{ticket}' and template='reply-posted';select public.claim_email_event();")
 assert sql(f"select state from public.email_outbox where entity_id='{ticket}' and template='reply-posted';")=='failed'
 phase='untrusted role cannot dispatch'
 for role in ['anon','authenticated']:sql(f'set role {role};select public.claim_email_event();',False)
 print('Passed: transaction-coupled events, concurrent claim isolation, retry fencing, atomic audit outcomes and exhaustion.')
except Exception:
 print('::error::Outbox database acceptance failed at '+phase);raise SystemExit(1)
finally:
 try:
  sql(f"delete from public.email_outbox where entity_id='{ticket}';delete from public.email_log where entity_id='{ticket}';delete from public.tickets where id='{ticket}';delete from auth.users where id in ('{users[0]}','{users[1]}');")
  assert sql(f"select count(*) from public.profiles where id in ('{users[0]}','{users[1]}');")=='0'
  print('Exact outbox fixtures removed.')
 except Exception:
  print('::error::Outbox fixture cleanup failed.');raise SystemExit(1)
