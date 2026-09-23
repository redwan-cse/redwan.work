'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import {Label} from '@/components/ui/label';
type Backup={file_id?:string;project_id?:string;name:string;created_at:string};
type Catalog={files:Backup[];projects:Backup[];hasNext:boolean};
type Preview={id:string;kind:string;name:string;files:number;notice:string;completed?:number};
type Result={projectId:string|null;fileIds:string[]};
type ImportStatus=
 | {id:string;state:'ready';expiresAt:string;completed:number}&Preview
 | {id:string;state:'completed';expiresAt:string;result:Result}
 | {id:string;state:'uploading'|'expired';expiresAt:string};
const IMPORT_KEY='recovery-import-id';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function call(action:string,fields:Record<string,unknown>){const response=await fetch('/api/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields}),cache:'no-store'});const value=await response.json();if(!response.ok)throw new Error(value.error||'Recovery request failed.');return value;}
async function inspectImport(id:string,signal?:AbortSignal):Promise<ImportStatus>{
 if(!UUID.test(id))throw new Error('Enter a valid import ID.');
 const response=await fetch(`/api/recovery?importId=${encodeURIComponent(id)}`,{cache:'no-store',signal});
 const value=await response.json();
 if(!response.ok)throw new Error(value.error||'Saved import unavailable. Sign in as the administrator who opened it.');
 if(value.id!==id||!['ready','completed','uploading','expired'].includes(value.state))throw new Error('Unexpected saved import response.');
 return value as ImportStatus;
}
export default function RecoveryPage(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(true),[preview,setPreview]=useState<Preview|null>(null),[selected,setSelected]=useState<File|null>(null),[confirm,setConfirm]=useState(false),[projectLink,setProjectLink]=useState<string|null>(null);
 const [importId,setImportId]=useState(''),[uploadingId,setUploadingId]=useState<string|null>(null),[persistenceWarning,setPersistenceWarning]=useState('');
 const lock=useRef(true),input=useRef<HTMLInputElement>(null);
 const showResult=useCallback((result:Result)=>{
  setPreview(null);setConfirm(false);setUploadingId(null);setSelected(null);
  setProjectLink(typeof result.projectId==='string'&&UUID.test(result.projectId)?`/admin/projects/${result.projectId}`:null);
  setStatus('Restore completed. Existing data was not overwritten; the backup remains retained. This saved result does not run the restore again.');
  if(input.current)input.current.value='';
 },[]);
 const showImport=useCallback((saved:ImportStatus)=>{
  setImportId(saved.id);setPreview(null);setConfirm(false);setUploadingId(null);setProjectLink(null);
  if(saved.state==='completed'){showResult(saved.result);return;}
  if(saved.state==='expired'){setStatus('This unfinished import expired after 24 hours. Its staged data remains retained. Upload the original backup as a new import to start again.');return;}
  if(saved.state==='uploading'){setUploadingId(saved.id);setStatus('This import has not completed preview. If its upload finished, check that same uploaded ZIP. Otherwise select the backup and start a new upload.');return;}
  setPreview(saved);setStatus(`Saved import loaded: ${saved.completed} of ${saved.files} files checkpointed. Review and confirm to resume. Expires ${new Date(saved.expiresAt).toLocaleString()}.`);
 },[showResult]);
 function rememberImport(id:string){
  if(!UUID.test(id))throw new Error('Unexpected import ID.');
  setImportId(id);
  try{window.sessionStorage.setItem(IMPORT_KEY,id);setPersistenceWarning('');}
  catch{setPersistenceWarning('This browser cannot save the import ID. Copy the ID below before leaving so you can load it manually.');}
 }
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  void (async()=>{
   try{
    const saved=window.sessionStorage.getItem(IMPORT_KEY);
    if(saved){if(!UUID.test(saved))throw new Error('Saved import ID is invalid. Enter an import ID manually or forget this browser reference.');setImportId(saved);const value=await inspectImport(saved,controller.signal);if(active)showImport(value);}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load the saved import.');}
   finally{if(active){lock.current=false;setBusy(false);}}
  })();
  return()=>{active=false;controller.abort();};
 },[showImport]);
 useEffect(()=>{const controller=new AbortController();setCatalog(null);fetch(`/api/recovery?page=${page}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error||'Backup listing unavailable.');setCatalog(v);}).catch(e=>{if(e.name!=='AbortError')setError('Backup listing unavailable. Check admin access and refresh.');});return()=>controller.abort();},[page]);
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Recovery request failed.');}finally{lock.current=false;setBusy(false);}}
 async function loadSaved(){await run(async()=>{setPreview(null);setConfirm(false);setProjectLink(null);setUploadingId(null);const id=importId.trim();const saved=await inspectImport(id);rememberImport(id);showImport(saved);});}
 async function checkUploaded(){await run(async()=>{if(!uploadingId)return;await call('preview',{id:uploadingId});showImport(await inspectImport(uploadingId));});}
 function forgetImport(){
  if(lock.current)return;
  try{window.sessionStorage.removeItem(IMPORT_KEY);}catch{setError('Could not clear this browser reference. No server data was changed.');return;}
  setImportId('');setUploadingId(null);setPreview(null);setConfirm(false);setProjectLink(null);setPersistenceWarning('');setStatus('Browser reference forgotten. The server import and staged data remain retained; use its ID to load it again.');
 }
 async function upload(){await run(async()=>{if(!selected||selected.size<22||selected.size>100*1024*1024)throw new Error('Choose a registered backup ZIP up to 100 MB.');setPreview(null);setConfirm(false);setProjectLink(null);setUploadingId(null);setStatus('Preparing private upload...');const prepared=await call('upload',{size:selected.size});rememberImport(prepared.id);setUploadingId(prepared.id);setStatus('Uploading directly to private storage...');const put=await fetch(prepared.url,{method:'PUT',headers:{'Content-Type':'application/zip'},body:selected});if(!put.ok)throw new Error('Upload failed or expired. Choose the file and retry; no restore was performed.');setStatus('Validating and sealing backup bytes...');await call('preview',{id:prepared.id});showImport(await inspectImport(prepared.id));});}
 async function restore(){await run(async()=>{if(!preview||!confirm)return;const current=preview;setStatus('Restoring and verifying files...');let restored;for(let attempt=0;attempt<=current.files+1;attempt++){restored=await call('restore',{id:current.id});if(!restored.pending)break;if(restored.id!==current.id||!Number.isSafeInteger(restored.completed)||restored.completed<1||restored.completed>current.files)throw new Error('Unexpected restore checkpoint. No backup was discarded.');setStatus(`Verified ${restored.completed} of ${current.files} files. If interrupted, reload or load this same import ID to resume.`);}if(!restored?.result)throw new Error('Restore is not complete. Load this same import and confirm again to resume; staged objects remain tracked.');showResult(restored.result);});}
 async function download(item:Backup,kind:string){await run(async()=>{const response=await fetch(`/api/recovery?kind=${kind}&id=${item.file_id??item.project_id}`,{cache:'no-store'});const value=await response.json();if(!response.ok)throw new Error(value.error||'Backup unavailable.');const link=document.createElement('a');link.href=value.url;link.rel='noreferrer';link.referrerPolicy='no-referrer';link.download='recovery.zip';document.body.appendChild(link);link.click();link.remove();setStatus('Direct download started. The private link expires shortly.');});}
 return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6"><div><h1 className="text-2xl font-semibold">Backup recovery</h1><p className="mt-2 text-sm text-muted-foreground">Private backups are retained without automatic expiry. Download a backup, then upload the same unmodified ZIP if you need to restore it.</p><Link href="/admin/projects" className="text-sm underline">Back to projects</Link></div>
 {error&&<p role="alert" className="break-words text-sm text-destructive">{error}</p>}<p role="status" aria-live="polite" className="text-sm">{status}</p>
 <Card><CardHeader><CardTitle>Resume a saved import</CardTitle></CardHeader><CardContent className="space-y-3">
 <p className="text-sm">This tab remembers only the import ID, not backup data or download links. Sign in as the same administrator to load it. Copy the ID to resume in a different tab or after closing this one.</p>
 <Label htmlFor="recovery-import-id">Import ID</Label><input id="recovery-import-id" value={importId} disabled={busy} autoComplete="off" spellCheck={false} className="block w-full rounded border bg-background p-2 font-mono text-sm" onChange={e=>{setImportId(e.target.value);setPreview(null);setConfirm(false);setUploadingId(null);setProjectLink(null);}}/>
 {persistenceWarning&&<p role="alert" className="text-sm">{persistenceWarning}</p>}
 <div className="flex flex-wrap gap-2"><Button disabled={busy||!importId.trim()} onClick={loadSaved}>Load saved import</Button><Button variant="outline" disabled={busy} onClick={forgetImport}>Forget browser reference</Button>{uploadingId&&<Button variant="outline" disabled={busy} onClick={checkUploaded}>Check uploaded ZIP</Button>}</div>
 </CardContent></Card>
 <Card><CardHeader><CardTitle>Restore a local backup</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm">Only registered individual-file and purged-project backups are supported. Project restores create a new project for its existing client; individual restores require the original parent. No accounts or invoice history are recreated.</p><Label htmlFor="recovery-file">Backup ZIP (maximum 100 MB)</Label><input ref={input} id="recovery-file" type="file" accept=".zip,application/zip" disabled={busy} className="block w-full max-w-full text-sm" onChange={e=>{setSelected(e.target.files?.[0]??null);setPreview(null);setConfirm(false);}}/><Button onClick={upload} disabled={busy||!selected}>{busy?'Working...':'Upload and preview'}</Button>
 {preview&&<section aria-label="Restore preview" className="space-y-3 rounded border p-4"><h2 className="break-words font-semibold">{preview.name}</h2><p>{preview.kind==='project'?'Project':'Individual file'} backup: {preview.files} file(s), {preview.completed??0} checkpointed</p><p className="text-sm">{preview.notice}</p><label className="flex items-start gap-2"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/><span className="text-sm">I confirm restoring this backup with new file identifiers and storage keys.</span></label><div className="flex flex-wrap gap-2"><Button onClick={restore} disabled={busy||!confirm}>Resume restore</Button><Button variant="outline" disabled={busy} onClick={()=>{setPreview(null);setConfirm(false);setStatus('Preview closed. The saved import remains available by ID; no server data was deleted.');}}>Close preview</Button></div></section>}
 {projectLink&&<Link className="block underline" href={projectLink}>Open restored project</Link>}</CardContent></Card>
 <Card><CardHeader><CardTitle>Retained backups</CardTitle></CardHeader><CardContent className="space-y-4">{!catalog?<p>Loading backups...</p>:<>{catalog.files.length+catalog.projects.length===0&&<p>No registered backups on this page.</p>}{(['individual','project'] as const).map(kind=><section key={kind}><h2 className="mb-2 font-semibold">{kind==='individual'?'Individual files':'Purged projects'}</h2><ul className="space-y-2">{(kind==='individual'?catalog.files:catalog.projects).map(item=><li key={item.file_id??item.project_id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div className="min-w-0"><p className="break-words">{item.name||'Recovery backup'}</p><time className="text-xs text-muted-foreground" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></div><Button variant="outline" disabled={busy} onClick={()=>download(item,kind)}>Download backup</Button></li>)}</ul></section>)}<div className="flex items-center gap-3"><Button variant="outline" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={busy||!catalog.hasNext} onClick={()=>setPage(p=>p+1)}>Next</Button></div></>}</CardContent></Card></main>;
}
