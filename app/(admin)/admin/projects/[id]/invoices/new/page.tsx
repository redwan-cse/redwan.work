import {notFound} from 'next/navigation';
import {workflowSession} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {validUuid} from '@/lib/crm/attachments';
import {NewInvoiceForm} from '@/components/admin/invoice-forms';
export const dynamic='force-dynamic';
export default async function NewProjectInvoice({params}:{params:Promise<{id:string}>}) {
  if(!await workflowSession('admin'))notFound();
  const {id}=await params;if(!validUuid(id))notFound();
  const {data,error}=await getSupabaseAdmin().from('projects').select('id,name').eq('id',id).eq('status','active').is('archived_at',null).maybeSingle();
  if(error)throw new Error('Could not load project.');if(!data)notFound();
  return <section className="space-y-5"><h1 className="text-2xl font-semibold">New invoice for {data.name}</h1><NewInvoiceForm projects={[{id:data.id,name:data.name,client_name:null,client_email:''}]}/></section>;
}
