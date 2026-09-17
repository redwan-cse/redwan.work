"""Adjust only the synthetic job-local Auth project before startup."""
import os,pathlib,re,tomllib
p=pathlib.Path(os.environ['RUNNER_TEMP'])/'redwan-auth-ci/supabase/config.toml'
s=p.read_text();config=tomllib.loads(s)
assert config['project_id']=='redwan-auth-ci' and config['auth']['site_url']=='http://localhost:3399'
assert 'invite' not in config['auth'].get('email',{}).get('template',{})
s,n=re.subn(r'^jwt_expiry = .*$', 'jwt_expiry = 120',s,flags=re.M);assert n==1
f=p.parent/'invite-ci.html'
f.write_text('<h2>Invitation</h2><p><a href="{{ .SiteURL }}/invite/accept?token_hash={{ .TokenHash }}&amp;type=invite">Accept invitation</a></p>')
f.chmod(0o644)
s+='\n[auth.email.template.invite]\nsubject = "Disposable invitation acceptance"\ncontent_path = "./supabase/invite-ci.html"\n'
tomllib.loads(s);p.write_text(s)
print('Synthetic invitation template and 120-second access-token expiry configured.')
