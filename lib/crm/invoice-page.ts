import 'server-only';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import type {InvoiceRow} from '@/lib/crm/invoices';
export async function invoicePage(role:'admin'|'client',pageInput:unknown,statusInput:unknown) {
 const session=await workflowSession(role);if(!session)throw new Error('Unauthorized.');
 const page=workflowPage(pageInput);
 const status=typeof statusInput==='string'&&['draft','sent','paid','void'].includes(statusInput)?statusInput:null;
 const {data,error}=await getSupabaseAdmin().rpc('invoice_page',{p_actor:session.userId,p_page:page,p_status:status});
 if(error||!data||!Array.isArray(data.items))throw new Error('Could not load invoices.');
 return {items:data.items as InvoiceRow[],total:Number(data.total),page,status};
}
