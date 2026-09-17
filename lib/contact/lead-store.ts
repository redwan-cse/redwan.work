import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import type {NormalizedLead} from '@/lib/contact/lead-schema';
export async function insertLead(lead:NormalizedLead):Promise<{ok:true;ticketRef:string}|{ok:false;error:string}>{
 try{
  const {data,error}=await getSupabaseAdmin().from('leads').insert(lead).select('ticket_number').single();
  if(error||!data||!Number.isSafeInteger(data.ticket_number)||data.ticket_number<1)throw new Error('Lead persistence unavailable');
  return {ok:true,ticketRef:`TKT-${data.ticket_number}`};
 }catch{
  // Postgres errors may echo submitted values; never forward their text.
  console.error('Lead insert failed.');
  return {ok:false,error:'Could not save your message.'};
 }
}
