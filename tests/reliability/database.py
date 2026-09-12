"""No remote connections, secrets, real identities, or raw SQL diagnostics in output."""
import concurrent.futures
import json
import subprocess
import uuid

CONTAINER = 'supabase_db_redwan-reliability-ci'
phase = 'fixture creation'
users = [str(uuid.uuid4()) for _ in range(2)]

def sql(statement, succeeds=True):
    result = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],input=statement,text=True,capture_output=True,timeout=30)
    if succeeds and result.returncode:
        raise RuntimeError('database assertion failed')
    if not succeeds and not result.returncode:
        raise RuntimeError('expected database rejection')
    return result.stdout.strip()

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def create(client, request, entries=None, body='Synthetic message'):
    payload = json.dumps(entries or [])
    return f"select public.create_ticket_atomic('{client}','{request}','Synthetic ticket',{literal(body)},{literal(payload)}::jsonb);"

def attachment(client,ticket):
    return {'key':f'private/{client}/ticket_{ticket}/{uuid.uuid4()}.pdf','filename':'fixture.pdf','mime':'application/pdf','size_bytes':17}

def attach(actor,ticket,entries):
    return f"select public.attach_ticket_files_atomic('{actor}','{ticket}',{literal(json.dumps(entries))}::jsonb);"

try:
    sql('insert into auth.users(id) values ' + ','.join(f"('{u}')" for u in users) + ';')
    request = str(uuid.uuid4())
    phase = 'atomic success and exact retry'
    ticket = sql(create(users[0],request))
    assert str(uuid.UUID(ticket)) == ticket
    assert sql(create(users[0],request)) == ticket
    assert sql(f"select count(*) from public.ticket_messages where ticket_id='{ticket}';") == '1'
    sql(create(users[0],request,body='Different payload'),False)
    phase = 'whole submission rollback'
    bad = attachment(users[0],ticket)
    bad['size_bytes'] = 0
    sql(create(users[0],str(uuid.uuid4()),[bad]),False)
    assert sql(f"select count(*) from public.tickets where client_id='{users[0]}';") == '1'
    assert sql(f"select count(*) from public.ticket_submissions where client_id='{users[0]}';") == '1'
    phase = 'concurrent ticket quota'
    def attempt(_):
        result = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],input=create(users[0],str(uuid.uuid4())),text=True,capture_output=True,timeout=45)
        return result.returncode == 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        assert sum(executor.map(attempt,range(20))) == 9
    assert sql(f"select count(*) from public.tickets where client_id='{users[0]}';") == '10'
    phase = 'concurrent attachment quota'
    entries = [attachment(users[0],ticket) for _ in range(14)]
    def add(entry):
        result = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],input=attach(users[0],ticket,[entry]),text=True,capture_output=True,timeout=45)
        return result.returncode == 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        assert sum(executor.map(add,entries)) == 10
    assert sql(f"select count(*) from public.files where ticket_id='{ticket}';") == '10'
    phase = 'exact confirmation retry and conflict'
    stored = sql(f"select r2_key from public.files where ticket_id='{ticket}' order by r2_key limit 1;")
    entry = next(e for e in entries if e['key'] == stored)
    sql(attach(users[0],ticket,[entry]))
    sql(attach(users[1],ticket,[entry]),False)
    sql(attach(users[0],ticket,[{**entry,'size_bytes':18}]),False)
    phase = 'whole attachment batch rollback'
    ticket2 = sql(create(users[1],str(uuid.uuid4())))
    entries2 = [attachment(users[1],ticket2),attachment(users[1],ticket2)]
    entries2[1]['size_bytes'] = 0
    sql(attach(users[1],ticket2,entries2),False)
    assert sql(f"select count(*) from public.files where ticket_id='{ticket2}';") == '0'
    phase = 'inactive account and direct role denial'
    sql(f"update public.profiles set is_active=false where id='{users[1]}';")
    sql(create(users[1],str(uuid.uuid4())),False)
    for role in ['anon','authenticated']:
        sql(f'set role {role};' + create(users[0],request),False)
    print('Passed: atomic persistence, retry conflicts, rollback, concurrent ticket and file quotas, account-state and RPC privilege checks.')
except Exception:
    print('::error::Disposable database acceptance failed at ' + phase)
    raise SystemExit(1)
finally:
    try:
        ids=','.join(literal(u) for u in users)
        sql(f'delete from public.tickets where client_id in ({ids}); delete from auth.users where id in ({ids});')
        assert sql(f'select count(*) from public.profiles where id in ({ids});') == '0'
        print('Exact disposable fixtures removed; profile cleanup verified.')
    except Exception:
        print('::error::Exact disposable fixture cleanup failed; container teardown still required.')
        raise SystemExit(1)
