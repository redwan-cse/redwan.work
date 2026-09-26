import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomUUID} from 'node:crypto';
import {workflowSession} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {presignPrivateGet,presignPrivatePut} from '@/lib/r2';
import {readRecoveryBytes,writeRecoveryBytes,writeRestoredObject} from '@/lib/crm/recovery-storage';
import {decodeRecoveryArchive,RECOVERY_MAX_BYTES} from '@/lib/crm/recovery-archive';
export const runtime='nodejs';
export const maxDuration=60;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function reply(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});}
function failure(){return reply({error:'Recovery operation refused. Check the registered backup, current parent and permissions; no backup was discarded.'},400);}
type FileRow={id:string;r2_key:string;filename:string;mime:string;size_bytes:number;project_id:string|null;ticket_id:string|null};
type Mapping={project_id?:string;files:Array<{source_id:string;id:string;key:string}>};
type ImportRow={id:string;actor:string;upload_key:string;sealed_key:string;sha256:string|null;kind:'individual'|'project'|null;snapshot:unknown;result:unknown;created_at:string;object_plan:Mapping|null;completed_files:string[]};
function fileRows(row:ImportRow):FileRow[]{const s=row.snapshot as {files?:FileRow[]};const files=row.kind==='project'?s.files:[row.snapshot as FileRow];if(!Array.isArray(files)||files.length>2000)throw new Error();for(const f of files)if(!f||!UUID.test(f.id)||typeof f.filename!=='string'||typeof f.mime!=='string'||!Number.isSafeInteger(Number(f.size_bytes))||Number(f.size_bytes)<1||Number(f.size_bytes)>10485760)throw new Error();return files;}
function newId(operation:string,source:string){const h=createHash('sha256').update(operation+':'+source).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
async function readImport(id:string,actor:string):Promise<ImportRow>{const r=await getSupabaseAdmin().from('recovery_imports').select('id,actor,upload_key,sealed_key,sha256,kind,snapshot,result,created_at,object_plan,completed_files').eq('id',id).eq('actor',actor).maybeSingle();if(r.error||!r.data)throw new Error();return r.data as ImportRow;}
function verifyEntries(row:ImportRow,zip:Buffer){if(!row.sha256||hash(zip)!==row.sha256)throw new Error();const entries=decodeRecoveryArchive(zip);const files=fileRows(row);if(entries.size!==files.length+1&&!(row.kind==='project'&&entries.size===files.length+4))throw new Error();for(const f of files){const bytes=entries.get(`files/${f.id}`);if(!bytes||bytes.length!==Number(f.size_bytes))throw new Error();}return entries;}
function importStatus(row:ImportRow){
 const created=Date.parse(row.created_at);if(!Number.isFinite(created))throw new Error();
 const expiresAt=new Date(created+86400000).toISOString();
 // A committed result remains readable after the unfinished-import deadline.
 // Return an allowlist, never the saved snapshot, object keys or signed URLs.
 if(row.result!==null){
  const r=row.result as {projectId?:unknown;fileIds?:unknown};
  if(!r||!(r.projectId===null||(typeof r.projectId==='string'&&UUID.test(r.projectId)))||!Array.isArray(r.fileIds)||r.fileIds.length>2000||!r.fileIds.every(v=>typeof v==='string'&&UUID.test(v)))throw new Error();
  return {id:row.id,state:'completed',result:{projectId:r.projectId,fileIds:r.fileIds},expiresAt};
 }
 if(created<Date.now()-86400000)return {id:row.id,state:'expired',expiresAt};
 if(row.sha256===null)return {id:row.id,state:'uploading',expiresAt};
 if(!/^[a-f0-9]{64}$/.test(row.sha256)||!['individual','project'].includes(row.kind??''))throw new Error();
 const files=fileRows(row),ids=new Set(files.map(f=>f.id));
 if(ids.size!==files.length||!Array.isArray(row.completed_files)||new Set(row.completed_files).size!==row.completed_files.length||!row.completed_files.every(id=>ids.has(id)))throw new Error();
 const name=row.kind==='project'?(row.snapshot as {project:{name:unknown}}).project.name:files[0].filename;
 if(typeof name!=='string')throw new Error();
 return {id:row.id,state:'ready',kind:row.kind,name,files:files.length,completed:row.completed_files.length,expiresAt,notice:'Continue this same import from its saved checkpoint. Remaining bytes and permissions are verified during restore. Existing data is not overwritten.'};
}
export async function GET(request:NextRequest){
 try{
  const session=await workflowSession('admin',{requireUnbannedAuthUser:true});if(!session)return reply({error:'Unauthorized.'},401);
  const params=request.nextUrl.searchParams;
  if(params.has('importId')){
   const importId=params.get('importId');
   if(!importId||!UUID.test(importId)||params.getAll('importId').length!==1||['id','kind','page'].some(k=>params.has(k)))return failure();
   return reply(importStatus(await readImport(importId,session.userId)));
  }
  const db=getSupabaseAdmin();const id=request.nextUrl.searchParams.get('id'),kind=request.nextUrl.searchParams.get('kind');
  if(id){
   if(!UUID.test(id)||!['individual','project'].includes(kind??''))return failure();
   const table=kind==='individual'?'file_recovery':'project_recovery',column=kind==='individual'?'file_id':'project_id';
   const r=await db.from(table).select('recovery_key,sha256').eq(column,id).maybeSingle();if(r.error||!r.data)return failure();
   const zip=await readRecoveryBytes(r.data.recovery_key);if(hash(zip)!==r.data.sha256)return failure();
   return reply({url:await presignPrivateGet(r.data.recovery_key,60)});
  }
  const page=Number(request.nextUrl.searchParams.get('page')??1);if(!Number.isSafeInteger(page)||page<1||page>100000)return failure();const start=(page-1)*25;
  const [files,projects]=await Promise.all([db.from('file_recovery').select('file_id,created_at,archive_bytes,name:file_snapshot->>filename').order('created_at',{ascending:false}).order('file_id').range(start,start+25),db.from('project_recovery').select('project_id,created_at,name:snapshot->project->>name').order('created_at',{ascending:false}).order('project_id').range(start,start+25)]);
  if(files.error||projects.error)return failure();
  return reply({files:files.data?.slice(0,25)??[],projects:projects.data?.slice(0,25)??[],hasNext:(files.data?.length??0)>25||(projects.data?.length??0)>25});
 }catch{return failure();}
}
async function boundedBody(request:NextRequest){const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new Error();}chunks.push(value);}return Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
export async function POST(request:NextRequest){
 try{
  if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Forbidden.'},403);
  const session=await workflowSession('admin');if(!session)return reply({error:'Unauthorized.'},401);
  if(Number(request.headers.get('content-length')??0)>8192)return failure();
  const input:unknown=JSON.parse(await boundedBody(request));
  if(!input||typeof input!=='object'||!('action' in input))return failure();
  const data=input as {action:unknown;id?:unknown;size?:unknown};const db=getSupabaseAdmin();
  if(data.action==='upload'){
   if(typeof data.size!=='number'||!Number.isSafeInteger(data.size)||data.size<22||data.size>RECOVERY_MAX_BYTES)return failure();
   const id=randomUUID();const opened=await db.rpc('open_recovery_import',{p_actor:session.userId,p_id:id});if(opened.error||!opened.data)return failure();
   return reply({id,url:await presignPrivatePut(opened.data.upload_key,'application/zip',data.size,600)});
  }
  if(typeof data.id!=='string'||!UUID.test(data.id))return failure();let row=await readImport(data.id,session.userId);
  if(data.action==='preview'){
   const bytes=await readRecoveryBytes(row.upload_key);decodeRecoveryArchive(bytes);
   const sha=hash(bytes);const sealed=await db.rpc('seal_recovery_import',{p_actor:session.userId,p_id:row.id,p_sha256:sha});if(sealed.error||!sealed.data)return failure();row=sealed.data as ImportRow;
   verifyEntries(row,bytes);await writeRecoveryBytes(row.sealed_key,bytes);const verify=await readRecoveryBytes(row.sealed_key,bytes.length);if(hash(verify)!==sha)return failure();
   return reply({id:row.id,kind:row.kind,files:fileRows(row).length,name:row.kind==='project'?(row.snapshot as {project:{name:string}}).project.name:(row.snapshot as FileRow).filename,notice:'Restores new objects without overwriting existing data. Original ownership is preserved; no notification email is sent.'});
  }
  if(data.action==='restore'){
   if(row.result)return reply({result:row.result});
   if(new Date(row.created_at).getTime()<Date.now()-86400000)return failure();
   const zip=await readRecoveryBytes(row.sealed_key);const entries=verifyEntries(row,zip);const files=fileRows(row);
   let project:string|null=null,ticket:string|null=null,owner:string;
   if(row.kind==='project'){project=newId(row.id,'project');owner=(row.snapshot as {project:{client_id:string}}).project.client_id;}
   else{project=files[0].project_id;ticket=files[0].ticket_id;const r=project?await db.from('projects').select('client_id').eq('id',project).is('archived_at',null).maybeSingle():await db.from('tickets').select('client_id').eq('id',ticket).maybeSingle();if(r.error||!r.data)return failure();owner=r.data.client_id;}
   if(!UUID.test(owner)||(!project&&!ticket))return failure();
   const mapping:Mapping={...(row.kind==='project'?{project_id:project!}:{}),files:files.map(f=>{const ext=f.r2_key.match(/\.(pdf|docx|doc|xlsx|png|jpg|zip)$/)?.[1];if(!ext)throw new Error();const id=newId(row.id,f.id);return {source_id:f.id,id,key:`private/${owner}/${project?'project_'+project:'ticket_'+ticket}/${id}.${ext}`};})};
   const planned=await db.rpc('plan_recovery_objects',{p_actor:session.userId,p_id:row.id,p_plan:mapping});if(planned.error||!planned.data)return failure();row=planned.data as ImportRow;
   const completed=new Set(row.completed_files??[]),next=mapping.files.find(m=>!completed.has(m.source_id));
   // One object per request. Exact keys are recorded before writing, and each
   // successful byte verification is checkpointed for interruption recovery.
   if(next){const f=files.find(v=>v.id===next.source_id)!;const bytes=entries.get(`files/${f.id}`)!;await writeRestoredObject(next.key,bytes,f.mime);if(hash(await readRecoveryBytes(next.key,bytes.length))!==hash(bytes))return failure();
    const syntheticSource=next.key.replace(/\/([0-9a-f]{8}-[0-9a-f]{4})-5([0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.)/,'/$1-4$2');
    const registered=await db.rpc('register_immutable_upload',{p_source:syntheticSource,p_key:next.key,p_sha256:hash(bytes),p_size:bytes.length});if(registered.error||registered.data!==true)return failure();
    const checked=await db.rpc('checkpoint_recovery_object',{p_actor:session.userId,p_id:row.id,p_source_id:next.source_id});if(checked.error||checked.data!==true)return failure();
    return reply({pending:true,id:row.id,completed:completed.size+1,total:files.length});
   }
   const restored=await db.rpc('restore_recovery_import',{p_actor:session.userId,p_id:row.id,p_mapping:mapping});if(restored.error||!restored.data)return failure();return reply({result:restored.data});
  }
  return failure();
 }catch{return failure();}
}
