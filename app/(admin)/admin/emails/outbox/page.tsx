import Link from 'next/link';
import {notFound} from 'next/navigation';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export default async function EmailOutboxPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 if(!await workflowSession('admin'))notFound();
 const page=workflowPage((await searchParams).page);
 const {data,error,count}=await getSupabaseAdmin().from('email_outbox').select('id,template,state,attempts,error_code,created_at,updated_at',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25-1);
 if(error)throw new Error('Could not load email queue.');
 return <section className="space-y-5"><h1 className="text-2xl font-semibold">Durable email queue</h1><p className="text-sm text-muted-foreground">Accepted means the provider acknowledged the message, not inbox delivery. Failed or exhausted events need investigation; do not recreate them blindly. Inactive recipients are suppressed.</p>{!data?.length?<p>No events on this page.</p>:<div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Event</th><th className="p-3">State</th><th className="p-3">Attempts</th><th className="p-3">Diagnostic</th><th className="p-3">Created</th></tr></thead><tbody>{data.map(row=><tr key={row.id} className="border-t"><td className="p-3">{row.template}</td><td className="p-3">{row.state}</td><td className="p-3">{row.attempts}</td><td className="p-3">{row.error_code??'None'}</td><td className="whitespace-nowrap p-3">{new Date(row.created_at).toISOString().slice(0,16).replace('T',' ')} UTC</td></tr>)}</tbody></table></div>}<nav aria-label="Email queue pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{(count??0)>page*25&&<Link href={`?page=${page+1}`}>Next</Link>}</nav></section>;
}
