import concurrent.futures,json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';a,u,foreign,p,t=[str(uuid.uuid4()) for _ in range(5)];phase='fixtures';ids=[]
def sql(s,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,timeout=30)
 if (r.returncode==0)!=ok:raise RuntimeError('Synthetic SQL failure')
 return r.stdout.strip()
def file(kind='deliverable',age='now()'):
 f=str(uuid.uuid4());ids.append(f);scope='project_'+p if kind=='deliverable' else 'ticket_'+t;key=f'private/{u}/{scope}/{f}.pdf'
 sql(f"insert into public.files(id,bucket,kind,project_id,ticket_id,uploaded_by,r2_key,filename,mime,size_bytes,created_at) values('{f}','private','{kind}',{repr(p) if kind=='deliverable' else 'null'},{repr(t) if kind=='attachment' else 'null'},'{u}','{key}','Synthetic.pdf','application/pdf',17,{age});")
 return f,key
try:
 sql(f"insert into auth.users(id,raw_app_meta_data) values('{a}','{{\"role\":\"admin\"}}'),('{u}','{{\"role\":\"client\"}}'),('{foreign}','{{\"role\":\"client\"}}');update public.profiles set role='admin' where id='{a}';insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic');insert into public.tickets(id,client_id,subject) values('{t}','{u}','Synthetic');")
 f,key=file();phase='transaction rollback'
 sql(f"create function public.synthetic_file_refusal() returns trigger language plpgsql as $$ begin if old.id='{f}' then raise exception 'Synthetic refusal';end if;return old;end;$$;create trigger synthetic_file_refusal before delete on public.files for each row execute function public.synthetic_file_refusal();")
 sql(f"select public.prepare_file_deletion('{f}','{a}','admin');",False)
 assert sql(f"select count(*) from public.files where id='{f}';")=='1';assert sql(f"select count(*) from public.storage_deletions where file_id='{f}';")=='0'
 sql('drop trigger synthetic_file_refusal on public.files;drop function public.synthetic_file_refusal();')
 phase='same actor concurrent replay'
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:sql(f"select public.prepare_file_deletion('{f}','{a}','admin');"),range(4)))
 assert len(set(results))==1 and json.loads(results[0])['key']==key
 assert sql(f"select count(*) from public.files where id='{f}';")=='0';assert sql(f"select count(*) from public.storage_deletions where file_id='{f}';")=='1'
 phase='tombstone and foreign replay refusal'
 sql(f"select public.prepare_file_deletion('{f}','{u}','client');",False)
 sql(f"insert into public.files(bucket,kind,project_id,uploaded_by,r2_key,filename,mime,size_bytes) values('private','deliverable','{p}','{u}','{key}','Synthetic.pdf','application/pdf',17);",False)
 phase='client authorization window'
 own,_=file('attachment');sql(f"select public.prepare_file_deletion('{own}','{foreign}','client');",False);sql(f"select public.prepare_file_deletion('{own}','{u}','client');")
 old,_=file('attachment',"now()-interval '25 hours'");sql(f"select public.prepare_file_deletion('{old}','{u}','client');",False)
 phase='archived parent and revoked role'
 archived,_=file();sql(f"update public.projects set archived_at=now() where id='{p}';");sql(f"select public.prepare_file_deletion('{archived}','{a}','admin');",False)
 sql(f"update public.profiles set is_active=false where id='{a}';");sql(f"select public.prepare_file_deletion('{f}','{a}','admin');",False)
 phase='privileges'
 for role in ['anon','authenticated']:assert sql(f"select has_function_privilege('{role}','public.prepare_file_deletion(uuid,uuid,text)','execute');")=='f'
 print('Passed: file deletion rollback, concurrent replay, tombstones, foreign/expired/archived/revoked denial and privileges.')
except Exception:print('::error::Individual file deletion failed at '+phase+'.');raise SystemExit(1)
finally:
 sql('drop trigger if exists synthetic_file_refusal on public.files;drop function if exists public.synthetic_file_refusal();')
 sql(f"delete from public.storage_deletions where requested_by in('{a}','{u}','{foreign}');delete from public.tickets where id='{t}';delete from public.projects where id='{p}';delete from public.email_outbox where recipient_id in('{a}','{u}','{foreign}');delete from auth.users where id in('{a}','{u}','{foreign}');")
 assert sql(f"select count(*) from public.profiles where id in('{a}','{u}','{foreign}');")=='0'
