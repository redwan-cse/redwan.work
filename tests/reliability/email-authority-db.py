import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';users=[str(uuid.uuid4()) for _ in range(3)];ticket=str(uuid.uuid4());events=[];phase='fixtures'
def sql(value):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=30)
 if r.returncode:raise RuntimeError()
 return r.stdout.strip()
def event(recipient,template='new-ticket',payload=None,envelope=None):
 id=str(uuid.uuid4());lease=str(uuid.uuid4());events.append(id)
 p=json.dumps(payload or {});e='null' if envelope is None else "'"+json.dumps(envelope)+"'::jsonb"
 sql(f"insert into public.email_outbox(id,template,entity_type,entity_id,recipient_id,payload,envelope,state,lease_token,lease_until) values('{id}','{template}','ticket','{ticket}','{recipient}','{p}'::jsonb,{e},'processing','{lease}',now()+interval '2 minutes');")
 return id,lease
def address(item):return sql(f"select coalesce(public.email_dispatch_recipient('{item[0]}','{item[1]}'),'DENIED');")
try:
 for i,u in enumerate(users):
  role='admin' if i==0 else 'client'
  sql(f"insert into auth.users(id,email,raw_app_meta_data) values('{u}','fixture-{i}@example.test','{{\"role\":\"{role}\"}}'::jsonb);update public.profiles set role='{role}' where id='{u}';")
 sql(f"insert into public.tickets(id,client_id,subject) values('{ticket}','{users[1]}','Synthetic');")
 phase='current administrator and lease'
 admin_event=event(users[0]);assert address(admin_event)=='fixture-0@example.test'
 assert address((admin_event[0],str(uuid.uuid4())))=='DENIED'
 sql(f"update public.email_outbox set lease_until=now()-interval '1 second' where id='{admin_event[0]}';");assert address(admin_event)=='DENIED'
 sql(f"update public.email_outbox set lease_until=now()+interval '2 minutes' where id='{admin_event[0]}';")
 phase='demotion and auth-role mismatch'
 sql(f"update public.profiles set role='client' where id='{users[0]}';");assert address(admin_event)=='DENIED'
 sql(f"update public.profiles set role='admin' where id='{users[0]}';update auth.users set raw_app_meta_data='{{\"role\":\"client\"}}' where id='{users[0]}';");assert address(admin_event)=='DENIED'
 sql(f"update auth.users set raw_app_meta_data='{{\"role\":\"admin\"}}' where id='{users[0]}';")
 phase='inactive or banned administrator'
 sql(f"update public.profiles set is_active=false where id='{users[0]}';");assert address(admin_event)=='DENIED'
 sql(f"update public.profiles set is_active=true where id='{users[0]}';update auth.users set banned_until=now()+interval '1 hour' where id='{users[0]}';");assert address(admin_event)=='DENIED'
 sql(f"update auth.users set banned_until=null where id='{users[0]}';")
 phase='client ownership reassignment'
 own=event(users[1],'reply-posted',{'adminAudience':False});foreign=event(users[2],'status-changed');assert address(own)=='fixture-1@example.test';assert address(foreign)=='DENIED'
 sql(f"update public.tickets set client_id='{users[2]}' where id='{ticket}';");assert address(own)=='DENIED';assert address(foreign)=='fixture-2@example.test'
 phase='frozen envelope address changes'
 frozen=event(users[0],envelope={'to':'fixture-0@example.test','from':'sender@example.test','subject':'Synthetic','html':'Synthetic'});assert address(frozen)=='fixture-0@example.test'
 sql(f"update auth.users set email='changed@example.test' where id='{users[0]}';");assert address(frozen)=='DENIED'
 phase='missing resource'
 sql(f"delete from public.tickets where id='{ticket}';");assert address(admin_event)=='DENIED'
 phase='privileges'
 for role in ['anon','authenticated']:
  assert sql(f"select has_function_privilege('{role}','public.email_dispatch_recipient(uuid,uuid)','execute');")=='f'
 print('Passed: current role, Auth role, activity, ban, ownership, lease, frozen-address and missing-resource gates.')
except Exception:
 print('::error::Email authority database acceptance failed at '+phase);raise SystemExit(1)
finally:
 ids=','.join(f"'{u}'" for u in users)
 sql(f"delete from public.email_outbox where entity_id='{ticket}';delete from public.tickets where id='{ticket}';delete from auth.users where id in ({ids});")
 assert sql(f'select count(*) from public.profiles where id in ({ids});')=='0'
