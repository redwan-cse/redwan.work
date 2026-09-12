'use client';
import { useRef,useState,useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { createTicketWithAttachmentsAction } from '@/lib/crm/client-actions';
import { TicketAttachments,type TicketAttachment } from '@/components/ticket-attachments';
export function NewTicketButton() {
  const [open,setOpen]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [pending,startTransition]=useTransition();
  const [files,setFiles]=useState<TicketAttachment[]>([]);
  const [uploading,setUploading]=useState(false);
  const requestId=useRef<string|null>(null);
  function changeOpen(next:boolean) {
    if(pending||uploading) return;
    if(next) { requestId.current=crypto.randomUUID();setFiles([]);setError(null); }
    setOpen(next);
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="size-3.5"/> New ticket</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
      <DialogHeader><DialogTitle>New support ticket</DialogTitle><DialogDescription>Describe what you need help with.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();if(pending||uploading)return;const data=new FormData(e.currentTarget);setError(null);startTransition(async()=>{const state=await createTicketWithAttachmentsAction(String(data.get('subject')??''),String(data.get('body')??''),files,requestId.current??undefined);if(state.error)setError(state.error);});}}>
        <div className="space-y-1.5"><Label htmlFor="ticket-subject">Subject</Label><Input id="ticket-subject" name="subject" maxLength={200} required disabled={pending} placeholder="Brief summary"/></div>
        <div className="space-y-1.5"><Label htmlFor="ticket-body">Message</Label><Textarea id="ticket-body" name="body" rows={5} maxLength={10000} required disabled={pending} placeholder="Add details..."/></div>
        <TicketAttachments ticketId={null} entries={files} onChange={setFiles} disabled={pending} onBusy={setUploading}/>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={pending||uploading} onClick={()=>changeOpen(false)}>Cancel</Button><Button type="submit" disabled={pending||uploading}>{pending?'Creating...':'Create ticket'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
