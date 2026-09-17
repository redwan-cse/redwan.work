"""I03 synthetic infrastructure acceptance and durable scope record.

Owner approval: 2026-09-12, synthetic policies only; activation disabled outside
this disposable test database. Shared tracker remains PR56/issue45. No automatic
migration, public wording, live intake wiring, historical backfill or production
access. Runtime callers cannot publish policies or change activation. PostgreSQL
operator/DDL/restore and a trusted writer forging a matching tuple are outside
this evidence guarantee. Approval of final copy and live adapters remains open.

Run through the existing disposable reliability database workflow. This test
creates one uniquely named scratch database in the existing CI-only container,
uses original lead DDL plus the experimental SQL, and destroys only that exact
database. It never reads customer rows or activates the job's normal database.
"""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import time
import uuid

C = 'supabase_db_redwan-reliability-ci'
DB = 'consent_synthetic_' + uuid.uuid4().hex
assert re.fullmatch(r'consent_synthetic_[0-9a-f]{32}', DB)
if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('This suite requires the disposable GitHub Actions database job.')
ROOT = pathlib.Path(__file__).resolve().parents[2]
phase = 'scratch database'
created = False
processes = []

def cmd(database=DB):
    return ['docker','exec','-i',C,'psql','-U','postgres','-d',database,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1']

def sql(text, ok=True, database=DB):
    result = subprocess.run(cmd(database), input=text, text=True, capture_output=True, timeout=40)
    if (result.returncode == 0) != ok:
        raise AssertionError('Synthetic SQL contract failed')
    return result.stdout.strip()

def quote(text):
    return "'" + text.replace("'", "''") + "'"

def bundle(version):
    value = dict(schema=1,version=version,checkbox='SYNTHETIC TEST ONLY: I agree.',privacyNotice='SYNTHETIC TEST ONLY: privacy notice.',attachmentNotice='SYNTHETIC TEST ONLY: attachment notice.',policyText='SYNTHETIC TEST ONLY\nNot a published policy. বাংলা')
    canonical = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return canonical, hashlib.sha256(canonical.encode('utf-8')).hexdigest()

V1, V2 = 'synthetic-enquiry-v1', 'synthetic-enquiry-v2'
A1, H1 = bundle(V1)
A2, H2 = bundle(V2)

def insert(ident, version=None, digest=None, method='explicit-checkbox-v1'):
    extra_cols = ',consent_policy_version,consent_policy_hash,consent_capture_method' if version is not None else ''
    extra_values = ',' + ','.join(map(quote,[version,digest or H1,method])) if version is not None else ''
    return f"insert into public.leads(id,name,email,project_summary,consent_at{extra_cols}) values('{ident}','Synthetic','synthetic@example.test','Synthetic only','2026-09-12T00:00:00Z'{extra_values});"

def begin_session():
    p = subprocess.Popen(cmd(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append(p)
    return p

def finish(p):
    out, err = p.communicate(timeout=20)
    if p.returncode:
        raise AssertionError('Synthetic concurrent session failed')
    return out

def wait_for(predicate):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError('Synthetic lock condition not reached')

try:
    sql(f'create database {DB};', database='postgres')
    created = True
    phase = 'original lead schema'
    sql((ROOT/'supabase/migrations/0001_leads_and_rate_limits.sql').read_text())
    historical = str(uuid.uuid4())
    sql(insert(historical))
    before = sql(f"select consent_at::text from public.leads where id='{historical}';")
    phase = 'experimental schema availability'
    sql((ROOT/'supabase/experiments/consent-infrastructure.sql').read_text())
    assert sql("select to_regclass('consent_private.policy_versions') is not null;") == 't'
    assert sql("select active_version is null from consent_private.control where singleton;") == 't'
    assert sql(f"select consent_at::text from public.leads where id='{historical}';") == before
    assert sql(f"select consent_policy_version is null and consent_policy_hash is null and consent_capture_method is null from public.leads where id='{historical}';") == 't'
    phase = 'registry hashing and privileges'
    for version, canonical, digest in [(V1,A1,H1),(V2,A2,H2)]:
        sql(f"insert into consent_private.policy_versions(version,canonical,hash) values({quote(version)},{quote(canonical)},{quote(digest)});")
    sql(f"insert into consent_private.policy_versions(version,canonical,hash) values('synthetic-corrupt',{quote(A1)},'{H2}');",ok=False)
    sql(f"update consent_private.policy_versions set canonical=canonical||' ' where version='{V1}';",ok=False)
    sql(f"delete from consent_private.policy_versions where version='{V1}';",ok=False)
    sql('truncate consent_private.policy_versions cascade;',ok=False)
    for role in ['anon','authenticated','service_role']:
        for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE']:
            assert sql(f"select has_table_privilege('{role}','consent_private.policy_versions','{privilege}');") == 'f'
            assert sql(f"select has_table_privilege('{role}','consent_private.control','{privilege}');") == 'f'
    sql("set role service_role; update consent_private.control set active_version='synthetic-enquiry-v1';",ok=False)
    sql("set role anon; select * from consent_private.policy_versions;",ok=False)
    sql("set role authenticated; select * from consent_private.control;",ok=False)
    sql("set role service_role; select hash from consent_private.policy_versions;")
    phase = 'disabled compatibility and no fabricated history'
    sql(insert(str(uuid.uuid4())))
    sql(insert(str(uuid.uuid4()),V1),ok=False)
    sql(f"update public.leads set consent_policy_version='{V1}',consent_policy_hash='{H1}',consent_capture_method='explicit-checkbox-v1' where id='{historical}';",ok=False)
    sql(f"update public.leads set consent_at=now() where id='{historical}';",ok=False)
    sql(f"update public.leads set status='contacted' where id='{historical}';")
    phase = 'prospective synthetic activation'
    sql(f"update consent_private.control set active_version='{V1}' where singleton;")
    sql('grant insert,select,update on public.leads to service_role; grant usage on sequence public.entity_number_seq to service_role;')
    live = str(uuid.uuid4())
    sql('set role service_role;'+insert(live,V1))
    sql('set role service_role;'+insert(str(uuid.uuid4())),ok=False)
    sql('set role service_role;'+insert(str(uuid.uuid4()),V2,H2),ok=False)
    sql('set role service_role;'+insert(str(uuid.uuid4()),V1,H2),ok=False)
    sql('set role service_role;'+insert(str(uuid.uuid4()),V1,H1,'import'),ok=False)
    sql(f"update public.leads set consent_policy_hash=null where id='{live}';",ok=False)
    sql(f"update public.leads set consent_policy_version='{V2}',consent_policy_hash='{H2}' where id='{live}';",ok=False)
    sql(f"update public.leads set consent_at=now() where id='{live}';",ok=False)
    sql(f"update public.leads set status='won' where id='{live}';")
    sql(insert(live,V1).rstrip(';')+" on conflict(id) do update set consent_at=now();",ok=False)
    sql("copy public.leads(name,email,project_summary,consent_at) from stdin;\nSynthetic\tsynthetic@example.test\tSynthetic\t2026-09-12\n\\.\n",ok=False)
    phase = 'insert before activation switch serializes'
    first = begin_session()
    first.stdin.write('begin;'+insert(str(uuid.uuid4()),V1)+"select 'insert-held';\n")
    first.stdin.flush()
    # Output marker follows the INSERT and its FOR SHARE lock, no sleep race.
    assert first.stdout.readline().strip() == 'insert-held'
    switch = begin_session()
    switch.stdin.write(f"set application_name='consent_switch';set lock_timeout='10s';update consent_private.control set active_version='{V2}' where singleton;\n")
    switch.stdin.flush()
    wait_for(lambda: sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='consent_switch' and wait_event_type='Lock';") == '1')
    first.stdin.write('commit;\n');first.stdin.flush();finish(first)
    finish(switch)
    assert sql('select active_version from consent_private.control;') == V2
    sql(insert(str(uuid.uuid4()),V1),ok=False)
    phase = 'activation switch before insert serializes'
    control = begin_session()
    control.stdin.write(f"begin;update consent_private.control set active_version='{V1}' where singleton;select 'control-held';\n")
    control.stdin.flush()
    assert control.stdout.readline().strip() == 'control-held'
    pending = begin_session()
    pending.stdin.write("set application_name='consent_insert';set lock_timeout='10s';"+insert(str(uuid.uuid4()),V1)+'\n')
    pending.stdin.flush()
    wait_for(lambda: sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='consent_insert' and wait_event_type='Lock';") == '1')
    control.stdin.write('commit;\n');control.stdin.flush();finish(control)
    finish(pending)
    phase = 'disabled final control and immutable legacy evidence'
    sql('update consent_private.control set active_version=null where singleton;')
    assert sql('select active_version is null from consent_private.control;') == 't'
    assert sql(f"select consent_at::text from public.leads where id='{historical}';") == before
    sql('delete from consent_private.control;',ok=False)
    sql('truncate consent_private.control;',ok=False)
    print('Passed: synthetic consent registry hashing, disabled compatibility, no backfill, prospective guards, immutable evidence, privileges, COPY/UPSERT and both activation lock orders.')
except Exception:
    print('::error::Synthetic consent database acceptance failed at '+phase+'.')
    raise SystemExit(1)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=10)
    if created:
        sql(f'drop database {DB} with (force);',database='postgres')
        assert sql(f"select count(*) from pg_database where datname='{DB}';",database='postgres') == '0'
        print('Passed: exact synthetic consent database cleanup.')
