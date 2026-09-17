import Link from 'next/link';
import {notFound} from 'next/navigation';
import {validUuid} from '@/lib/crm/attachments';
import {workflowSession} from '@/lib/crm/workflow-access';
export default async function ProjectLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}) {
  const session=await workflowSession('admin');
  const {id}=await params;
  if(!session||!validUuid(id))notFound();
  return <div className="space-y-5"><nav aria-label="Project sections" className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/admin/projects/${id}`}>Project overview</Link><Link className="underline" href={`/admin/projects/${id}/invoices`}>Project invoices</Link></nav>{children}</div>;
}
