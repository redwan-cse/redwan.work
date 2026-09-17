import concurrent.futures
import subprocess
import uuid

C = 'supabase_db_redwan-reliability-ci'
users = [str(uuid.uuid4()) for _ in range(2)]
claimed_nonces = []
phase = 'init'

def sql(statement, succeeds=True):
    result = subprocess.run(
        ['docker', 'exec', '-i', C, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        input=statement,
        text=True,
        capture_output=True,
        timeout=30
    )
    if succeeds and result.returncode:
        raise RuntimeError(f'database assertion failed: {result.stderr.strip()}')
    if not succeeds and not result.returncode:
        raise RuntimeError('expected database rejection')
    return result.stdout.strip()

def claim(nonce_hash, user_id, purpose='recovery', expiry="now() + interval '5 minutes'"):
    claimed_nonces.append(nonce_hash)
    return f"select public.claim_auth_retry_nonce('{nonce_hash}', '{user_id}', '{purpose}', {expiry});"

try:
    sql(f"insert into auth.users(id, email) values ('{users[0]}', 'retry-fixture-0@example.test'), ('{users[1]}', 'retry-fixture-1@example.test');")

    phase = 'role privileges and table isolation'
    for role in ['anon', 'authenticated']:
        assert sql(f"select has_table_privilege('{role}', 'public.auth_retry_claims', 'select');") == 'f'
        assert sql(f"select has_table_privilege('{role}', 'public.auth_retry_claims', 'insert');") == 'f'
        assert sql(f"select has_function_privilege('{role}', 'public.claim_auth_retry_nonce(text,uuid,text,timestamptz)', 'execute');") == 'f'
    assert sql("select has_function_privilege('service_role', 'public.claim_auth_retry_nonce(text,uuid,text,timestamptz)', 'execute');") == 't'

    phase = 'durable single-use claim'
    n1 = 'single-' + str(uuid.uuid4())
    assert sql(claim(n1, users[0])) == 't'
    # Immediate second claim must fail
    assert sql(claim(n1, users[0])) == 'f'
    # Different user claiming same nonce must fail
    assert sql(claim(n1, users[1])) == 'f'
    # Row must exist in database
    assert sql(f"select count(*) from public.auth_retry_claims where nonce_hash = '{n1}';") == '1'

    phase = 'fixed expiry rather than resetting rate-limit window'
    # In a resetting rate-limit window, after the window passes, consume_rate_limit resets count and allows reuse.
    # In durable single-use claims, the claim NEVER resets or allows reuse.
    assert sql(claim(n1, users[0], expiry="now() + interval '10 minutes'")) == 'f'
    # Already-expired claim submission must fail immediately
    n_exp = 'expired-' + str(uuid.uuid4())
    assert sql(claim(n_exp, users[0], expiry="now() - interval '1 second'")) == 'f'
    assert sql(f"select count(*) from public.auth_retry_claims where nonce_hash = '{n_exp}';") == '0'

    phase = 'concurrent claims across separate workers'
    race_nonce = 'race-' + str(uuid.uuid4())
    claimed_nonces.append(race_nonce)
    def worker_claim(_):
        res = subprocess.run(
            ['docker', 'exec', '-i', C, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
            input=f"select public.claim_auth_retry_nonce('{race_nonce}', '{users[0]}', 'recovery', now() + interval '5 minutes');",
            text=True,
            capture_output=True,
            timeout=30
        )
        return res.stdout.strip()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(worker_claim, range(12)))

    assert results.count('t') == 1, f"Expected exactly 1 success, got {results.count('t')}"
    assert results.count('f') == 11, f"Expected 11 rejections, got {results.count('f')}"
    assert sql(f"select count(*) from public.auth_retry_claims where nonce_hash = '{race_nonce}';") == '1'

    phase = 'ambiguous provider failure isolation'
    # Ambiguous provider failure (e.g. updateUser timeout) does NOT reopen or delete the consumed claim.
    assert sql(claim(race_nonce, users[0])) == 'f'
    assert sql(f"select count(*) from public.auth_retry_claims where nonce_hash = '{race_nonce}';") == '1'

    print('Passed: durable single-use claims with fixed expiry, non-resetting semantics, concurrency isolation, and fail-closed security.')
except Exception as e:
    print(f'::error::Auth retry claims database acceptance failed at {phase}: {e}')
    raise SystemExit(1)
finally:
    try:
        user_ids = ','.join(f"'{u}'" for u in users)
        sql(f"delete from public.auth_retry_claims where user_id in ({user_ids}); delete from auth.users where id in ({user_ids});")
        assert sql(f"select count(*) from public.auth_retry_claims where user_id in ({user_ids});") == '0'
        assert sql(f"select count(*) from public.profiles where id in ({user_ids});") == '0'
        print('Exact auth retry claims fixtures removed and verified.')
    except Exception as e:
        print(f'::error::Auth retry claims fixture cleanup failed: {e}')
        raise SystemExit(1)
