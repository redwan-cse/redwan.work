import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import type {NormalizedLead} from '@/lib/contact/lead-schema';
export async function insertLead(lead:NormalizedLead):Promise<{ok:true;ticketRef:string}|{ok:false;error:string;code?:'consent_stale'|'consent_unavailable'}>{
 try{
  const {data,error}=await getSupabaseAdmin().from('leads').insert(lead).select('ticket_number').single();
  // Fixed SQLSTATEs from the consent INSERT guard, not diagnostic text.
  if(error?.code==='PT409')return {ok:false,error:'Current consent required.',code:'consent_stale'};
  if(error?.code==='PT503')return {ok:false,error:'Consent unavailable.',code:'consent_unavailable'};
  if(error||!data||!Number.isSafeInteger(data.ticket_number)||data.ticket_number<1)throw new Error('Lead persistence unavailable');
  return {ok:true,ticketRef:`TKT-${data.ticket_number}`};
 }catch{
  // Postgres errors may echo submitted values; never forward their text.
  console.error('Lead insert failed.');
  return {ok:false,error:'Could not save your message.'};
 }
}
