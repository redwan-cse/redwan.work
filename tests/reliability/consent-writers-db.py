"""Privileged synthetic writer challenge, PR56 / issue45, 2026-09-12.

Test-only investigation. Does not repair guards or claim production exposure.
Success means documented ALLOWED/BLOCKED expectations were demonstrated, not
that consent cannot be forged. SQL service_role is a DB role, not an API key.
The runtime model is SELECT/INSERT/UPDATE plus sequence usage and BYPASSRLS;
DELETE/TRUNCATE are separately granted hypothetical privilege expansions.
No external connection, key, network client, live activation or customer data.
All control activation and operator bypasses occur ONLY in a unique scratch
DB inside the fixed disposable CI container. Shared cluster roles are unchanged.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

C = 'supabase_db_redwan-reliability-ci'
DB = 'consent_synthetic_' + uuid.uuid4().hex
ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('GITHUB_ACTIONS') != 'true' or not re.fullmatch(r'consent_synthetic_[0-9a-f]{32}', DB):
    raise SystemExit('Disposable CI required.')
phase = 'setup'
created = False
results = []

def sql(text, expected=None, database=DB):
    command = ['docker','exec','-i',C,'psql','-U','postgres','-d',database,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
    r = subprocess.run(command, input=text, text=True, capture_output=True, timeout=40)
    if expected is None:
        if r.returncode != 0:
            raise AssertionError('Unexpected synthetic SQL failure')
    else:
        # A syntax/setup error must never count as a guard denial.
        match = re.search(r'ERROR:\s+([0-9A-Z]{5}):', r.stderr)
        if r.returncode == 0 or not match or match.group(1) != expected:
            raise AssertionError('Expected guard SQLSTATE not observed')
    return r.stdout.strip()

def q(value):
    return "'" + value.replace("'", "''") + "'"

def uid():
    return str(uuid.uuid4())

VERSION = 'synthetic-writer-v1'
CANONICAL = json.dumps(dict(schema=1,version=VERSION,checkbox='SYNTHETIC TEST ONLY',privacyNotice='Synthetic notice',attachmentNotice='Synthetic files',policyText='Synthetic writer challenge, not a published policy.'),separators=(',',':'))
HASH = hashlib.sha256(CANONICAL.encode()).hexdigest()
STAMP = '2000-01-01T00:00:00Z'

def insert(ident, evidence=True, digest=HASH):
    columns = 'id,name,email,project_summary,consent_at'
    values = ','.join(map(q,[ident,'Synthetic','synthetic@example.test','Synthetic writer',STAMP]))
    if evidence:
        columns += ',consent_policy_version,consent_policy_hash,consent_capture_method'
        values += ',' + ','.join(map(q,[VERSION,digest,'explicit-checkbox-v1']))
    return f'insert into public.leads({columns}) values({values})'

def count(ident):
    return sql(f"select count(*) from public.leads where id='{ident}';")

def snapshot(ident):
    return sql(f"select row_to_json(t)::text from (select consent_at,consent_policy_version,consent_policy_hash,consent_capture_method from public.leads where id='{ident}') t;")

def runtime(text, expected=None):
    return sql('set role service_role;'+text, expected)

def record(name, outcome):
    results.append((name,outcome))
    print('Observed: '+name+' = '+outcome, flush=True)

try:
    sql(f'create database {DB};',database='postgres')
    created = True
    sql((ROOT/'supabase/migrations/0001_leads_and_rate_limits.sql').read_text())
    legacy = uid()
    sql(insert(legacy,False)+';')
    sql((ROOT/'supabase/experiments/consent-infrastructure.sql').read_text())
    sql('revoke all on public.leads from service_role; grant select,insert,update on public.leads to service_role; grant usage on sequence public.entity_number_seq to service_role;')
    assert sql("select rolbypassrls from pg_roles where rolname='service_role';") == 't'
    assert sql("select pg_get_userbyid(relowner) <> 'service_role' from pg_class where oid='public.leads'::regclass;") == 't'
    sql(f'insert into consent_private.policy_versions(version,canonical,hash) values({q(VERSION)},{q(CANONICAL)},{q(HASH)});')

    phase = 'disabled runtime'
    ident = uid()
    runtime(insert(ident)+';','23514')
    assert count(ident) == '0'
    record('disabled versioned insert','BLOCKED')
    ident = uid()
    runtime(insert(ident,False)+';')
    assert count(ident) == '1'
    record('disabled legacy timestamp-only insert','ALLOWED_COMPATIBILITY')

    phase = 'active runtime guard denials'
    sql(f"update consent_private.control set active_version='{VERSION}' where singleton;")
    for name, statement, state, ident in [
        ('missing evidence',None,'23514',uid()),
        ('mismatched hash',None,'23503',uid()),
    ]:
        statement = insert(ident,False) if name == 'missing evidence' else insert(ident,True,'0'*64)
        runtime(statement+';',state)
        assert count(ident) == '0'
        record(name,'BLOCKED')
    ident = uid()
    runtime(f"copy public.leads(id,name,email,project_summary,consent_at) from stdin;\n{ident}\tSynthetic\tsynthetic@example.test\tSynthetic\t{STAMP}\n\\.\n",'23514')
    assert count(ident) == '0'
    record('COPY missing evidence','BLOCKED')

    phase = 'fabricated matching tuple'
    forged = uid()
    runtime(insert(forged)+';')
    assert count(forged) == '1'
    assert sql(f"select consent_at='2000-01-01T00:00:00Z'::timestamptz from public.leads where id='{forged}';") == 't'
    record('matching tuple without form or checkbox and backdated timestamp','BYPASS_DEMONSTRATED')
    before = snapshot(forged)
    legacy_before = snapshot(legacy)
    runtime(f"update public.leads set consent_at=now() where id='{forged}';",'23514')
    runtime(f"update public.leads set consent_policy_version='{VERSION}',consent_policy_hash='{HASH}',consent_capture_method='explicit-checkbox-v1' where id='{legacy}';",'23514')
    runtime(insert(forged)+" on conflict(id) do update set consent_at=now();",'23514')
    assert snapshot(forged) == before and snapshot(legacy) == legacy_before
    record('UPDATE and UPSERT evidence rewrite','BLOCKED')
    runtime(f"update public.leads set status='contacted' where id='{forged}';")
    assert snapshot(forged) == before
    record('ordinary operational edit','ALLOWED_CONTROL')

    phase = 'privileged COPY forgery'
    copied = uid()
    runtime(f"copy public.leads(id,name,email,project_summary,consent_at,consent_policy_version,consent_policy_hash,consent_capture_method) from stdin;\n{copied}\tSynthetic\tsynthetic@example.test\tSynthetic\t{STAMP}\t{VERSION}\t{HASH}\texplicit-checkbox-v1\n\\.\n")
    assert count(copied) == '1'
    record('COPY matching forged tuple','BYPASS_DEMONSTRATED')
    upserted = uid()
    runtime(insert(upserted)+" on conflict(id) do update set status='contacted';")
    assert count(upserted) == '1'
    record('UPSERT insert branch matching forged tuple','BYPASS_DEMONSTRATED')

    phase = 'runtime control and DDL denials'
    for name, statement in [
        ('publish policy',f'insert into consent_private.policy_versions(version,canonical,hash) values({q(VERSION)},{q(CANONICAL)},{q(HASH)});'),
        ('disable activation','update consent_private.control set active_version=null where singleton;'),
        ('disable trigger','alter table public.leads disable trigger guard_lead_consent_evidence;'),
        ('replica session','set session_replication_role=replica;'),
        ('replace guard','create or replace function consent_private.guard_lead_evidence() returns trigger language plpgsql as $$begin return NEW; end;$$;'),
        ('delete evidence',f"delete from public.leads where id='{forged}';"),
        ('truncate evidence','truncate public.leads;'),
    ]:
        runtime(statement,'42501')
        record(name,'BLOCKED_UNDER_TEST_GRANTS')
    assert snapshot(forged) == before
    assert sql('select active_version from consent_private.control;') == VERSION

    phase = 'expanded DELETE privilege'
    # Additional grant only in this scratch DB; never inferred as deployed ACL.
    sql('grant delete on public.leads to service_role;')
    runtime(f"begin;delete from public.leads where id='{forged}';"+insert(forged).replace(STAMP,'2001-01-01T00:00:00Z')+';commit;')
    assert sql(f"select consent_at='2001-01-01T00:00:00Z'::timestamptz from public.leads where id='{forged}';") == 't'
    record('DELETE plus reinsert with expanded grant','BYPASS_DEMONSTRATED_CONDITIONAL')
    sql('revoke delete on public.leads from service_role;')

    phase = 'expanded TRUNCATE privilege'
    total = sql('select count(*) from public.leads;')
    assert int(total) > 0
    runtime('truncate public.leads;','42501')
    sql('grant truncate on public.leads to service_role;')
    assert runtime('begin;truncate public.leads;select count(*) from public.leads;rollback;') == '0'
    assert sql('select count(*) from public.leads;') == total
    record('TRUNCATE with expanded grant','BYPASS_DEMONSTRATED_CONDITIONAL')
    sql('revoke truncate on public.leads from service_role;')

    phase = 'operator disables trigger'
    operator_before = snapshot(forged)
    changed = sql(f"begin;alter table public.leads disable trigger guard_lead_consent_evidence;update public.leads set consent_at='1999-01-01T00:00:00Z' where id='{forged}';select consent_at='1999-01-01T00:00:00Z'::timestamptz from public.leads where id='{forged}';rollback;")
    assert changed == 't' and snapshot(forged) == operator_before
    record('operator DDL disables evidence immutability','BYPASS_DEMONSTRATED_OPERATOR')

    phase = 'operator replica restore'
    replica = uid()
    assert sql('begin;set local session_replication_role=replica;'+insert(replica,False)+f";select count(*) from public.leads where id='{replica}';rollback;") == '1'
    assert count(replica) == '0'
    record('operator replica mode bypasses insert trigger','BYPASS_DEMONSTRATED_OPERATOR')

    phase = 'restore disabled state'
    sql('update consent_private.control set active_version=null where singleton;')
    assert sql('select active_version is null from consent_private.control;') == 't'
    print('::warning::Synthetic consent challenge: matching forged tuples are accepted through INSERT, COPY and UPSERT; hashes do not authenticate a checkbox event.')
    print('::warning::Synthetic consent challenge: expanded DELETE/TRUNCATE grants and operator trigger/replica controls defeat record immutability. Deployed ACLs and production exposure are unverified.')
    print('Passed: all '+str(len(results))+' expected synthetic writer outcomes verified; this is not a bypass-free certification.')
except Exception:
    print('::error::Privileged synthetic writer challenge failed at '+phase+'.')
    raise SystemExit(1)
finally:
    if created:
        sql(f'drop database {DB} with (force);',database='postgres')
        assert sql(f"select count(*) from pg_database where datname='{DB}';",database='postgres') == '0'
        print('Passed: exact synthetic writer database cleanup; no shared role changes.')
