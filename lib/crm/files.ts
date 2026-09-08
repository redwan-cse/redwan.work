import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {crmError,type CrmResult} from '@/lib/crm/result';
import {isPortalKey,presignPrivateGet,deletePrivateObjects,validateContactFile} from '@/lib/r2';
export interface FileRow{id:string;bucket:'public'|'private';r2_key:string;kind:'attachment'|'deliverable'|'asset';ticket_id:string|null;project_id:string|null;filename:string;mime:string;size_bytes:number;created_at:string;uploaded_by:string;}
const COLUMNS='id, bucket, r2_key, kind, ticket_id, project_id, filename, mime, size_bytes, created_at, uploaded_by';
type Viewer={userId:string;role:'admin'|'client'};
async function currentViewer(viewer:Viewer):Promise<boolean>{const {data,error}=await getSupabaseAdmin().from('profiles').select('role,is_active').eq('id',viewer.userId).maybeSingle();return !error&&data?.role===viewer.role&&data.is_active===true;}
async function owned(file:FileRow,viewer:Viewer):Promise<boolean>{
 if(viewer.role==='admin')return true;const admin=getSupabaseAdmin();
 if(file.kind==='deliverable'&&file.project_id){const {data,error}=await admin.from('projects').select('id').eq('id',file.project_id).eq('client_id',viewer.userId).maybeSingle();return !error&&!!data;}
 if(file.kind==='attachment'&&file.ticket_id){const {data,error}=await admin.from('tickets').select('id').eq('id',file.ticket_id).eq('client_id',viewer.userId).maybeSingle();return !error&&!!data;}
 return file.kind==='attachment'&&!file.ticket_id&&file.uploaded_by===viewer.userId;
}
export async function createFileRow(input:{bucket:'private';r2_key:string;kind:'attachment'|'deliverable';ticket_id?:string;project_id?:string;uploaded_by:string;filename:string;mime:string;size_bytes:number}):Promise<CrmResult>{
 if(!input||input.bucket!=='private'||!isPortalKey(input.r2_key))return crmError('Invalid file key.');
 if(!input.uploaded_by)return crmError('Missing uploader.');
 if(!validateContactFile({filename:input.filename,mime:input.mime,size:input.size_bytes}).ok)return crmError('Invalid file metadata.');
 if(input.kind==='attachment'){if(input.project_id)return crmError('Attachment must not have project_id.');const pending=input.r2_key.includes('/pending/');if(!input.ticket_id&&!pending)return crmError('Attachment requires ticket_id.');if(input.ticket_id&&pending)return crmError('Pending attachment must not have ticket_id.');}
 else if(input.kind==='deliverable'){if(!input.project_id||input.ticket_id)return crmError('Invalid deliverable scope.');}else return crmError('Invalid file kind.');
 try{
  const admin=getSupabaseAdmin();
  if(input.kind==='deliverable'){
   const {data,error}=await admin.rpc('confirm_project_deliverable',{p_actor:input.uploaded_by,p_project:input.project_id,p_file:{r2_key:input.r2_key,filename:input.filename,mime:input.mime,size_bytes:input.size_bytes}});
   if(error||typeof data!=='string')return crmError('Could not confirm file. Refresh and check the project state before retrying.');
   return {ok:true};
  }
  const {error}=await admin.from('files').insert({bucket:input.bucket,r2_key:input.r2_key,kind:input.kind,ticket_id:input.ticket_id??null,project_id:null,uploaded_by:input.uploaded_by,filename:input.filename,mime:input.mime,size_bytes:input.size_bytes});
  if(error)return crmError('Could not save file.');return {ok:true};
 }catch{return crmError('Could not save file. Please retry.');}
}
export async function getOwnedFileUrl(fileId:string,viewer:Viewer):Promise<{ok:true;url:string;filename:string}|{ok:false;error:string}>{
 try{if(!await currentViewer(viewer))return {ok:false,error:'File not found.'};const {data,error}=await getSupabaseAdmin().from('files').select(COLUMNS).eq('id',fileId).maybeSingle();if(error||!data||!await owned(data as FileRow,viewer))return {ok:false,error:'File not found.'};const file=data as FileRow;return {ok:true,url:await presignPrivateGet(file.r2_key,60),filename:file.filename};}
 catch{return {ok:false,error:'File not found.'};}
}
export async function deleteOwnedFile(fileId:string,viewer:Viewer):Promise<CrmResult>{
 try{
  if(!await currentViewer(viewer))return crmError('File not found.');const admin=getSupabaseAdmin();const {data,error}=await admin.from('files').select(COLUMNS).eq('id',fileId).maybeSingle();if(error)return crmError('File lookup failed.');if(!data||!await owned(data as FileRow,viewer))return crmError('File not found.');const file=data as FileRow;
  if(viewer.role==='client'){if(file.kind!=='attachment')return crmError('Only attachments can be deleted.');if(file.uploaded_by!==viewer.userId)return crmError('File not found.');const age=Date.now()-new Date(file.created_at).getTime();if(!Number.isFinite(age)||age<0||age>86400000)return crmError('Delete window expired.');}
  try{await deletePrivateObjects([file.r2_key]);}catch{return crmError('Storage deletion incomplete. Tracking is retained; please retry.');}
  const removed=await admin.from('files').delete().eq('id',fileId).eq('r2_key',file.r2_key);if(removed.error)return crmError('Storage deletion completed, but tracking could not be updated. Please retry.');return {ok:true};
 }catch{return crmError('File operation failed. Please try again.');}
}
export async function listTicketAttachmentRows(ticketId:string):Promise<FileRow[]>{
 const {data,error}=await getSupabaseAdmin().from('files').select(COLUMNS).eq('ticket_id',ticketId).eq('kind','attachment').order('created_at',{ascending:true}).limit(11);
 if(error)throw new Error('Could not load ticket attachments.');if((data?.length??0)>10)throw new Error('Ticket attachment count requires administrator review.');return (data??[]) as FileRow[];
}
// Compatibility helper; live Files pages use bounded SQL pagination.
export async function listOwnDeliverables(clientId:string):Promise<Array<FileRow&{project_name:string}>>{
 const admin=getSupabaseAdmin();const out:Array<FileRow&{project_name:string}>=[];let after='';
 while(true){let query=admin.from('files').select(`${COLUMNS}, projects!inner(name,client_id,archived_at)`).eq('kind','deliverable').eq('projects.client_id',clientId).is('projects.archived_at',null).order('id').limit(100);if(after)query=query.gt('id',after);const {data,error}=await query;if(error)throw new Error('Could not load deliverables.');const rows=(data??[]) as unknown as Array<FileRow&{projects:{name:string}}>;
  for(const row of rows){out.push({...row,project_name:row.projects.name});}if(rows.length<100)break;after=rows[rows.length-1].id;
 }return out.sort((a,b)=>a.project_name.localeCompare(b.project_name)||a.created_at.localeCompare(b.created_at));
}
export async function countPendingAttachmentOrphans():Promise<{rows:number;keys:string[]}>{
 const admin=getSupabaseAdmin(),keys:string[]=[];const cutoff=new Date(Date.now()-86400000).toISOString();let after='';
 while(true){let query=admin.from('files').select('id,r2_key').eq('kind','attachment').is('ticket_id',null).lt('created_at',cutoff).order('id').limit(100);if(after)query=query.gt('id',after);const {data,error}=await query;if(error)throw new Error('Could not inspect pending attachments.');for(const row of data??[])keys.push(row.r2_key);if((data?.length??0)<100)break;after=data![data!.length-1].id;}return {rows:keys.length,keys};
}
