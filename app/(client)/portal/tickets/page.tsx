import Link from 'next/link';
import {redirect} from 'next/navigation';
import {Badge} from '@/components/ui/badge';
import {NewTicketButton} from '@/components/portal/new-ticket-button';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export default async function PortalTicketsPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const session=await workflowSession('client');if(!session)redirect('/login?next=/portal/tickets');
 const page=workflowPage((await searchParams).page);
 const {data,error,count}=await getSupabaseAdmin().from('tickets').select('id,number,subject,status,last_message_at',{count:'exact'}).eq('client_id',session.userId).order('last_message_at',{ascending:false}).order('id').range((page-1)*25,page*25-1);
 if(error)throw new Error('Could not load tickets.');
 return <section className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Tickets</h1><NewTicketButton/></header>{!data?.length?<p>No tickets on this page.</p>:<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Ref</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Last activity</th></tr></thead><tbody>{data.map(ticket=><tr key={ticket.id} className="border-t"><td className="p-3">TKT-{ticket.number}</td><td className="p-3"><Link className="underline" href={`/portal/tickets/${ticket.id}`}>{ticket.subject}</Link></td><td className="p-3"><Badge variant="outline">{String(ticket.status).replaceAll('_',' ')}</Badge></td><td className="whitespace-nowrap p-3">{new Date(ticket.last_message_at).toISOString().slice(0,16).replace('T',' ')} UTC</td></tr>)}</tbody></table></div>}<nav aria-label="Ticket pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{(count??0)>page*25&&<Link href={`?page=${page+1}`}>Next</Link>}</nav></section>;
}
