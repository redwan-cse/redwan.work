'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {deleteAssetAction} from '@/lib/crm/admin-actions';
import {prepareAssetUploadAction,confirmAssetUploadAction} from '@/lib/crm/public-asset-actions';
import {ASSET_ALLOWED,extFromFilename} from '@/lib/mime';
import {formatBytes} from '@/lib/format';
export function AssetUploader({accept,maxBytes}:{accept:string;maxBytes:number}) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);const [items,setItems]=useState<Array<{key:string;url:string}>>([]);const [copied,setCopied]=useState<string|null>(null);
 async function upload(file:File) {
  setError(null);setNotice(null);
  const mime=ASSET_ALLOWED[extFromFilename(file.name)]?.[0];
  if(!mime||file.size<1||file.size>maxBytes){setError(`Choose a supported file between 1 byte and ${formatBytes(maxBytes)}.`);return;}
  const metadata={filename:file.name,mime,size:file.size};setBusy(true);
  try {
   const prepared=await prepareAssetUploadAction(metadata);
   if(prepared.error||!prepared.key||!prepared.uploadUrl)throw new Error(prepared.error??'Could not prepare upload.');
   const response=await fetch(prepared.uploadUrl,{method:'PUT',body:file,headers:{'Content-Type':mime}});
   if(!response.ok)throw new Error('Direct upload failed. Check bucket CORS and retry.');
   const confirmed=await confirmAssetUploadAction(prepared.key,metadata);
   if(confirmed.error||!confirmed.url)throw new Error(confirmed.error??'Could not verify upload.');
   setItems(current=>[{key:prepared.key!,url:confirmed.url!},...current]);setNotice('Asset uploaded and verified.');
  }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);}
 }
 async function remove(key:string) {
  if(!window.confirm('Delete this public asset? Existing links may stop working, and cached copies may remain.'))return;
  setBusy(true);setError(null);try{const result=await deleteAssetAction(key);if(result.error)throw new Error(result.error);setItems(current=>current.filter(item=>item.key!==key));setNotice('Asset deleted from origin.');}catch{setError('Deletion failed. Please retry.');}finally{setBusy(false);}
 }
 return <div className="space-y-4"><div className="space-y-2"><Label htmlFor="asset-file">Upload public asset</Label><Input id="asset-file" type="file" accept={accept} disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/><p className="text-xs text-muted-foreground">Files upload directly to R2, then the server verifies their size and type. Maximum {formatBytes(maxBytes)}.</p>{busy&&<p role="status">Uploading or updating asset...</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&!error&&<p role="status" className="text-sm">{notice}</p>}</div><ul className="space-y-2">{items.map(item=><li key={item.key} className="flex flex-wrap items-center gap-2 rounded-md border p-3"><a className="min-w-0 flex-1 truncate underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a><Button type="button" size="sm" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(item.url);setCopied(item.url);}catch{setError('Copy failed. Select the URL manually.');}}}>{copied===item.url?'Copied':'Copy'}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void remove(item.key)}>Delete</Button></li>)}</ul></div>;
}
