'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { shareTicketFilesAction } from '@/lib/crm/ticket-upload-actions';
import { CONTACT_ALLOWED, extFromFilename } from '@/lib/mime';
import { formatBytes } from '@/lib/format';
export interface TicketAttachment { key:string; filename:string; mime:string; size_bytes:number; }
export function TicketAttachments({ ticketId, entries, onChange, disabled, onBusy }: { ticketId:string|null; entries:TicketAttachment[]; onChange:(entries:TicketAttachment[])=>void; disabled?:boolean; onBusy?:(busy:boolean)=>void }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [awaitingConfirmation,setAwaitingConfirmation]=useState<TicketAttachment[]>([]);
  async function confirm(files:TicketAttachment[]) {
    const result=await shareTicketFilesAction(ticketId!,files);
    if(result.error) throw new Error(result.error);
    setAwaitingConfirmation([]);
    onChange([...entries,...files.filter(file=>!entries.some(old=>old.key===file.key))]);
  }
  async function upload(selected:File[]) {
    if(!selected.length) return;
    setError(null);
    if(entries.length+selected.length>10) {setError('A ticket can have at most 10 attachments.');return;}
    const files=[];
    for(const file of selected) {
      const mime=CONTACT_ALLOWED[extFromFilename(file.name)]?.[0];
      if(!mime || file.size<1 || file.size>10*1024*1024) {setError('Choose supported files between 1 byte and 10 MB.');return;}
      files.push({filename:file.name,mime,size:file.size});
    }
    setBusy(true);onBusy?.(true);
    try {
      const res=await fetch('/api/uploads/ticket-presign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticketId,files})});
      const data=await res.json();
      if(!res.ok) throw new Error(typeof data.error==='string'?data.error:'Could not prepare uploads.');
      if(!Array.isArray(data.uploads)||data.uploads.length!==selected.length) throw new Error('Could not prepare uploads.');
      const uploaded:TicketAttachment[]=[];
      for(let i=0;i<selected.length;i++) {
        const item=data.uploads[i];
        if(typeof item.key!=='string'||typeof item.uploadUrl!=='string'||item.filename!==selected[i].name) throw new Error('Could not prepare uploads.');
        const put=await fetch(item.uploadUrl,{method:'PUT',body:selected[i],headers:{'Content-Type':files[i].mime}});
        if(!put.ok) throw new Error('File upload failed. Please try again.');
        uploaded.push({key:item.key,filename:files[i].filename,mime:files[i].mime,size_bytes:files[i].size});
      }
      if(ticketId) {
        setAwaitingConfirmation(uploaded);
        await confirm(uploaded);
      } else onChange([...entries,...uploaded]);
    } catch(e) {setError(e instanceof Error?e.message:'File upload failed.');}
    finally {setBusy(false);onBusy?.(false);}
  }
  async function retry() {
    setBusy(true);onBusy?.(true);setError(null);
    try {await confirm(awaitingConfirmation);} catch(e) {setError(e instanceof Error?e.message:'Could not confirm files.');}
    finally {setBusy(false);onBusy?.(false);}
  }
  const id=`attachments-${ticketId??'new'}`;
  return <div className="space-y-2">
    <Label htmlFor={id}>{ticketId?'Share files with this ticket':'Attachments (optional)'}</Label>
    <Input id={id} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.png,.jpg,.zip" disabled={disabled||busy||awaitingConfirmation.length>0} aria-describedby={`${id}-help`} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files);}}/>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{ticketId?'Files are shared as soon as upload is confirmed, separately from your reply.':'Files are shared only when the ticket is created. You can remove them before submitting.'} Up to 10 files per ticket, 10 MB each.</p>
    {busy&&<p role="status" className="text-sm text-muted-foreground">Uploading and checking files...</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {awaitingConfirmation.length>0&&!busy&&<Button type="button" variant="outline" onClick={()=>void retry()}>Retry confirmation</Button>}
    {entries.length>0&&<ul className="space-y-1">{entries.map(file=><li key={file.key} className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-2 py-2 text-xs"><span className="min-w-0 truncate">{file.filename} ({formatBytes(file.size_bytes)})</span>{ticketId?<span className="shrink-0 text-muted-foreground">Shared</span>:<Button type="button" variant="ghost" size="sm" disabled={disabled||busy} aria-label={`Remove ${file.filename}`} onClick={()=>onChange(entries.filter(old=>old.key!==file.key))}>Remove</Button>}</li>)}</ul>}
  </div>;
}
