import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import type {EmailTemplate,RenderedEmail,renderNewTicket,renderReplyPosted,renderStatusChanged,renderDeliverableUploaded,renderInvoiceIssued,renderPaymentConfirmed} from '@/lib/email/templates';
export type EmailSendResult={ok:true;resendId:string|null}|{ok:false;error:string};
export type EmailEntityType='client'|'ticket'|'invoice'|'deliverable';
export const HANDOFF_MARKER='handoff: upstream provider accepted; delivery not observed';
export function isEmailConfigured():boolean{return Boolean(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SAFE=new Set(['Invalid recipient address','Email is not configured','Email provider timeout','Ticket context unavailable','Recipient unavailable','No active admin recipients','Invoice context unavailable','Payment context unavailable','Deliverable context unavailable','Existing account claimed; no invite email sent','Invitation provider request failed',HANDOFF_MARKER]);
function safeError(value:unknown):string {const raw=value instanceof Error?value.message:typeof value==='string'?value:'';return SAFE.has(raw)?raw:'Email operation failed';}
async function recordSend(input:{to:string;template:EmailTemplate;entityType?:EmailEntityType;entityId?:string;status:'sent'|'failed';error?:string}):Promise<void> {
 try {
  const candidate=typeof input.to==='string'?input.to.trim().toLowerCase():'';
  const insert=getSupabaseAdmin().from('email_log').insert({to_email:EMAIL.test(candidate)?candidate.slice(0,320):'unknown',template:input.template,entity_type:input.entityType??null,entity_id:input.entityId??null,resend_id:null,status:input.status,error:input.error?safeError(input.error):null});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Audit unavailable')),5000);});
   const result=await Promise.race([insert,timeout]);if(result.error)console.error('email_log insert failed.');
  }finally{if(timer)clearTimeout(timer);}
 }catch{console.error('External email audit unavailable.');}
}
// CRM events are already persisted by database triggers. Legacy request callbacks
// must never send a second copy or claim provider delivery. The only transport is outbox.ts.
const managed=async():Promise<EmailSendResult>=>({ok:false,error:'Lifecycle delivery is managed by the durable outbox.'});
export async function sendEmail(_input:{to:string;template:EmailTemplate;rendered:RenderedEmail;entityType?:EmailEntityType;entityId?:string}):Promise<EmailSendResult>{return managed();}
export async function sendNewTicketEmail(_input:Parameters<typeof renderNewTicket>[0]&{to:string;ticketId:string}):Promise<EmailSendResult>{return managed();}
export async function sendReplyPostedEmail(_input:Parameters<typeof renderReplyPosted>[0]&{to:string;ticketId:string}):Promise<EmailSendResult>{return managed();}
export async function sendStatusChangedEmail(_input:Parameters<typeof renderStatusChanged>[0]&{to:string;ticketId:string}):Promise<EmailSendResult>{return managed();}
export async function sendDeliverableUploadedEmail(_input:Parameters<typeof renderDeliverableUploaded>[0]&{to:string;fileId:string}):Promise<EmailSendResult>{return managed();}
export async function sendInvoiceIssuedEmail(_input:Parameters<typeof renderInvoiceIssued>[0]&{to:string;invoiceId:string}):Promise<EmailSendResult>{return managed();}
export async function sendPaymentConfirmedEmail(_input:Parameters<typeof renderPaymentConfirmed>[0]&{to:string;invoiceId:string}):Promise<EmailSendResult>{return managed();}
export async function recordExternalSend(input:{to:string;template:EmailTemplate;entityType?:EmailEntityType;entityId?:string;status?:'sent'|'failed';error?:string}):Promise<void> {
 const status=input.status??'sent';await recordSend({...input,status,error:input.error??(status==='sent'?HANDOFF_MARKER:undefined)});
}
export async function recordUnsent(input:{template:EmailTemplate;reason:string;to?:string;entityType?:EmailEntityType;entityId?:string}):Promise<EmailSendResult> {
 await recordSend({to:input.to??'unknown',template:input.template,entityType:input.entityType,entityId:input.entityId,status:'failed',error:input.reason});
 return {ok:false,error:safeError(input.reason)};
}
export async function sendToAll(recipients:string[],send:(to:string)=>Promise<EmailSendResult>,unsent?:{template:EmailTemplate;entityType?:EmailEntityType;entityId?:string}):Promise<EmailSendResult> {
 if(!recipients.length)return unsent?recordUnsent({...unsent,reason:'No active admin recipients'}):{ok:false,error:'No recipients'};
 const results=await Promise.allSettled(recipients.map(send));
 return results.every(r=>r.status==='fulfilled'&&r.value.ok)?{ok:true,resendId:null}:{ok:false,error:'Lifecycle delivery is managed by the durable outbox.'};
}
// Compatibility for Auth-owned invitation audit callbacks only. CRM durability
// does not rely on this best-effort scheduling, and its send helpers are inert.
export function queueEmail(send:()=>Promise<EmailSendResult>):void {
 const run=async()=>{try{await send();}catch{console.error('External email audit callback failed.');}};
 try{const {after}=require('next/server') as {after:(run:()=>Promise<void>)=>void};after(run);}catch{void run();}
}
