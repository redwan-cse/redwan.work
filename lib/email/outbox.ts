import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {renderNewTicket,renderReplyPosted,renderStatusChanged,renderDeliverableUploaded,renderInvoiceIssued,renderPaymentConfirmed,type RenderedEmail} from '@/lib/email/templates';
type Event={id:string;template:string;entity_id:string;recipient_id:string|null;lease_token:string;payload:Record<string,unknown>;envelope:Envelope|null};
type Envelope=RenderedEmail&{to:string;from:string};
function text(value:unknown):string {return typeof value==='string'?value:'';}
function number(value:unknown):number {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid event amount');return n;}
function money(value:unknown,currency:unknown):string {const n=number(value);const code=text(currency);if(!/^[A-Z]{3}$/.test(code))throw new Error('Invalid currency');return new Intl.NumberFormat('en-US',{style:'currency',currency:code}).format(n/100);}
function origin():string {
 const raw=process.env.NEXT_PUBLIC_SITE_URL;if(!raw)throw new Error('Missing origin');
 const url=new URL(raw);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Invalid origin');
 return url.origin;
}
export function renderOutboxEvent(event:Event,base:string):RenderedEmail {
 const p=event.payload;const id=event.entity_id;
 if(event.template==='new-ticket')return renderNewTicket({ticketNumber:number(p.ticketNumber),subject:text(p.subject),ticketLink:`${base}/admin/tickets/${id}`});
 if(event.template==='reply-posted')return renderReplyPosted({ticketNumber:number(p.ticketNumber),subject:text(p.subject),authorName:text(p.authorName),bodyPreview:text(p.bodyPreview),ticketLink:`${base}/${p.adminAudience===true?'admin':'portal'}/tickets/${id}`});
 if(event.template==='status-changed')return renderStatusChanged({ticketNumber:number(p.ticketNumber),subject:text(p.subject),status:text(p.status),ticketLink:`${base}/portal/tickets/${id}`});
 if(event.template==='deliverable-uploaded')return renderDeliverableUploaded({projectName:text(p.projectName),filename:text(p.filename),filesLink:`${base}/portal/files`});
 if(event.template==='invoice-issued')return renderInvoiceIssued({invoiceNumber:number(p.invoiceNumber),amountLabel:money(p.amountCents,p.currency),dueLabel:text(p.dueLabel)||null,invoiceLink:`${base}/portal/invoices/${id}`});
 if(event.template==='payment-confirmed')return renderPaymentConfirmed({invoiceNumber:number(p.invoiceNumber),amountLabel:money(p.amountCents,p.currency),outstandingLabel:number(p.outstandingCents)>0?money(p.outstandingCents,p.currency):null,invoiceLink:`${base}/portal/invoices/${id}`});
 throw new Error('Unsupported event');
}
export async function drainEmailOutbox(limit=3):Promise<{accepted:number;deferred:number;failed:number}> {
 const admin=getSupabaseAdmin();const counts={accepted:0,deferred:0,failed:0};
 for(let i=0;i<Math.min(3,Math.max(1,limit));i++) {
  const claimed=await admin.rpc('claim_email_event');if(claimed.error)throw new Error('Email queue unavailable.');
  const event=(claimed.data as Event[]|null)?.[0];if(!event)break;
  let state:'accepted'|'pending'|'failed'|'suppressed'='pending';let error:string|null='provider_unavailable';let provider:string|null=null;
  try {
   const key=process.env.RESEND_API_KEY;const from=process.env.RESEND_FROM_EMAIL;
   if(!key||!from){error='configuration_unavailable';throw new Error('Configuration unavailable');}
   const profile=await admin.from('profiles').select('is_active').eq('id',event.recipient_id).maybeSingle();
   if(profile.error){error='recipient_unavailable';throw new Error('Recipient unavailable');}
   if(!profile.data||profile.data.is_active!==true){state='suppressed';error='inactive_recipient';throw new Error('Recipient inactive');}
   let envelope=event.envelope;
   if(!envelope) {
    const user=await admin.auth.admin.getUserById(event.recipient_id!);
    const to=user.data?.user?.email;
    if(user.error||!to||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)){error='recipient_unavailable';throw new Error('Recipient unavailable');}
    error='render_failed';
    envelope={...renderOutboxEvent(event,origin()),to,from};
    const saved=await admin.from('email_outbox').update({envelope}).eq('id',event.id).eq('lease_token',event.lease_token).eq('state','processing').select('id').maybeSingle();
    if(saved.error||!saved.data){error='audit_unavailable';throw new Error('Envelope persistence failed');}
   }
   error='provider_unavailable';
   let response:Response;
   try {response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`lifecycle/${event.id}`},body:JSON.stringify(envelope),signal:AbortSignal.timeout(10000)});}
   catch(e){error=e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError')?'provider_timeout':'provider_unavailable';throw new Error('Provider unavailable');}
   if(!response.ok){error='provider_rejected';if(response.status>=400&&response.status<500&&response.status!==429)state='failed';throw new Error('Provider rejected');}
   const body:unknown=await response.json();
   if(!body||typeof body!=='object'||!('id' in body)||typeof body.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(body.id))throw new Error('Provider identity unavailable');
   provider=body.id;state='accepted';error=null;
  } catch { /* Only fixed error categories reach persisted diagnostics. */ }
  const finished=await admin.rpc('finish_email_event',{p_id:event.id,p_lease:event.lease_token,p_state:state,p_provider:provider,p_error:error});
  if(finished.error||finished.data!==true)throw new Error('Email outcome persistence unavailable.');
  if(state==='accepted')counts.accepted++;else if(state==='pending')counts.deferred++;else counts.failed++;
 }
 return counts;
}
