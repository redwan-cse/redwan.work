"""Inspect only disposable CI containers; emit fixed diagnostics, never env values."""
import json
import os
import pathlib
import subprocess
import time
import urllib.request
from urllib.parse import urlparse


def inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError('container unavailable')
    return json.loads(result.stdout)[0]


phase = 'read disposable Auth configuration'
try:
    auth = inspect('supabase_auth_redwan-auth-ci')
    env = dict(item.split('=', 1) for item in auth['Config']['Env'] if '=' in item)
    raw = env.get('GOTRUE_MAILER_TEMPLATES_RECOVERY', '')
    subject = env.get('GOTRUE_MAILER_SUBJECTS_RECOVERY', '')
    print('Disposable recovery template configured:', bool(raw))
    print('Disposable custom recovery subject matched:', subject == 'Disposable recovery acceptance')
    phase = 'require configured recovery template'
    if not raw:
        raise RuntimeError('missing recovery template')
    target = urlparse(raw)
    if target.scheme != 'http' or target.hostname != 'supabase_kong_redwan-auth-ci' or target.port != 8088 or target.query or target.username or target.password:
        raise RuntimeError('unexpected local template endpoint')
    phase = 'verify local template server content'
    kong = inspect('supabase_kong_redwan-auth-ci')
    networks = kong['NetworkSettings']['Networks']
    ip = next(value['IPAddress'] for value in networks.values() if value.get('IPAddress'))
    expected = (pathlib.Path(os.environ['RUNNER_TEMP']) / 'redwan-auth-ci/supabase/recovery-ci.html').read_bytes()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 30
    matched = False
    while time.monotonic() < deadline:
        try:
            with opener.open('http://' + ip + ':8088' + target.path, timeout=3) as response:
                matched = response.status == 200 and response.read() == expected
            if matched:
                break
        except Exception:
            pass
        time.sleep(0.25)
    if not matched:
        raise RuntimeError('template content unavailable')
    print('Disposable recovery template endpoint matches the configured file.')
    # Auth may have cached a fallback when the template listener was not ready.
    # This occurs before fixtures exist; it is confined to this disposable stack.
    phase = 'reload disposable Auth after template readiness'
    result = subprocess.run(['docker', 'restart', 'supabase_auth_redwan-auth-ci'], capture_output=True)
    if result.returncode:
        raise RuntimeError('local restart failed')
    deadline = time.monotonic() + 30
    healthy = False
    while time.monotonic() < deadline:
        state = inspect('supabase_auth_redwan-auth-ci')['State']
        if state.get('Running') and state.get('Health', {}).get('Status') == 'healthy':
            healthy = True
            break
        time.sleep(0.25)
    if not healthy:
        raise RuntimeError('local Auth health unavailable')
    print('Disposable Auth healthy after verified template readiness.')
except Exception:
    print('::error::Disposable template verification failed at ' + phase)
    raise SystemExit(1)
