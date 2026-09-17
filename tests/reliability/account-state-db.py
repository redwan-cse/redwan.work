import json,subprocess,uuid
C='supabase_db_redwan-reliability-ci';u=str(uuid.uuid4());other=str(uuid.uuid4())
def sql(value):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=value,text=True,capture_output=True,timeout=30)
 if r.returncode:raise RuntimeError()
 return r.stdout.strip()
def state(user):
 claims=json.dumps({'sub':user,'role':'authenticated','app_metadata':{'role':'client'},'iat':9999999999})
 return sql("begin;set local role authenticated;set local request.jwt.claims='"+claims+"';select public.caller_account_state();rollback;")
try:
 sql(f"insert into auth.users(id) values('{u}');")
 assert state(u)=='active';assert state(other)=='reauthenticate'
 sql(f"update public.profiles set is_active=false where id='{u}';")
 assert state(u)=='inactive';assert state(other)=='reauthenticate'
 print('Passed: coarse account state is caller-only and preserves inactive profile secrecy.')
except Exception:print('::error::Caller account-state acceptance failed.');raise SystemExit(1)
finally:
 sql(f"delete from auth.users where id='{u}';")
