import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {validUuid} from '@/lib/crm/attachments';
export const dynamic='force-dynamic';
export default async function ProjectPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}) {
  const session=await workflowSession('client');
  if(!session) redirect('/login?next=/portal/projects');
  const {id}=await params;if(!validUuid(id))notFound();
  const admin=getSupabaseAdmin();
  const {data:project,error}=await admin.from('projects').select('id,name,description,status,due_at').eq('id',id).eq('client_id',session.userId).is('archived_at',null).maybeSingle();
  if(error)throw new Error('Could not load project.');if(!project)notFound();
  const page=workflowPage((await searchParams).page);
  const [milestones,total,done]=await Promise.all([
    admin.from('milestones').select('id,title,status,amount_cents,currency').eq('project_id',id).order('position').order('id').range((page-1)*25,page*25-1),
    admin.from('milestones').select('id',{count:'exact',head:true}).eq('project_id',id),
    admin.from('milestones').select('id',{count:'exact',head:true}).eq('project_id',id).eq('status','done'),
  ]);
  if(milestones.error||total.error||done.error)throw new Error('Could not load milestones.');
  const maximum=total.count??0;const completed=done.count??0;
  return <section className="space-y-5"><Link href="/portal/projects" className="underline">All projects</Link><h1 className="break-words text-2xl font-semibold">{project.name}</h1><p>{project.status}{project.due_at?` | Due ${project.due_at}`:''}</p>{project.description&&<p className="whitespace-pre-wrap break-words">{project.description}</p>}<div className="space-y-2"><p>{completed} of {maximum} milestones complete</p><progress className="w-full" aria-label="Milestone completion" max={maximum||1} value={completed}/></div><h2 className="text-lg font-semibold">Milestones</h2>{!maximum?<p>No milestones yet.</p>:<ul className="space-y-2">{milestones.data?.map(m=><li key={m.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3"><span className="break-words">{m.title}</span><span className="text-sm text-muted-foreground">{String(m.status).replaceAll('_',' ')} | {(m.amount_cents/100).toFixed(2)} {m.currency}</span></li>)}</ul>}<nav aria-label="Milestone pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{maximum>page*25&&<Link href={`?page=${page+1}`}>Next</Link>}</nav><Link href="/portal/files" className="inline-block underline">View project files</Link></section>;
}
