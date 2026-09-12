import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {deletePrivateObjects,isPortalKey} from '@/lib/r2';
import type {CrmResult} from '@/lib/crm/result';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function deleteOwnedFile(fileId:string,viewer:{userId:string;role:'admin'|'client'}):Promise<CrmResult>{
 if(typeof fileId!=='string'||!UUID.test(fileId)||!viewer||typeof viewer.userId!=='string'||!UUID.test(viewer.userId)||!['admin','client'].includes(viewer.role))return {ok:false,error:'File not found.'};
 const admin=getSupabaseAdmin();
 try{
  const {data,error}=await admin.rpc('prepare_file_deletion',{p_file:fileId,p_actor:viewer.userId,p_role:viewer.role});
  if(error||!data||typeof data.key!=='string'||!isPortalKey(data.key)||typeof data.completed!=='boolean')return {ok:false,error:'File deletion refused. No storage operation was attempted.'};
  if(data.completed)return {ok:true};
  try{
   await deletePrivateObjects([data.key]);
   const saved=await admin.from('storage_deletions').update({completed_at:new Date().toISOString()}).eq('r2_key',data.key).eq('file_id',fileId).is('completed_at',null);
   if(saved.error)return {ok:false,error:'File removed from the listing; storage acknowledgement is queued for retry. Tracking is retained.'};
   return {ok:true};
  }catch{return {ok:false,error:'File removed from the listing; storage cleanup is queued for retry. Tracking is retained.'};}
 }catch{return {ok:false,error:'File deletion unavailable. Refresh before retrying.'};}
}
