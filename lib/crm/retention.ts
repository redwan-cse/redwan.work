import 'server-only';
import {createHash,randomUUID} from 'crypto';
import * as archiverNS from 'archiver';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {ARCHIVE_MAX_BYTES,deletePrivateObjects,getPrivateObjectBytes,putPrivateObject} from '@/lib/r2';
import type {CrmResult} from '@/lib/crm/result';
type Snapshot={project:{id:string;archived_at:string|null;[key:string]:unknown};milestones:unknown[];files:Array<{id:string;r2_key:string;size_bytes:number;[key:string]:unknown}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function purgeArchivedProject(projectId:string):Promise<CrmResult> {
  if(!UUID.test(projectId))return {ok:false,error:'Project not found.'};
  const admin=getSupabaseAdmin();
  try {
    const existing=await admin.from('project_recovery').select('project_id').eq('project_id',projectId).maybeSingle();
    if(existing.error)return {ok:false,error:'Recovery tracking unavailable.'};
    if(existing.data)return {ok:true};
    const {data,error}=await admin.rpc('project_cleanup_snapshot',{p_project:projectId});
    if(error||!data)return {ok:false,error:'Project not found.'};
    const snapshot=data as Snapshot;
    if(!snapshot.project.archived_at)return {ok:false,error:'Project is not archived.'};
    const invoices=await admin.from('invoices').select('id',{count:'exact',head:true}).eq('project_id',projectId);
    if(invoices.error||invoices.count===null)return {ok:false,error:'Financial retention check unavailable.'};
    if(invoices.count)return {ok:false,error:'Project has retained invoices and cannot be purged.'};
    const manifest=Buffer.from(JSON.stringify(snapshot));
    let total=manifest.length;
    if(total>ARCHIVE_MAX_BYTES)return {ok:false,error:'Recovery backup exceeds 100 MB.'};
    const source=archiverNS as unknown as {ZipArchive?:new(opts:unknown)=>import('archiver').Archiver;default?:(format:string,opts:unknown)=>import('archiver').Archiver};
    const archive=source.ZipArchive?new source.ZipArchive({zlib:{level:6}}):source.default?source.default('zip',{zlib:{level:6}}):null;
    if(!archive)throw new Error('Archive unavailable');
    const chunks:Buffer[]=[];let compressed=0;
    const finished=new Promise<Buffer>((resolve,reject)=>{
      archive.on('data',(chunk:Buffer)=>{compressed+=chunk.length;if(compressed>ARCHIVE_MAX_BYTES){archive.abort();reject(new Error('Recovery too large'));}else chunks.push(chunk);});
      archive.on('error',reject);archive.on('end',()=>resolve(Buffer.concat(chunks)));
    });
    // Attach a handler immediately so a failed read does not leave a rejected promise unobserved.
    void finished.catch(()=>{});
    archive.append(manifest,{name:'recovery.json'});
    try {
      for(const file of snapshot.files) {
        if(!Number.isSafeInteger(Number(file.size_bytes))||Number(file.size_bytes)<1||total+Number(file.size_bytes)>ARCHIVE_MAX_BYTES)throw new Error('Recovery size invalid');
        const bytes=await getPrivateObjectBytes(file.r2_key);total+=bytes.length;
        if(bytes.length!==Number(file.size_bytes)||total>ARCHIVE_MAX_BYTES)throw new Error('Recovery byte mismatch');
        // Never trust customer filenames as ZIP paths. The manifest preserves display names.
        archive.append(bytes,{name:`files/${file.id}`});
      }
      await archive.finalize();
      const buffer=await finished;
      const digest=createHash('sha256').update(buffer).digest('hex');
      const recoveryKey=`archive/project_${projectId}/recovery_${randomUUID()}.zip`;
      await putPrivateObject(recoveryKey,buffer,'application/zip');
      const verified=await getPrivateObjectBytes(recoveryKey);
      if(verified.length!==buffer.length||createHash('sha256').update(verified).digest('hex')!==digest)throw new Error('Recovery verification failed');
      const prepared=await admin.rpc('prepare_project_cleanup',{p_project:projectId,p_expected:snapshot,p_recovery_key:recoveryKey,p_sha256:digest});
      if(prepared.error)return {ok:false,error:prepared.error.message==='Project has retained invoices'?'Project has retained invoices and cannot be purged.':'Project changed or cleanup was refused. Source files are preserved; retry after review.'};
      return {ok:true};
    } catch {archive.abort();throw new Error('Recovery preparation failed');}
  } catch {return {ok:false,error:'Could not verify recovery backup. Project and source files were not purged.'};}
}
export async function drainStorageDeletions(limit=100):Promise<{completed:number;failed:number}> {
  const admin=getSupabaseAdmin();
  const {data,error}=await admin.from('storage_deletions').select('r2_key').is('completed_at',null).order('created_at').order('r2_key').limit(Math.max(1,Math.min(100,limit)));
  if(error)throw new Error('Cleanup queue unavailable.');
  let completed=0,failed=0;
  for(const row of data??[]) {
    try {
      await deletePrivateObjects([row.r2_key]);
      const result=await admin.from('storage_deletions').update({completed_at:new Date().toISOString()}).eq('r2_key',row.r2_key).is('completed_at',null);
      if(result.error)throw new Error('Cleanup acknowledgement failed');
      completed++;
    } catch {failed++;}
  }
  return {completed,failed};
}
