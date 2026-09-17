import concurrent.futures,json,subprocess,uuid
C='supabase_db_redwan-reliability-ci'
u,p,large,actor=[str(uuid.uuid4()) for _ in range(4)]
phase='fixtures';invoice=None

def sql(text,ok=True):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=45)
 if (r.returncode==0)!=ok:raise RuntimeError('Synthetic SQL assertion failed')
 return r.stdout.strip()

def mutate(op,project,mid,payload,ok=True):
 pj='null' if project is None else "'"+project+"'"
 mi='null' if mid is None else "'"+mid+"'"
 return sql(f"select public.mutate_project_milestone('{op}',{pj},{mi},'{json.dumps(payload)}'::jsonb);",ok)
try:
 sql(f"insert into auth.users(id) values('{u}'),('{actor}');update public.profiles set role='admin',is_active=true where id='{actor}';insert into public.projects(id,client_id,name) values('{p}','{u}','Synthetic atomic project'),('{large}','{u}','Synthetic large project');")
 phase='parallel additions'
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  ids=list(pool.map(lambda n:mutate('add',p,None,{'title':f'Synthetic {n}','amount_cents':100}),range(12)))
 assert len(set(ids))==12
 assert sql(f"select count(*)=12 and count(distinct position)=12 and min(position)=0 and max(position)=11 from public.milestones where project_id='{p}';")=='t'
 phase='concurrent reorder serialization'
 before=json.loads(sql(f"select jsonb_agg(id order by position,id) from public.milestones where project_id='{p}';"))
 # Each successful command moves this same end item one position, under a project lock.
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  list(pool.map(lambda _:mutate('move',None,before[-1],{'direction':'up'}),range(6)))
 assert sql(f"select position from public.milestones where id='{before[-1]}';")=='5'
 assert sql(f"select count(distinct position)=12 and min(position)=0 and max(position)=11 from public.milestones where project_id='{p}';")=='t'
 phase='mid-statement rollback'
 snapshot=sql(f"select jsonb_agg(jsonb_build_array(id,position) order by id) from public.milestones where project_id='{p}';")
 sql(f"create function public.synthetic_project_rollback() returns trigger language plpgsql as $$ begin if new.project_id='{p}'::uuid and new.position=1 then raise exception 'Synthetic rollback';end if;return new;end;$$;create trigger synthetic_project_rollback before update of position on public.milestones for each row execute function public.synthetic_project_rollback();")
 mutate('move',None,before[-1],{'direction':'up'},False)
 assert sql(f"select jsonb_agg(jsonb_build_array(id,position) order by id) from public.milestones where project_id='{p}';")==snapshot
 sql('drop trigger synthetic_project_rollback on public.milestones;drop function public.synthetic_project_rollback();')
 phase='validation and financial refusal'
 for payload in [{'direction':None},{'direction':'sideways'},{'direction':'up','extra':1}]:mutate('move',None,before[-1],payload,False)
 for payload in [{'title':None},{'title':'Synthetic','amount_cents':1.5},{'title':'Synthetic','amount_cents':2147483648},{'title':'Synthetic','currency':None}]:mutate('add',p,None,payload,False)
 mutate('update',None,before[0],{'status':None},False)
 invoice=sql(f"select public.invoice_milestone_atomic('{actor}','{before[0]}');")
 mutate('delete',None,before[0],{},False)
 assert sql(f"select count(*) from public.milestones where id='{before[0]}';")=='1'
 phase='archived mutations refused'
 sql(f"update public.projects set archived_at=clock_timestamp() where id='{p}';")
 for op,payload in [('move',{'direction':'up'}),('update',{'title':'Refused'}),('delete',{})]:mutate(op,None,before[-1],payload,False)
 mutate('add',p,None,{'title':'Refused'},False)
 phase='large project completeness'
 sql(f"insert into public.milestones(project_id,title,position,status) select '{large}','Synthetic milestone '||g,g,case when g%2=0 then 'done'::public.milestone_status else 'pending'::public.milestone_status end from generate_series(1,1007) g;insert into public.files(bucket,kind,project_id,uploaded_by,r2_key,filename,mime,size_bytes,created_at) select 'private','deliverable','{large}','{u}','private/{u}/project_{large}/'||gen_random_uuid()||'.pdf','Synthetic.pdf','application/pdf',1,'2026-01-01'::timestamptz from generate_series(1,1007);",True)
 seen_m=set();seen_f=set()
 for page in range(1,42):
  value=json.loads(sql(f"select public.project_detail_page('{large}',{page},{page});"))
  assert value['project']['milestone_total']==1007 and value['project']['milestone_done']==503 and value['project']['file_count']==1007
  assert value['milestonePage']==page and value['filePage']==page and value['pageSize']==25
  assert len(value['milestones'])==(7 if page==41 else 25) and len(value['files'])==(7 if page==41 else 25)
  ms={x['id'] for x in value['milestones']};fs={x['id'] for x in value['files']}
  assert not seen_m.intersection(ms) and not seen_f.intersection(fs)
  seen_m.update(ms);seen_f.update(fs)
 assert len(seen_m)==len(seen_f)==1007
 clamped=json.loads(sql(f"select public.project_detail_page('{large}',999999,0);"))
 assert clamped['milestonePage']==41 and clamped['filePage']==1
 phase='privileges'
 for role in ['anon','authenticated']:
  for fn in ['public.mutate_project_milestone(text,uuid,uuid,jsonb)','public.project_detail_page(uuid,integer,integer)']:
   assert sql(f"select has_function_privilege('{role}','{fn}','execute');")=='f'
 print('Passed: concurrent add/reorder, atomic rollback, validation, archived and financial refusal, exact 1007-row pagination and service-only privileges.')
except Exception:
 print('::error::Project transaction acceptance failed at '+phase+'.')
 raise SystemExit(1)
finally:
 sql('drop trigger if exists synthetic_project_rollback on public.milestones;drop function if exists public.synthetic_project_rollback();')
 sql(f"delete from public.milestone_invoices where milestone_id in(select id from public.milestones where project_id in('{p}','{large}'));delete from public.email_outbox where recipient_id in('{u}','{actor}');delete from public.email_log where entity_id in(select id from public.invoices where project_id in('{p}','{large}'));delete from public.invoices where project_id in('{p}','{large}');delete from public.projects where id in('{p}','{large}');delete from auth.users where id in('{u}','{actor}');")
 assert sql(f"select count(*) from public.profiles where id in('{u}','{actor}');")=='0'
