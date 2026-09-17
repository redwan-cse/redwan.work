import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import * as storage from '@/lib/r2';
import type {CrmResult} from '@/lib/crm/result';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function deleteOwnedFile(fileId:string,viewer:{userId:string;role:'admin'|'client'}):Promise<CrmResult>{
 if(typeof fileId!=='string'||!UUID.test(fileId)||!viewer||typeof viewer.userId!=='string'||!UUID.test(viewer.userId)||!['admin','client'].includes(viewer.role))return {ok:false,error:'File not found.'};
 const admin=getSupabaseAdmin();
 try{
  // Reuse only a fully recorded backup. New backup authorization happens in SQL
  // before reading any source bytes; preparation rechecks the row under locks.
  const existing=await admin.from('file_recovery').select('file_id,requested_by,file_snapshot,recovery_key,sha256,archive_bytes').eq('file_id',fileId).maybeSingle();
  if(existing.error)return {ok:false,error:'Backup tracking unavailable. File was not deleted.'};
  let snapshot:Record<string,unknown>,key:string,hash:string,size:number;
  if(existing.data){
   if(existing.data.requested_by!==viewer.userId)return {ok:false,error:'File not found.'};
   snapshot=existing.data.file_snapshot as Record<string,unknown>;key=existing.data.recovery_key;hash=existing.data.sha256;size=Number(existing.data.archive_bytes);
  }else{
   const found=await admin.rpc('file_backup_snapshot',{p_file:fileId,p_actor:viewer.userId,p_role:viewer.role});
   if(found.error||!found.data)return {ok:false,error:'File deletion refused. No storage operation was attempted.'};
   snapshot=found.data as Record<string,unknown>;
   if(snapshot.id!==fileId||typeof snapshot.r2_key!=='string'||!storage.isPortalKey(snapshot.r2_key)||!Number.isSafeInteger(Number(snapshot.size_bytes))||Number(snapshot.size_bytes)<1||Number(snapshot.size_bytes)>storage.CONTACT_MAX_SIZE_BYTES)throw new Error();
   const {readRecoveryBytes,writeRecoveryBytes}=await import('@/lib/crm/recovery-storage');
   const {encodeRecoveryArchive}=await import('@/lib/crm/recovery-archive');
   const source=await readRecoveryBytes(snapshot.r2_key,Number(snapshot.size_bytes));
   if(source.length!==Number(snapshot.size_bytes))throw new Error();
   const manifest={version:1,kind:'individual',file:snapshot,fileSha256:digest(source)};
   const zip=encodeRecoveryArchive([{name:'recovery.json',bytes:Buffer.from(JSON.stringify(manifest))},{name:`files/${fileId}`,bytes:source}]);
   key=`archive/project_${fileId}/individual_${randomUUID()}.zip`;hash=digest(zip);size=zip.length;
   await writeRecoveryBytes(key,zip);
   const verified=await readRecoveryBytes(key,size);
   if(verified.length!==size||digest(verified)!==hash)throw new Error();
  }
  const prepared=await admin.rpc('prepare_backed_up_file_deletion',{p_file:fileId,p_actor:viewer.userId,p_role:viewer.role,p_expected:snapshot,p_key:key,p_sha256:hash,p_bytes:size});
  if(prepared.error||!prepared.data||typeof prepared.data.key!=='string'||!storage.isPortalKey(prepared.data.key)||typeof prepared.data.completed!=='boolean')return {ok:false,error:'File changed or backup preparation was refused. Source deletion was not attempted.'};
  if(prepared.data.completed)return {ok:true};
  // Recheck the backup even on retries. A registry row alone is not live bytes.
  const {readRecoveryBytes}=await import('@/lib/crm/recovery-storage');
  if(digest(await readRecoveryBytes(key,size))!==hash)throw new Error();
  try{
   await storage.deletePrivateObjects([prepared.data.key]);
   const saved=await admin.from('storage_deletions').update({completed_at:new Date().toISOString()}).eq('r2_key',prepared.data.key).eq('file_id',fileId).is('completed_at',null);
   if(saved.error)return {ok:false,error:'File backed up; storage acknowledgement is queued for retry. Tracking is retained.'};
   return {ok:true};
  }catch{return {ok:false,error:'File backed up; storage cleanup is queued for retry. Tracking is retained.'};}
 }catch{return {ok:false,error:'Backup verification failed. No further source deletion was attempted.'};}
}
