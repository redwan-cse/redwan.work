import 'server-only';
import {createHash} from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {readRecoveryBytes,writeRestoredObject} from '@/lib/crm/recovery-storage';
export type FrozenUpload={sourceKey:string;key:string;sha256:string;size:number};
const PREFIX='private/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})/';
const EXT='\\.(?:pdf|docx|doc|xlsx|png|jpg|zip)';
const SOURCE=new RegExp('^'+PREFIX+'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'+EXT+'$');
const FINAL=new RegExp('^'+PREFIX+'[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'+EXT+'$');
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function isImmutableUploadKey(key:unknown):boolean{return typeof key==='string'&&FINAL.test(key);}
export function immutableUploadKey(source:string):string{
 if(typeof source!=='string'||!SOURCE.test(source)||FINAL.test(source))throw new Error('Upload finalization refused.');
 const h=digest('immutable-upload-v1:'+source),id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
 return source.slice(0,source.lastIndexOf('/')+1)+id+source.slice(source.lastIndexOf('.'));
}
async function proof(key:string){const r=await getSupabaseAdmin().from('immutable_uploads').select('source_key,r2_key,sha256,size_bytes').eq('r2_key',key).maybeSingle();if(r.error)throw new Error('Upload proof unavailable.');return r.data;}
export async function verifyImmutableUpload(key:string,size:number):Promise<void>{
 if(!isImmutableUploadKey(key)||!Number.isSafeInteger(size)||size<1||size>10485760)throw new Error('Legacy file deletion is held pending upload safety review.');
 const p=await proof(key);if(!p||Number(p.size_bytes)!==size||typeof p.sha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sha256))throw new Error('Upload proof unavailable.');
 const b=await readRecoveryBytes(key,size);if(b.length!==size||digest(b)!==p.sha256)throw new Error('Finalized upload changed.');
}
/** The original browser-writable object is retained, never deleted here.
 * Final keys are reserved from every application presigned PUT path. The first
 * successful conditional write fixes the bytes; repeated confirmations verify
 * that frozen copy rather than trusting a later staging overwrite.
 */
export async function finalizeUpload(source:string,size:number,mime:string):Promise<FrozenUpload>{
 const key=immutableUploadKey(source);
 if(!Number.isSafeInteger(size)||size<1||size>10485760||typeof mime!=='string'||!mime||mime.length>128)throw new Error('Upload finalization refused.');
 const existing=await proof(key);
 if(existing){if(existing.source_key!==source||Number(existing.size_bytes)!==size)throw new Error('Upload finalization conflict.');await verifyImmutableUpload(key,size);return {sourceKey:source,key,sha256:existing.sha256,size};}
 const bytes=await readRecoveryBytes(source,size);if(bytes.length!==size)throw new Error('Upload size changed.');
 await writeRestoredObject(key,bytes,mime);
 const hash=digest(bytes),readback=await readRecoveryBytes(key,size);if(readback.length!==size||digest(readback)!==hash)throw new Error('Upload verification failed.');
 const r=await getSupabaseAdmin().rpc('register_immutable_upload',{p_source:source,p_key:key,p_sha256:hash,p_size:size});if(r.error||r.data!==true)throw new Error('Upload proof unavailable.');
 return {sourceKey:source,key,sha256:hash,size};
}
