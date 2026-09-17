import Link from 'next/link';
import {notFound} from 'next/navigation';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {validUuid} from '@/lib/crm/attachments';
import {MilestoneInvoiceButton} from '@/components/admin/milestone-invoice-button';
export const dynamic='force-dynamic';
export default async function ProjectInvoices({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string;milestones?:string}>}) {
  if(!await workflowSession('admin'))notFound();
  const {id}=await params;if(!validUuid(id))notFound();const search=await searchParams;const page=workflowPage(search.page);const mp=workflowPage(search.milestones);
  const admin=getSupabaseAdmin();
  const {data:project,error}=await admin.from('projects').select('id,name,status,archived_at').eq('id',id).maybeSingle();
  if(error)throw new Error('Could not load project.');if(!project)notFound();
  const [invoices,milestones]=await Promise.all([
    admin.from('invoices').select('id,number,currency,status,created_at',{count:'exact'}).eq('project_id',id).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1),
    admin.from('milestones').select('id,title,amount_cents,currency,status',{count:'exact'}).eq('project_id',id).order('position').order('id').range((mp-1)*20,mp*20-1),
  ]);
  if(invoices.error||milestones.error)throw new Error('Could not load project billing.');
  const active=project.status==='active'&&!project.archived_at;
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">Invoices for {project.name}</h1>{active&&<Link className="inline-block rounded-md border px-4 py-2 underline" href={`/admin/projects/${id}/invoices/new`}>Create project invoice</Link>}{!invoices.data?.length?<p>No invoices on this page.</p>:<ul className="space-y-2">{invoices.data.map(invoice=><li key={invoice.id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"><Link className="underline" href={`/admin/invoices/${invoice.id}`}>INV-{invoice.number}</Link><span>{invoice.status} | {invoice.currency}</span></li>)}</ul>}<nav aria-label="Invoice pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}&milestones=${mp}`}>Previous invoices</Link>}{(invoices.count??0)>page*20&&<Link href={`?page=${page+1}&milestones=${mp}`}>Next invoices</Link>}</nav><h2 className="text-lg font-semibold">Invoice a milestone</h2><p className="text-sm text-muted-foreground">Creates one editable draft per milestone using its current title, amount and currency. Repeated clicks open the same invoice. No email is sent until you explicitly send the invoice.</p>{!milestones.data?.length?<p>No milestones on this page.</p>:<ul className="space-y-3">{milestones.data.map(m=><li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="break-words">{m.title} | {(m.amount_cents/100).toFixed(2)} {m.currency}</span>{active&&m.amount_cents>0?<MilestoneInvoiceButton milestoneId={m.id}/>:<span className="text-xs text-muted-foreground">Requires an active project and positive milestone amount.</span>}</li>)}</ul>}<nav aria-label="Billing milestone pages" className="flex gap-4">{mp>1&&<Link href={`?page=${page}&milestones=${mp-1}`}>Previous milestones</Link>}{(milestones.count??0)>mp*20&&<Link href={`?page=${page}&milestones=${mp+1}`}>Next milestones</Link>}</nav></section>;
}
