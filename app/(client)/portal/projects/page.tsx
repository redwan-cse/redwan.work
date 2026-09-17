import Link from 'next/link';
import {redirect} from 'next/navigation';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export default async function ProjectsPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const session=await workflowSession('client');
  if(!session) redirect('/login?next=/portal/projects');
  const page=workflowPage((await searchParams).page);
  const {data,error,count}=await getSupabaseAdmin().from('projects').select('id,name,status,due_at',{count:'exact'}).eq('client_id',session.userId).is('archived_at',null).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
  if(error) throw new Error('Could not load projects.');
  return <section className="space-y-5"><h1 className="text-2xl font-semibold">Your projects</h1>{!data?.length?<p>No projects on this page.</p>:<ul className="space-y-3">{data.map(project=><li key={project.id} className="rounded-lg border p-4"><Link className="break-words font-medium underline" href={`/portal/projects/${project.id}`}>{project.name}</Link><p className="text-sm text-muted-foreground">{project.status}{project.due_at?` | Due ${project.due_at}`:''}</p></li>)}</ul>}<nav aria-label="Project pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{(count??0)>page*20&&<Link href={`?page=${page+1}`}>Next</Link>}</nav></section>;
}
