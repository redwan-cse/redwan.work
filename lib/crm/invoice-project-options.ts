import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {workflowSession,workflowPage} from '@/lib/crm/workflow-access';
export interface InvoiceProjectOption{id:string;name:string;client_name:string|null;client_email:string;}
export async function invoiceProjectOptions(pageInput:unknown,searchInput:unknown):Promise<{items:InvoiceProjectOption[];page:number;total:number;search:string}>{
 if(!await workflowSession('admin'))throw new Error('Unauthorized.');
 const page=workflowPage(pageInput),search=typeof searchInput==='string'?searchInput.trim().slice(0,200):'';
 let query=getSupabaseAdmin().from('projects').select('id,name,profiles!projects_client_id_fkey(full_name)',{count:'exact'}).eq('status','active').is('archived_at',null).order('name').order('id').range((page-1)*25,page*25-1);
 // Literal substring matching: user wildcard characters are not query operators.
 if(search)query=query.ilike('name','%'+search.replace(/[\\%_]/g,'\\$&')+'%');
 const {data,error,count}=await query;if(error||count===null)throw new Error('Could not load project choices.');
 const rows=(data??[]) as unknown as Array<{id:string;name:string;profiles:{full_name:string|null}|null}>;
 return {items:rows.map(row=>({id:row.id,name:row.name,client_name:row.profiles?.full_name??null,client_email:''})),page,total:count,search};
}
