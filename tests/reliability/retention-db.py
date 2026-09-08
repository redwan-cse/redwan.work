import concurrent.futures,json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';user=str(uuid.uuid4());project=str(uuid.uuid4());ticket=str(uuid.uuid4());keys=[];phase='fixtures'
def sql(value,success=True):
    r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=30)
    if (r.returncode==0)!=success:raise RuntimeError()
    return r.stdout.strip()
def quote(value):return "'"+str(value).replace("'","''")+"'"
def claim(key):return f"select public.claim_expired_storage({quote(key)},now()-interval '100 days');"
def entry(key,retained=False):return {'key':key,'filename':'fixture.pdf','mime':'application/pdf','size_bytes':1,'retained':retained}
def lead(key,retained=False):return "insert into public.leads(name,email,project_summary,consent_at,attachments) values('Synthetic','synthetic@example.test','Synthetic',now(),"+quote(json.dumps([entry(key,retained)]))+"::jsonb);"
try:
    sql(f"insert into auth.users(id) values('{user}');insert into public.projects(id,client_id,name,archived_at) values('{project}','{user}','Synthetic',now());insert into public.tickets(id,client_id,subject) values('{ticket}','{user}','Synthetic');")
    phase='retained reference past normal REST row cap'
    retained=f'contact/{uuid.uuid4()}/{uuid.uuid4()}.pdf';keys.append(retained)
    sql("insert into public.leads(name,email,project_summary,consent_at,attachments) select 'Synthetic','synthetic@example.test','Synthetic',now(),'[]'::jsonb from generate_series(1,1100);"+lead(retained,True))
    assert sql(claim(retained))=='f'
    phase='late references blocked by durable tombstone'
    expired=f'contact/{uuid.uuid4()}/{uuid.uuid4()}.pdf';keys.append(expired)
    assert sql(claim(expired))=='t';sql(lead(expired,True),False)
    pending=f'private/{user}/pending/{uuid.uuid4()}.pdf';keys.append(pending)
    assert sql(claim(pending))=='t'
    sql(f"insert into public.files(bucket,r2_key,kind,ticket_id,uploaded_by,filename,mime,size_bytes) values('private','{pending}','attachment','{ticket}','{user}','fixture.pdf','application/pdf',1);",False)
    phase='financial refusal preserves project and creates no deletion queue'
    invoice=sql(f"select public.create_draft_invoice_with_items('{project}','USD',null,null,'[{{\"description\":\"Synthetic\",\"qty\":1,\"unit_price_cents\":100,\"position\":0}}]');",False) if False else None
    # Draft RPC refuses an archived project; seed invoice through the same retained FK.
    sql(f"insert into public.invoices(project_id,currency) values('{project}','USD');")
    recovery=f'archive/project_{project}/recovery_{uuid.uuid4()}.zip'
    prepare=f"select public.prepare_project_cleanup('{project}',public.project_cleanup_snapshot('{project}'),'{recovery}','{'a'*64}');"
    sql(prepare,False)
    assert sql(f"select count(*) from public.projects where id='{project}';")=='1'
    assert sql(f"select count(*) from public.project_recovery where project_id='{project}';")=='0'
    sql(f"delete from public.invoices where project_id='{project}';")
    phase='stale snapshot rejection'
    snapshot=sql(f"select public.project_cleanup_snapshot('{project}');")
    sql(f"update public.projects set name='Changed' where id='{project}';")
    sql(f"select public.prepare_project_cleanup('{project}',{quote(snapshot)}::jsonb,'{recovery}','{'a'*64}');",False)
    phase='transactionally recoverable project removal'
    filekey=f'private/{user}/project_{project}/{uuid.uuid4()}.pdf';keys.append(filekey)
    sql(f"insert into public.files(bucket,r2_key,kind,project_id,uploaded_by,filename,mime,size_bytes) values('private','{filekey}','deliverable','{project}','{user}','fixture.pdf','application/pdf',1);")
    sql(prepare)
    assert sql(f"select count(*) from public.projects where id='{project}';")=='0'
    assert sql(f"select jsonb_array_length(snapshot->'files') from public.project_recovery where project_id='{project}';")=='1'
    assert sql(f"select count(*) from public.storage_deletions where project_id='{project}' and completed_at is null;")=='1'
    sql(prepare)
    print('Passed: complete retained references, tombstone races, financial/stale-snapshot refusal, recovery snapshot and retry tracking.')
except Exception:
    print('::error::Retention database acceptance failed at '+phase);raise SystemExit(1)
finally:
    try:
        sql(f"delete from public.storage_deletions where r2_key in ({','.join(quote(k) for k in keys)});delete from public.project_recovery where project_id='{project}';delete from public.invoices where project_id='{project}';delete from public.projects where id='{project}';delete from public.tickets where id='{ticket}';delete from auth.users where id='{user}';delete from public.leads where email='synthetic@example.test' and name='Synthetic';")
        assert sql(f"select count(*) from public.profiles where id='{user}';")=='0'
        print('Disposable retention fixtures removed.')
    except Exception:
        print('::error::Retention fixture cleanup failed.');raise SystemExit(1)
