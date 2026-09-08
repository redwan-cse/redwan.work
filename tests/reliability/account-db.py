import json,subprocess,time,uuid
C='supabase_db_redwan-reliability-ci'
users=[str(uuid.uuid4()) for _ in range(3)]
projects=[str(uuid.uuid4()) for _ in range(2)]
tickets=[str(uuid.uuid4()) for _ in range(2)]
phase='fixtures'
def sql(text,success=True):
    r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
    if (r.returncode==0)!=success:raise RuntimeError()
    return r.stdout.strip()
def scoped(user,role,query,iat=None):
    claims=json.dumps({'sub':user,'role':'authenticated','app_metadata':{'role':role},'iat':iat if iat is not None else int(time.time())+60})
    return sql("begin; set local role authenticated; set local request.jwt.claims = '"+claims+"';"+query+';rollback;')
try:
    sql('insert into auth.users(id) values '+','.join(f"('{u}')" for u in users)+';')
    sql(f"update public.profiles set role='admin' where id='{users[0]}';")
    for i,user in enumerate(users[1:]):
        sql(f"insert into public.projects(id,client_id,name) values ('{projects[i]}','{user}','Synthetic');insert into public.milestones(project_id,title) values ('{projects[i]}','Synthetic');insert into public.tickets(id,client_id,subject) values ('{tickets[i]}','{user}','Synthetic');insert into public.ticket_messages(ticket_id,author_id,body) values ('{tickets[i]}','{user}','Synthetic');insert into public.files(bucket,r2_key,kind,ticket_id,uploaded_by,filename,mime,size_bytes) values ('private','private/{user}/ticket_{tickets[i]}/{uuid.uuid4()}.pdf','attachment','{tickets[i]}','{user}','fixture.pdf','application/pdf',17);")
        invoice=sql(f"select public.create_draft_invoice_with_items('{projects[i]}','USD',null,null,'[{{\"description\":\"Synthetic\",\"qty\":1,\"unit_price_cents\":100,\"position\":0}}]'::jsonb);")
        sql(f"select public.send_invoice_atomic('{invoice}');select public.submit_invoice_payment_atomic('{invoice}','{user}','bank','synthetic-reference',50);")
    tables=['profiles','projects','milestones','tickets','ticket_messages','files','invoices','invoice_items','payments']
    phase='active ownership and admin visibility'
    for table in tables:
        assert scoped(users[1],'client',f'select count(*) from public.{table}')=='1'
        assert scoped(users[0],'admin',f'select count(*) from public.{table}')==('3' if table=='profiles' else '2')
    phase='inactive identity denial'
    sql(f"update public.profiles set is_active=false where id='{users[1]}';")
    for table in tables:assert scoped(users[1],'client',f'select count(*) from public.{table}')=='0'
    cutoff=int(sql(f"select tokens_valid_after from public.profiles where id='{users[1]}';"))
    phase='reactivation does not resurrect pre-cutoff access tokens'
    sql(f"update public.profiles set is_active=true where id='{users[1]}';")
    for table in tables:assert scoped(users[1],'client',f'select count(*) from public.{table}',cutoff-1)=='0'
    assert scoped(users[1],'client','select count(*) from public.projects',cutoff+1)=='1'
    phase='stale administrator role denial'
    sql(f"update public.profiles set role='client' where id='{users[0]}';")
    for table in tables:assert scoped(users[0],'admin',f'select count(*) from public.{table}')=='0'
    phase='direct profile role escalation denied'
    scoped(users[1],'client',f"update public.profiles set role='admin' where id='{users[1]}'")
    assert sql(f"select role from public.profiles where id='{users[1]}';")=='client'
    phase='cutoff cannot be lowered'
    sql(f"update public.profiles set tokens_valid_after=0 where id='{users[1]}';",False)
    print('Passed: active own/admin reads, cross-client isolation, inactive and stale-role denial, token cutoff, direct escalation denial across nine tables.')
except Exception:
    print('::error::Account database acceptance failed at '+phase);raise SystemExit(1)
finally:
    try:
        p=','.join(f"'{v}'" for v in projects);u=','.join(f"'{v}'" for v in users)
        sql(f'delete from public.invoices where project_id in ({p});delete from public.projects where id in ({p});delete from public.tickets where client_id in ({u});delete from auth.users where id in ({u});')
        assert sql(f'select count(*) from public.profiles where id in ({u});')=='0'
        print('Exact account fixtures removed and verified.')
    except Exception:
        print('::error::Account fixture cleanup failed.');raise SystemExit(1)
