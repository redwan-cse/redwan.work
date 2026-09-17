'use client';
import { useRef,useState,useTransition } from 'react';
import {useRouter} from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clientReplyAction } from '@/lib/crm/client-actions';
import { TicketAttachments,type TicketAttachment } from '@/components/ticket-attachments';
export function ReplyForm({ticketId,latestHref}:{ticketId:string;latestHref?:string}) {
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [error,setError]=useState<string|null>(null);
  const [pending,startTransition]=useTransition();
  const [uploading,setUploading]=useState(false);
  const [files,setFiles]=useState<TicketAttachment[]>([]);
  return <form ref={formRef} className="space-y-3" onSubmit={e=>{e.preventDefault();if(pending||uploading)return;const data=new FormData(e.currentTarget);setError(null);startTransition(async()=>{try{const state=await clientReplyAction(ticketId,{},data);if(state.error){setError(state.error);return;}formRef.current?.reset();if(latestHref)router.replace(latestHref+'#conversation');router.refresh();}catch{setError('Reply could not be sent. Please try again.');}});}}>
    <div className="space-y-1.5"><Label htmlFor="reply-body">Reply</Label><Textarea id="reply-body" name="body" rows={5} maxLength={10000} required disabled={pending} placeholder="Write a reply..."/></div>
    <TicketAttachments ticketId={ticketId} entries={files} onChange={setFiles} disabled={pending} onBusy={setUploading}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" size="sm" disabled={pending||uploading}>{pending?'Sending...':'Send reply'}</Button>
  </form>;
}
