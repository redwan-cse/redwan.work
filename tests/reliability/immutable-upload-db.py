import os,subprocess,uuid
if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('Disposable CI required')
C='supabase_db_redwan-reliability-ci';owner=str(uuid.uuid4());source=f'private/{owner}/pending/{uuid.uuid4()}.pdf';target=f'private/{owner}/pending/{uuid.uuid5(uuid.NAMESPACE_URL,source)}.pdf';phase='schema'
def sql(s,code=None):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=s,text=True,capture_output=True,timeout=30)
 if code is None:
  if r.returncode:raise AssertionError('Synthetic SQL failure')
 elif not r.returncode or f'{code}:' not in r.stderr:raise AssertionError('Expected privilege denial')
 return r.stdout.strip()
try:
 assert sql("select to_regclass('public.immutable_uploads') is not null;")=='t'
 phase='register verified proof'
 claim=f"select public.register_immutable_upload('{source}','{target}','{'a'*64}',8);"
 assert sql('set role service_role;'+claim)=='t';assert sql(claim)=='t'
 assert sql(claim.replace('a'*64,'b'*64))=='f'
 phase='runtime cannot rewrite proof'
 for role in ['anon','authenticated']:sql('set role '+role+';'+claim,'42501')
 for verb in ['delete from public.immutable_uploads;','truncate public.immutable_uploads;',"update public.immutable_uploads set sha256='"+'b'*64+"';"]:sql('set role service_role;'+verb,'42501')
 print('Passed: frozen source mapping, idempotent proof registration and denied runtime proof rewrites.')
except Exception:print('::error::Immutable upload SQL failed at '+phase);raise SystemExit(1)
finally:
 if sql("select to_regclass('public.immutable_uploads') is not null;")=='t':sql(f"delete from public.immutable_uploads where source_key='{source}';")
