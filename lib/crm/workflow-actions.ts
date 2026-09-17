'use server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { workflowSession } from '@/lib/crm/workflow-access';
import { validUuid } from '@/lib/crm/attachments';
export async function editClientProfileAction(clientId:string,input:{full_name:string;company:string}):Promise<{error?:string;notice?:string}> {
  const session=await workflowSession();
  if(!session) return {error:'Unauthorized.'};
  if(!validUuid(clientId)||(session.role==='client'&&clientId!==session.userId)) return {error:'Client not found.'};
  if(!input||typeof input.full_name!=='string'||typeof input.company!=='string'||input.full_name.trim().length>200||input.company.trim().length>200) return {error:'Name and company must each be at most 200 characters.'};
  const {data,error}=await getSupabaseAdmin().from('profiles').update({full_name:input.full_name.trim()||null,company:input.company.trim()||null}).eq('id',clientId).eq('role','client').select('id').maybeSingle();
  if(error||!data) return {error:'Profile could not be updated.'};
  revalidatePath('/admin/clients');revalidatePath('/portal/profile');revalidatePath('/portal');
  return {notice:'Profile updated.'};
}
export async function invoiceMilestoneAction(milestoneId:string):Promise<{error?:string;invoiceId?:string}> {
  const session=await workflowSession('admin');
  if(!session) return {error:'Unauthorized.'};
  if(!validUuid(milestoneId)) return {error:'Milestone not found.'};
  const {data,error}=await getSupabaseAdmin().rpc('invoice_milestone_atomic',{p_actor:session.userId,p_milestone:milestoneId});
  if(error||typeof data!=='string') return {error:'Could not create draft. Check that the project is active and the milestone amount is positive.'};
  revalidatePath('/admin/invoices');revalidatePath('/admin/projects');
  return {invoiceId:data};
}
