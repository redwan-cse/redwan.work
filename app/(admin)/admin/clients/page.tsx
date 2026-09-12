import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Badge} from '@/components/ui/badge';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {InviteClientButton,ClientActiveButton} from '@/components/admin/client-actions';
import {ClientProfileForm} from '@/components/client-profile-form';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
export const dynamic='force-dynamic';
export default async function AdminClientsPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  if(!await workflowSession('admin'))notFound();
  const page=workflowPage((await searchParams).page);const admin=getSupabaseAdmin();
  const {data,error,count}=await admin.from('profiles').select('id,full_name,company,is_active,created_at',{count:'exact'}).eq('role','client').order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
  if(error)throw new Error('Could not load clients.');
  const clients=await Promise.all((data??[]).map(async client=>{const {data:user,error:authError}=await admin.auth.admin.getUserById(client.id);if(authError)throw new Error('Could not load client details.');return {...client,email:user?.user?.email??''};}));
  return <section className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Clients</h1><InviteClientButton/></div>{!clients.length?<p>No clients on this page.</p>:<div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{clients.map(client=><TableRow key={client.id}><TableCell className="font-medium">{client.full_name??'Not set'}</TableCell><TableCell>{client.company??'Not set'}</TableCell><TableCell>{client.email}</TableCell><TableCell><Badge variant="outline">{client.is_active?'Active':'Inactive'}</Badge></TableCell><TableCell><div className="space-y-2"><ClientActiveButton clientId={client.id} isActive={client.is_active}/><details><summary className="cursor-pointer underline">Edit profile</summary><div className="min-w-52 py-3"><ClientProfileForm client={client}/></div></details></div></TableCell></TableRow>)}</TableBody></Table></div>}<nav aria-label="Client pages" className="flex gap-4">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{(count??0)>page*20&&<Link href={`?page=${page+1}`}>Next</Link>}</nav><p className="text-xs text-muted-foreground">Editing does not change email, role or access. Deactivation and financial retention are separate operations; this page does not delete accounts or records.</p></section>;
}
