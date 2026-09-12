import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {validateContactFile,verifyStoredObjectSize} from '@/lib/r2';
export interface DeliverableMetadata{key:string;filename:string;mime:string;size_bytes:number;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function validateDeliverable(projectId:unknown,raw:unknown):Promise<DeliverableMetadata|null>{
 if(typeof projectId!=='string'||!UUID.test(projectId)||!raw||typeof raw!=='object')return null;
 const meta=raw as DeliverableMetadata;
 const check=validateContactFile({filename:meta.filename,mime:meta.mime,size:meta.size_bytes});
 if(!check.ok||typeof meta.key!=='string')return null;
 try{
  const {data,error}=await getSupabaseAdmin().from('projects').select('client_id,archived_at').eq('id',projectId).maybeSingle();
  if(error||!data||data.archived_at!==null||typeof data.client_id!=='string'||!UUID.test(data.client_id))return null;
  const prefix=`private/${data.client_id}/project_${projectId}/`;
  if(!meta.key.startsWith(prefix))return null;
  const name=meta.key.slice(prefix.length),dot=name.lastIndexOf('.');
  if(dot<0||!UUID.test(name.slice(0,dot))||name.slice(dot+1)!==check.ext)return null;
  if(!await verifyStoredObjectSize(meta.key,meta.size_bytes))return null;
  return {key:meta.key,filename:meta.filename,mime:meta.mime.trim().toLowerCase().split(';')[0].trim(),size_bytes:meta.size_bytes};
 }catch{return null;}
}
