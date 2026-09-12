import 'server-only';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {crmError,type CrmResult} from '@/lib/crm/result';
import {findAuthUserByEmail} from '@/lib/crm/auth-admin';
import {queueEmail,recordExternalSend,recordUnsent} from '@/lib/email';
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export interface ClientRow {id:string;email:string;full_name:string|null;company:string|null;is_active:boolean;created_at:string;}
export async function listClients():Promise<ClientRow[]> {
  const admin=getSupabaseAdmin();
  const {data,error}=await admin.from('profiles').select('id,full_name,company,is_active,created_at').eq('role','client').order('created_at',{ascending:false});
  if(error)throw new Error('Could not load clients.');
  const rows=(data??[]) as Omit<ClientRow,'email'>[];const result:ClientRow[]=[];
  for(let i=0;i<rows.length;i+=10) {
    const batch=await Promise.all(rows.slice(i,i+10).map(async row=>{const {data:user,error:authError}=await admin.auth.admin.getUserById(row.id);if(authError)throw new Error('Could not load client details.');return {...row,email:user?.user?.email??''};}));
    result.push(...batch);
  }
  return result;
}
async function claimClient(userId:string):Promise<CrmResult> {
  const admin=getSupabaseAdmin();
  const [{data:user,error:authError},{data:profile,error:profileError}]=await Promise.all([admin.auth.admin.getUserById(userId),admin.from('profiles').select('role,is_active').eq('id',userId).maybeSingle()]);
  if(authError||profileError||!user?.user||!profile)return crmError('Account setup unavailable.');
  if(user.user.app_metadata?.role==='admin'||profile.role!=='client')return crmError('That email belongs to a protected account.');
  if(profile.is_active!==true)return crmError('That client account is inactive.');
  if(user.user.app_metadata?.role==='client')return {ok:true};
  const {error}=await admin.auth.admin.updateUserById(userId,{app_metadata:{...user.user.app_metadata,role:'client'}});
  if(error)return crmError('Account exists, but role setup failed. Retry account setup before granting access.');
  // signOut accepts a user's JWT, never a UUID. No invalid UUID logout call here.
  return {ok:true};
}
async function inviteOrClaim(email:string,origin:string):Promise<{ok:true;userId:string;fresh:boolean}|{ok:false;error:string}> {
  const admin=getSupabaseAdmin();
  let existing;
  try {existing=await findAuthUserByEmail(email);}catch{return {ok:false,error:'Account lookup unavailable.'};}
  if(existing) {
    const {data:profile,error}=await admin.from('profiles').select('role').eq('id',existing.id).maybeSingle();
    if(error||!profile)return {ok:false,error:'Account lookup unavailable.'};
    if(existing.role==='admin'||profile.role==='admin')return {ok:false,error:'That email belongs to an admin account.'};
    const claim=await claimClient(existing.id);if(!claim.ok)return claim;
    queueEmail(()=>recordUnsent({template:'invite',reason:'Existing account claimed; no invite email sent',to:email,entityType:'client',entityId:existing.id}));
    return {ok:true,userId:existing.id,fresh:false};
  }
  const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${origin}/invite/accept`});
  if(error||!data?.user) {
    queueEmail(async()=>{await recordExternalSend({to:email,template:'invite',entityType:'client',status:'failed',error:'Invitation provider request failed'});return {ok:false,error:'Invitation provider request failed'};});
    return {ok:false,error:'Invitation could not be sent. Please try again.'};
  }
  const userId=data.user.id;
  queueEmail(async()=>{await recordExternalSend({to:email,template:'invite',entityType:'client',entityId:userId});return {ok:true,resendId:null};});
  const claim=await claimClient(userId);if(!claim.ok)return claim;
  return {ok:true,userId,fresh:true};
}
export async function inviteClient(input:{email:string;fullName?:string;company?:string;redirectToBase:string}):Promise<CrmResult> {
  if(!input||typeof input.email!=='string')return crmError('Enter a valid email address.');
  const email=input.email.trim().toLowerCase();if(!EMAIL_RE.test(email))return crmError('Enter a valid email address.');
  if((input.fullName?.trim().length??0)>200||(input.company?.trim().length??0)>200)return crmError('Name and company must be at most 200 characters.');
  const result=await inviteOrClaim(email,input.redirectToBase);if(!result.ok)return result;
  const patch:Record<string,unknown>={};if(input.fullName?.trim())patch.full_name=input.fullName.trim();if(input.company?.trim())patch.company=input.company.trim();
  if(Object.keys(patch).length) {
    const {data,error}=await getSupabaseAdmin().from('profiles').update(patch).eq('id',result.userId).eq('role','client').select('id').maybeSingle();
    if(error||!data)return crmError('Account exists. Update its profile from Clients before continuing.');
  }
  return {ok:true};
}
export async function setClientActive(clientId:string,active:boolean):Promise<CrmResult> {
  if(typeof active!=='boolean')return crmError('Invalid account state.');
  const admin=getSupabaseAdmin();
  const {data:profile,error:readError}=await admin.from('profiles').select('id,role').eq('id',clientId).maybeSingle();
  if(readError||!profile||profile.role!=='client')return crmError('Client not found.');
  if(active) {
    const {error}=await admin.auth.admin.updateUserById(clientId,{ban_duration:'none'});
    if(error)return crmError('Reactivation failed. Account remains disabled.');
  }
  const {data,error}=await admin.from('profiles').update({is_active:active}).eq('id',clientId).eq('role','client').select('id').maybeSingle();
  if(error||!data)return crmError('Account state could not be saved.');
  if(!active) {
    const {error:banError}=await admin.auth.admin.updateUserById(clientId,{ban_duration:'876000h'});
    if(banError)return crmError('Portal access is disabled. Sign-in blocking failed; retry deactivation.');
  }
  return {ok:true};
}
export async function convertLead(leadId:string,redirectToBase:string):Promise<CrmResult> {
  const admin=getSupabaseAdmin();
  const {data:lead,error}=await admin.from('leads').select('id,email,name,company,converted_client_id').eq('id',leadId).maybeSingle();
  if(error)return crmError('Lead lookup failed.');if(!lead)return crmError('Lead not found.');if(lead.converted_client_id)return crmError('This lead was already converted.');
  const email=String(lead.email??'').trim().toLowerCase();if(!EMAIL_RE.test(email))return crmError('Lead has no usable email address.');
  const result=await inviteOrClaim(email,redirectToBase);if(!result.ok)return result;
  if(result.fresh) {
    const {error:profileError}=await admin.from('profiles').update({full_name:typeof lead.name==='string'?lead.name.trim().slice(0,200):null,company:typeof lead.company==='string'?lead.company.trim().slice(0,200):null}).eq('id',result.userId).eq('role','client');
    if(profileError)return crmError('Account exists. Update its profile and retry conversion.');
  }
  const {data:changed,error:updateError}=await admin.from('leads').update({converted_client_id:result.userId,status:'won'}).eq('id',leadId).is('converted_client_id',null).select('id').maybeSingle();
  if(updateError||!changed)return crmError('Account exists, but the lead changed. Refresh and retry conversion.');
  return {ok:true};
}
