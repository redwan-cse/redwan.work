import {redirect} from 'next/navigation';
import {workflowSession} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {ClientProfileForm} from '@/components/client-profile-form';
export const dynamic='force-dynamic';
export default async function ProfilePage() {
  const session=await workflowSession('client');
  if(!session) redirect('/login?next=/portal/profile');
  const {data,error}=await getSupabaseAdmin().from('profiles').select('id,full_name,company').eq('id',session.userId).eq('role','client').single();
  if(error||!data) throw new Error('Could not load profile.');
  return <section className="max-w-lg space-y-5"><h1 className="text-2xl font-semibold">Your profile</h1><p className="text-sm text-muted-foreground">Update your name and company. Email, role and account access are managed separately.</p><ClientProfileForm client={data}/><p className="text-xs text-muted-foreground">For account deletion or a data-retention request, contact support. Financial records are not deleted through this form.</p></section>;
}
