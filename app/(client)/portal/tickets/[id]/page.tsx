import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {Badge} from '@/components/ui/badge';
import {ReplyForm} from '@/components/portal/reply-form';
import {getCurrentSession} from '@/lib/auth/session';
import {getOwnTicketThread} from '@/lib/crm/tickets';
import {listTicketAttachmentRows} from '@/lib/crm/files';
import {formatBytes} from '@/lib/format';
import {ThreadNavigation,ThreadReadError} from '@/components/thread-navigation';
export const dynamic='force-dynamic';
const LABELS={open:'Open',answered:'Answered',awaiting_client:'Awaiting client',closed:'Closed'} as const;
const COLORS={open:'bg-blue-500/15 text-blue-600 dark:text-blue-400',answered:'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',awaiting_client:'bg-amber-500/15 text-amber-600 dark:text-amber-400',closed:'bg-muted text-muted-foreground'};
export default async function PortalTicketThreadPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{cursor?:string|string[]}>}){
 const {id}=await params;const {cursor}=await searchParams;const base=`/portal/tickets/${encodeURIComponent(id)}`;
 const session=await getCurrentSession();if(!session)redirect('/login');if(session.role!=='client')redirect('/admin');
 const result=await getOwnTicketThread(session.userId,id,cursor);
 if(!result.ok){if(result.kind==='not_found')notFound();return <ThreadReadError kind={result.kind} base={base} cursor={cursor}/>;}
 const {ticket,messages,pageInfo}=result;const attachments=await listTicketAttachmentRows(ticket.id);
 return <div className="space-y-6"><Link href="/portal/tickets" className="text-sm text-muted-foreground hover:underline">All tickets</Link>
 <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs text-muted-foreground">#TKT-{ticket.number}</p><h1 className="text-xl font-semibold">{ticket.subject}</h1></div><Badge className={COLORS[ticket.status]}>{LABELS[ticket.status]}</Badge></header>
 <ThreadNavigation base={base} pageInfo={pageInfo}/>
 <section id="conversation" tabIndex={-1} aria-label="Conversation" className="space-y-3">{messages.length===0&&<p>No messages on this page. Use Latest messages to refresh the conversation.</p>}{messages.map(message=><article key={message.id} data-message-id={message.id} className="rounded-lg border p-4"><div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-xs"><span className="font-medium">{message.author_role==='client'?'You':message.author_name??'Support'}</span><time dateTime={message.created_at} className="text-muted-foreground">{new Date(message.created_at).toISOString().slice(0,16).replace('T',' ')} UTC</time></div><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p></article>)}</section>
 {attachments.length>0&&<section aria-label="Attachments" className="space-y-2"><h2 className="text-sm font-semibold">Attachments</h2><ul className="space-y-2">{attachments.map(file=><li key={file.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{file.filename} <span className="text-muted-foreground">({formatBytes(file.size_bytes)})</span></span><a href={`/api/files/${file.id}/download`} className="ml-3 inline-flex h-7 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent">Download</a></li>)}</ul></section>}
 {ticket.status==='closed'&&<p className="text-sm text-muted-foreground">This ticket is closed. Replying will reopen it.</p>}
 <ReplyForm ticketId={ticket.id} latestHref={base}/></div>;
}
