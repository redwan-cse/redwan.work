"""F20 forward migration/RPC acceptance in one disposable synthetic database.

No production configuration, runtime activation or historical backfill.
Uses exact source migration 0041; a passing adapter test is not UI acceptance.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = 'supabase_db_redwan-reliability-ci'
DB = 'consent_synthetic_' + uuid.uuid4().hex
if os.environ.get('GITHUB_ACTIONS') != 'true' or not re.fullmatch(r'consent_synthetic_[0-9a-f]{32}', DB):
    raise SystemExit('Disposable CI required.')
created = False
phase = 'setup'
processes = []

def sql(text, expected=None, database=DB):
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', database,
         '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
        input=text, text=True, capture_output=True, timeout=40,
    )
    if expected is None:
        if result.returncode:
            raise AssertionError('Synthetic SQL assertion failed')
    else:
        match = re.search(r'ERROR:\s+([0-9A-Z]{5}):', result.stderr)
        if result.returncode == 0 or not match or match.group(1) != expected:
            raise AssertionError('Expected SQLSTATE not observed')
    return result.stdout.strip()

def q(value):
    return "'" + value.replace("'", "''") + "'"

def archive(version):
    canonical = json.dumps(dict(
        schema=1, version=version, checkbox='SYNTHETIC ONLY: agree',
        privacyNotice='SYNTHETIC ONLY: privacy', attachmentNotice='SYNTHETIC ONLY: files',
        policyText='SYNTHETIC ONLY\nNot a published policy.',
    ), separators=(',', ':'))
    return dict(version=version, canonical=canonical, hash=hashlib.sha256(canonical.encode()).hexdigest())

def rpc(version=None, role='service_role'):
    arg = 'null' if version is None else q(version)
    return json.loads(sql(f'set role {role};select public.contact_consent_control({arg});'))

def session():
    process = subprocess.Popen(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', DB,
         '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    processes.append(process)
    return process

def finish(process):
    process.communicate(timeout=20)
    assert process.returncode == 0, 'Synthetic concurrent SQL failed'

def wait_marker(process, marker):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        assert selector.select(timeout=15), 'Synthetic transaction did not reach its barrier'
        assert process.stdout.readline().strip() == marker, 'Synthetic transaction barrier mismatch'

def wait_lock(name):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql("select count(*) from pg_stat_activity where datname=current_database() and application_name=" + q(name) + " and wait_event_type='Lock';") == '1':
            return
        time.sleep(0.05)
    raise AssertionError('Expected activation lock not observed')

try:
    sql(f'create database {DB};', database='postgres')
    created = True
    sql((ROOT / 'supabase/migrations/0001_leads_and_rate_limits.sql').read_text())
    legacy = str(uuid.uuid4())
    sql(f"insert into public.leads(id,name,email,project_summary,consent_at) values('{legacy}','Synthetic','synthetic@example.test','Synthetic','2000-01-01T00:00:00Z');")
    before = sql(f"select consent_at::text from public.leads where id='{legacy}';")
    phase = 'forward schema and no backfill'
    sql((ROOT / 'supabase/migrations/0041_contact_consent_evidence.sql').read_text())
    assert sql(f"select consent_at::text from public.leads where id='{legacy}';") == before
    assert sql(f"select consent_policy_version is null and consent_policy_hash is null and consent_capture_method is null from public.leads where id='{legacy}';") == 't'
    assert rpc() == dict(schema=1, activeVersion=None, policies=[])
    phase = 'read boundary'
    for role in ['anon', 'authenticated']:
        sql(f'set role {role};select public.contact_consent_control(null);', '42501')
    for privilege in ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']:
        for table in ['control', 'policy_versions']:
            assert sql(f"select has_table_privilege('service_role','consent_private.{table}','{privilege}');") == 'f'
    first, current, unrelated = map(archive, ['synthetic-first', 'synthetic-current', 'synthetic-unrelated'])
    for policy in [first, current, unrelated]:
        sql('insert into consent_private.policy_versions(version,canonical,hash) values(' + ','.join(q(policy[k]) for k in ['version', 'canonical', 'hash']) + ');')
    assert rpc(first['version']) == dict(schema=1, activeVersion=None, policies=[])
    sql(f"update consent_private.control set active_version={q(current['version'])} where singleton;")
    assert rpc() == dict(schema=1, activeVersion=current['version'], policies=[current])
    assert rpc(current['version']) == rpc()
    assert rpc('synthetic-unknown') == rpc()
    assert rpc(first['version']) == dict(schema=1, activeVersion=current['version'], policies=sorted([first, current], key=lambda p: p['version']))
    phase = 'immutable archive and historical evidence'
    sql(f"update public.leads set consent_policy_version={q(current['version'])},consent_policy_hash={q(current['hash'])},consent_capture_method='explicit-checkbox-v1' where id='{legacy}';", '23514')
    sql("update consent_private.policy_versions set canonical=canonical||' ';", '23514')
    sql("set role service_role;update consent_private.control set active_version=null;", '42501')
    assert sql(f"select consent_at::text from public.leads where id='{legacy}';") == before
    phase = 'real forward insert guard'
    sql('grant insert,select on public.leads to service_role;grant usage on sequence public.entity_number_seq to service_role;')
    ident = str(uuid.uuid4())
    values = ','.join(q(v) for v in [ident, 'Synthetic', 'synthetic@example.test', 'Synthetic', '2026-09-28T00:00:00Z', current['version'], current['hash'], 'explicit-checkbox-v1'])
    statement = 'insert into public.leads(id,name,email,project_summary,consent_at,consent_policy_version,consent_policy_hash,consent_capture_method) values(' + values + ');'
    sql('set role service_role;' + statement)
    sql('set role service_role;' + statement.replace(ident, str(uuid.uuid4())).replace(current['version'], first['version']), 'PT409')
    sql(f"update public.leads set consent_at=now() where id='{ident}';", '23514')
    sql(f"update public.leads set status='contacted' where id='{ident}';")
    phase = 'insert before activation serializes'
    writer = session()
    writer.stdin.write('begin;' + statement.replace(ident, str(uuid.uuid4())) + "select 'insert-held';\n")
    writer.stdin.flush()
    wait_marker(writer, 'insert-held')
    switch = session()
    switch.stdin.write("set application_name='f20_switch';set lock_timeout='12s';update consent_private.control set active_version=" + q(first['version']) + " where singleton;\n")
    switch.stdin.flush()
    wait_lock('f20_switch')
    writer.stdin.write('commit;\n')
    writer.stdin.flush()
    finish(writer)
    finish(switch)
    assert rpc()['activeVersion'] == first['version']
    sql('set role service_role;' + statement.replace(ident, str(uuid.uuid4())), 'PT409')
    phase = 'activation before insert serializes'
    switch = session()
    switch.stdin.write('begin;update consent_private.control set active_version=' + q(current['version']) + " where singleton;select 'control-held';\n")
    switch.stdin.flush()
    wait_marker(switch, 'control-held')
    writer = session()
    writer.stdin.write("set application_name='f20_insert';set lock_timeout='12s';" + statement.replace(ident, str(uuid.uuid4())) + '\n')
    writer.stdin.flush()
    wait_lock('f20_insert')
    switch.stdin.write('commit;\n')
    switch.stdin.flush()
    finish(switch)
    finish(writer)
    phase = 'disabled control preserved'
    sql('update consent_private.control set active_version=null where singleton;')
    assert rpc() == dict(schema=1, activeVersion=None, policies=[])
    sql('set role service_role;' + statement.replace(ident, str(uuid.uuid4())), 'PT503')
    assert sql(f"select consent_policy_version from public.leads where id='{ident}';") == current['version']
    print('Passed: forward consent schema, unknown historical evidence, service-only bounded snapshot, disabled defaults, immutable evidence and both activation lock orders.')
except Exception:
    print('::error::Forward consent database acceptance failed at ' + phase + '.')
    raise SystemExit(1)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=10)
    if created:
        sql(f'drop database {DB} with (force);', database='postgres')
        assert sql(f"select count(*) from pg_database where datname='{DB}';", database='postgres') == '0'
        print('Passed: exact synthetic forward-consent database cleanup.')
