import concurrent.futures,json,subprocess,uuid
C='supabase_db_redwan-reliability-ci'
users=[str(uuid.uuid4()) for _ in range(2)]
project=str(uuid.uuid4());milestone=str(uuid.uuid4());phase='fixtures'
def sql(value,success=True):
    r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=45)
    if (r.returncode==0)!=success:raise RuntimeError()
    return r.stdout.strip()
def call(actor):return f"select public.invoice_milestone_atomic('{actor}','{milestone}');"
try:
    sql(f"insert into auth.users(id) values ('{users[0]}'),('{users[1]}'); update public.profiles set role='admin' where id='{users[0]}'; insert into public.projects(id,client_id,name) values ('{project}','{users[1]}','Synthetic project'); insert into public.milestones(id,project_id,title,amount_cents,currency) values ('{milestone}','{project}','Synthetic milestone',12345,'USD');")
    phase='client and direct RPC denial';sql(call(users[1]),False)
    for role in ['anon','authenticated']:sql(f'set role {role};'+call(users[0]),False)
    phase='concurrent draft identity'
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:invoices=list(pool.map(lambda _:sql(call(users[0])),range(12)))
    assert len(set(invoices))==1
    invoice=invoices[0];assert str(uuid.UUID(invoice))==invoice
    assert sql(f"select count(*) from public.invoices where project_id='{project}';")=='1'
    phase='snapshot values'
    assert sql(f"select description||'|'||qty::text||'|'||unit_price_cents::text from public.invoice_items where invoice_id='{invoice}';").startswith('Synthetic milestone|1')
    assert sql(f"select unit_price_cents from public.invoice_items where invoice_id='{invoice}';")=='12345'
    sql(f"update public.milestones set amount_cents=54321 where id='{milestone}';")
    assert sql(call(users[0]))==invoice
    assert sql(f"select unit_price_cents from public.invoice_items where invoice_id='{invoice}';")=='12345'
    phase='inactive admin and archived project'
    sql(f"update public.profiles set is_active=false where id='{users[0]}';");sql(call(users[0]),False)
    sql(f"update public.profiles set is_active=true where id='{users[0]}'; update public.projects set archived_at=now() where id='{project}';");sql(call(users[0]),False)
    phase='provenance hold';sql(f"delete from public.milestones where id='{milestone}';",False)
    print('Passed: milestone draft concurrency, snapshot values, retry identity, role/state guards and provenance hold.')
except Exception:
    print('::error::Workflow database acceptance failed at '+phase);raise SystemExit(1)
finally:
    try:
        sql(f"delete from public.milestone_invoices where milestone_id='{milestone}';delete from public.invoices where project_id='{project}';delete from public.projects where id='{project}';delete from auth.users where id in ('{users[0]}','{users[1]}');")
        assert sql(f"select count(*) from public.profiles where id in ('{users[0]}','{users[1]}');")=='0'
        print('Exact workflow fixtures removed and verified.')
    except Exception:
        print('::error::Workflow fixture cleanup failed.');raise SystemExit(1)
