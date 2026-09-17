import 'server-only';
import {createHash,randomUUID} from 'crypto';
import * as archiverNS from 'archiver';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {ARCHIVE_MAX_BYTES,getPrivateObjectBytes,putPrivateObject} from '@/lib/r2';
type Snapshot={project:{id:string;archived_at:string|null};milestones:unknown[];files:Array<{id:string;r2_key:string;filename:string;size_bytes:number}>};
export async function archiveProject(projectId:string):Promise<{ok:true;archiveKey:string}|{ok:false;error:string}>{
 let archive:import('archiver').Archiver|undefined;
 try{
  if(!/^[0-9a-f-]{36}$/.test(projectId))return {ok:false,error:'Project not found.'};
  const admin=getSupabaseAdmin();const {data,error}=await admin.rpc('project_cleanup_snapshot',{p_project:projectId});
  if(error||!data)return {ok:false,error:'Project lookup failed.'};
  const snapshot=data as Snapshot;
  if(snapshot.project.archived_at)return {ok:false,error:'Project already archived.'};
  if(snapshot.project.id!==projectId||!Array.isArray(snapshot.files)||!Array.isArray(snapshot.milestones))throw new Error();
  const manifests=[['project.json',snapshot.project],['milestones.json',snapshot.milestones],['files.json',snapshot.files],['recovery.json',snapshot]] as const;
  let bytesTotal=manifests.reduce((sum,[,value])=>sum+Buffer.byteLength(JSON.stringify(value)),0);
  if(bytesTotal>ARCHIVE_MAX_BYTES)return {ok:false,error:'Project exceeds the 100 MB archive limit.'};
  const source=archiverNS as unknown as {ZipArchive?:new(opts:unknown)=>import('archiver').Archiver;default?:(type:string,opts:unknown)=>import('archiver').Archiver};
  archive=source.ZipArchive?new source.ZipArchive({zlib:{level:6}}):source.default?.('zip',{zlib:{level:6}});
  if(!archive)throw new Error();
  const chunks:Buffer[]=[];let compressed=0;
  const finished=new Promise<Buffer>((resolve,reject)=>{archive!.on('data',(chunk:Buffer)=>{compressed+=chunk.length;if(compressed>ARCHIVE_MAX_BYTES){archive!.abort();reject(new Error('Archive limit'));}else chunks.push(chunk);});archive!.on('error',reject);archive!.on('end',()=>resolve(Buffer.concat(chunks)));});
  void finished.catch(()=>{});
  for(const [name,value] of manifests)archive.append(JSON.stringify(value),{name});
  for(const file of snapshot.files){
   if(!/^[0-9a-f-]{36}$/.test(file.id)||!Number.isSafeInteger(Number(file.size_bytes))||Number(file.size_bytes)<0||bytesTotal+Number(file.size_bytes)>ARCHIVE_MAX_BYTES)throw new Error();
   const bytes=await getPrivateObjectBytes(file.r2_key);bytesTotal+=bytes.length;
   if(bytes.length!==Number(file.size_bytes)||bytesTotal>ARCHIVE_MAX_BYTES)throw new Error();
   // Display filenames remain in the manifest; ZIP paths use safe immutable IDs.
   archive.append(bytes,{name:`files/${file.id}`});
  }
  await archive.finalize();const buffer=await finished;
  const key=`archive/project_${projectId}/verified_${randomUUID()}.zip`;
  await putPrivateObject(key,buffer,'application/zip');
  const readBack=await getPrivateObjectBytes(key);
  if(buffer.length!==readBack.length||createHash('sha256').update(buffer).digest('hex')!==createHash('sha256').update(readBack).digest('hex'))throw new Error();
  const marked=await admin.rpc('mark_project_archived',{p_project:projectId,p_expected:snapshot,p_key:key});
  if(marked.error)return {ok:false,error:'Project changed during archive. Source data is preserved; retry after review.'};
  return {ok:true,archiveKey:key};
 }catch{archive?.abort();return {ok:false,error:'Archive verification failed. Project and source files are preserved.'};}
}
