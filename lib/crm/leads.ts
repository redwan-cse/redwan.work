import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
export interface LeadSummaryRow{id:string;number:number;name:string;company:string|null;email:string;status:string;converted_client_id:string|null;created_at:string;}
export async function listRecentLeads(limit=5):Promise<LeadSummaryRow[]>{
 const bounded=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,100):5;
 try{
  const {data,error}=await getSupabaseAdmin().from('leads').select('id,ticket_number,name,company,email,status,converted_client_id,created_at').order('created_at',{ascending:false}).order('id').limit(bounded);
  if(error)throw new Error('Lead query unavailable');
  return ((data??[]) as Array<Omit<LeadSummaryRow,'number'>&{ticket_number:number}>).map(row=>({id:row.id,number:row.ticket_number,name:row.name,company:row.company,email:row.email,status:row.status,converted_client_id:row.converted_client_id,created_at:row.created_at}));
 }catch{throw new Error('Could not load recent leads.');}
}
