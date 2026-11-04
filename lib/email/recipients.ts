import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
/** Compatibility helpers; delivery authorization is enforced separately by the outbox. */
export async function emailOrigin():Promise<string>{
 try{const raw=process.env.NEXT_PUBLIC_SITE_URL;if(!raw)throw new Error();const url=new URL(raw);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error();return url.origin;}
 catch{throw new Error('Email origin is not configured.');}
}
export async function recipientEmail(userId:string):Promise<string|null>{
 if(!userId)return null;
 try{const {data,error}=await getSupabaseAdmin().auth.admin.getUserById(userId);if(error){console.error('Email recipient lookup failed.');return null;}const email=data?.user?.email;return typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)?email:null;}
 catch{console.error('Email recipient lookup failed.');return null;}
}
export async function recipientName(userId:string):Promise<string|null>{
 if(!userId)return null;
 try{const {data,error}=await getSupabaseAdmin().from('profiles').select('full_name').eq('id',userId).maybeSingle();if(error)return null;const name=data?.full_name;return typeof name==='string'&&name.trim()?name.trim():null;}catch{return null;}
}
export async function adminRecipients():Promise<string[]>{
 try{
  const admin=getSupabaseAdmin();const emails=new Set<string>();let cursor='';
  for(let page=0;page<500;page++){
   let query=admin.from('profiles').select('id').eq('role','admin').eq('is_active',true).order('id').limit(100);if(cursor)query=query.gt('id',cursor);
   const {data,error}=await query;if(error||!Array.isArray(data))throw new Error();
   let previous=cursor;
   for(const row of data){if(typeof row.id!=='string'||row.id<=previous)throw new Error();previous=row.id;}
   // Small hydration batches avoid an unbounded Promise.all fan-out.
   for(let i=0;i<data.length;i+=10){const batch=await Promise.all(data.slice(i,i+10).map(row=>recipientEmail(row.id)));for(const email of batch){if(!email)throw new Error();emails.add(email.trim().toLowerCase());}}
   if(data.length<100)return Array.from(emails);cursor=previous;
  }
  throw new Error();
 }catch{console.error('Admin recipient lookup failed.');return [];}
}
export async function ticketEmailContext(ticketId:string):Promise<{ticketId:string;ticketNumber:number;subject:string;clientId:string}|null>{
 if(!ticketId)return null;
 try{const {data,error}=await getSupabaseAdmin().from('tickets').select('id,number,subject,client_id').eq('id',ticketId).maybeSingle();if(error||!data)return null;return {ticketId:data.id,ticketNumber:data.number,subject:data.subject,clientId:data.client_id};}catch{return null;}
}
export function formatMoney(cents:number,currency:string):string{
 const amount=Number.isFinite(cents)?cents/100:0;const code=/^[A-Z]{3}$/.test(currency)?currency:'USD';
 try{return new Intl.NumberFormat('en-US',{style:'currency',currency:code}).format(amount);}catch{return `${code} ${amount.toFixed(2)}`;}
}
