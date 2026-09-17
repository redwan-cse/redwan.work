"""Backup-before-delete boundary; disposable CI only, no production credentials."""
import os, subprocess, uuid
if os.environ.get('GITHUB_ACTIONS') != 'true': raise SystemExit('Disposable CI required')
C='supabase_db_redwan-reliability-ci'
u,owner,p,f=[str(uuid.uuid4()) for _ in range(4)]
key=f'private/{owner}/project_{p}/{uuid.uuid4()}.pdf'
backup=f'archive/project_{f}/individual_{uuid.uuid4()}.zip'
phase='setup'
def sql(s,code=None):
 r=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=s,text=True,capture_output=True,timeout=45)
 if code is None:
  if r.returncode: raise AssertionError('Synthetic SQL error')
 elif r.returncode==0 or f'{code}:' not in r.stderr: raise AssertionError('Expected SQLSTATE not observed')
 return r.stdout.strip()
try:
 sql(f"insert into auth.users(id,raw_app_meta_data) values('{u}','{{\"role\":\"admin\"}}'),('{owner}','{{\"role\":\"client\"}}');update public.profiles set role='admin',is_active=true where id='{u}';update public.profiles set role='client',is_active=true where id='{owner}';insert into public.projects(id,client_id,name) values('{p}','{owner}','Synthetic recovery');insert into public.files(id,bucket,kind,project_id,uploaded_by,r2_key,filename,mime,size_bytes) values('{f}','private','deliverable','{p}','{u}','{key}','Synthetic.pdf','application/pdf',4);")
 phase='backup-gated RPC exists'
 assert sql("select to_regprocedure('public.prepare_backed_up_file_deletion(uuid,uuid,text,jsonb,text,text,bigint)') is not null;")=='t'
 phase='old direct deletion denied'
 sql(f"set role service_role;select public.prepare_file_deletion('{f}','{u}','admin');",'42501')
 assert sql(f"select count(*) from public.files where id='{f}';")=='1'
 phase='snapshot authorizes before storage read'
 sql(f"select public.file_backup_snapshot('{f}','{owner}','client');",'P0001')
 assert sql(f"select public.file_backup_snapshot('{f}','{u}','admin')->>'id';")==f
 phase='invalid proof preserves source'
 sql(f"select public.prepare_backed_up_file_deletion('{f}','{u}','admin',to_jsonb(f),'bad','bad',1) from public.files f where id='{f}';",'P0001')
 assert sql(f"select count(*) from public.files where id='{f}';")=='1'
 phase='prepared source has preserved snapshot and proof'
 sql(f"select public.prepare_backed_up_file_deletion('{f}','{u}','admin',to_jsonb(f),'{backup}','{'a'*64}',1000) from public.files f where id='{f}';")
 assert sql(f"select count(*) from public.files where id='{f}';")=='0'
 assert sql(f"select count(*) from public.file_recovery where file_id='{f}' and file_snapshot->>'r2_key'='{key}';")=='1'
 assert sql(f"select source from public.storage_deletions where file_id='{f}';")=='individual'
 phase='runtime cannot erase backups'
 for verb in [f"delete from public.file_recovery where file_id='{f}';",f"update public.file_recovery set sha256='{'b'*64}' where file_id='{f}';",'truncate public.file_recovery;']:
  sql('set role service_role;'+verb,'42501')
 phase='new unbacked job is denied'
 sql(f"insert into public.storage_deletions(r2_key,source,file_id,requested_by) values('private/{owner}/pending/{uuid.uuid4()}.pdf','individual','{uuid.uuid4()}','{u}');",'P0001')
 print('Passed: backup snapshot authorization, legacy RPC denial, exact proof requirements, source preservation and backup table privilege restrictions.')
except Exception:
 print('::error::File recovery SQL failed at '+phase+'.');raise SystemExit(1)
finally:
 sql(f"delete from public.storage_deletions where file_id='{f}';")
 if sql("select to_regclass('public.file_recovery') is not null;")=='t':sql(f"delete from public.file_recovery where file_id='{f}';")
 sql(f"delete from public.projects where id='{p}';delete from public.email_outbox where recipient_id in('{u}','{owner}');delete from auth.users where id in('{u}','{owner}');")
 assert sql(f"select count(*) from public.profiles where id in('{u}','{owner}');")=='0'
 print('Passed: exact file recovery fixture cleanup.')
