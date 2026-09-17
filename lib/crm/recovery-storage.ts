import 'server-only';
import {GetObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
const MAX=100*1024*1024;
function client(){
 const endpoint=process.env.R2_ENDPOINT,accessKeyId=process.env.R2_PRIVATE_ACCESS_KEY_ID,secretAccessKey=process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
 if(!endpoint||!accessKeyId||!secretAccessKey||!process.env.R2_PRIVATE_BUCKET)throw new Error('Recovery storage unavailable.');
 return new S3Client({region:'auto',endpoint,credentials:{accessKeyId,secretAccessKey}});
}
function valid(key:string){return typeof key==='string'&&!key.includes('..')&&!key.includes('\\')&&(/^(archive\/project_[0-9a-f-]{36}\/[a-z]+_[0-9a-f-]{36}\.zip)$/.test(key)||/^private\/[0-9a-f-]{36}\/(pending|ticket_[0-9a-f-]{36}|project_[0-9a-f-]{36})\/[0-9a-f-]{36}\.(pdf|docx|doc|xlsx|png|jpg|zip)$/.test(key));}
export async function readRecoveryBytes(key:string,maxBytes=MAX):Promise<Buffer>{
 if(!valid(key)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX)throw new Error('Recovery storage unavailable.');
 const s3=client(),controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
 try{
  const r=await s3.send(new GetObjectCommand({Bucket:process.env.R2_PRIVATE_BUCKET,Key:key}),{abortSignal:controller.signal});
  if(r.ContentLength===undefined||r.ContentLength<1||r.ContentLength>maxBytes||!r.Body)throw new Error('Recovery size invalid.');
  const chunks:Buffer[]=[];let size=0;
  const body=r.Body as AsyncIterable<Uint8Array>;
  for await(const chunk of body){size+=chunk.length;if(size>maxBytes){controller.abort();throw new Error('Recovery size invalid.');}chunks.push(Buffer.from(chunk));}
  if(size!==r.ContentLength)throw new Error('Recovery size invalid.');
  return Buffer.concat(chunks);
 }finally{clearTimeout(timer);controller.abort();s3.destroy();}
}
export async function writeRecoveryBytes(key:string,bytes:Buffer):Promise<void>{
 if(!/^archive\/project_[0-9a-f-]{36}\/(individual|import)_[0-9a-f-]{36}\.zip$/.test(key))throw new Error('Recovery storage unavailable.');
 await writeRestoredObject(key,bytes,'application/zip');
}
/** Conditional PUT cannot overwrite an existing key. Identical bytes can be
 * reused after an interrupted restore; different contents always conflict.
 */
export async function writeRestoredObject(key:string,bytes:Buffer,mime:string):Promise<void>{
 if(!valid(key)||!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX||typeof mime!=='string'||mime.length>128)throw new Error('Recovery storage unavailable.');
 const s3=client();
 try{
  await s3.send(new PutObjectCommand({Bucket:process.env.R2_PRIVATE_BUCKET,Key:key,Body:bytes,ContentType:mime,ContentLength:bytes.length,IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(30000)});
 }catch(error){
  if(!error||typeof error!=='object'||!('$metadata' in error)||(error.$metadata as {httpStatusCode?:number})?.httpStatusCode!==412)throw new Error('Recovery write failed.');
  const existing=await readRecoveryBytes(key,bytes.length);
  if(existing.length!==bytes.length||createHash('sha256').update(existing).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Recovery object conflict.');
 }finally{s3.destroy();}
}
