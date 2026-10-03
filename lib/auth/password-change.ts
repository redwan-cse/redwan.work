'use server';
import 'server-only';
import {headers} from 'next/headers';
import {createClient} from '@supabase/supabase-js';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {workflowSession} from '@/lib/crm/workflow-access';
import {sha256Hex} from '@/lib/contact/lead-schema';

export type PasswordChangeState = {
  status?: 'denied' | 'verification-unconfirmed' | 'update-unconfirmed' | 'changed-unconfirmed' | 'complete';
  error?: string;
  notice?: string;
};
const denied = (error: string): PasswordChangeState => ({status:'denied',error});
const verificationUnknown: PasswordChangeState = {
  status:'verification-unconfirmed',
  error:'Password was not changed by this request, but temporary-session cleanup could not be confirmed. Stop and contact support before retrying.',
};
const updateUnknown: PasswordChangeState = {
  status:'update-unconfirmed',
  error:'The password change could not be confirmed. Do not submit it again automatically. Sign out and check the new password, or use password recovery.',
};
const changedUnknown: PasswordChangeState = {
  status:'changed-unconfirmed',
  error:'Your password changed, but session protection could not be fully confirmed. Do not repeat the change. Sign out and contact support.',
};

async function allowAttempt(userId: string): Promise<boolean> {
  const salt=process.env.LEAD_IP_HASH_SALT;
  if(!salt)return false;
  try{
    const h=await headers();
    const ip=h.get('cf-connecting-ip')||h.get('x-forwarded-for')?.split(',')[0]?.trim()||h.get('x-real-ip')||'unknown';
    // Independent account and network budgets; no schema or existing OTP-budget changes.
    for(const key of [`password:account:${userId}`,`password:ip:${ip}`]){
      const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{
        p_kind:'otp-ip',p_key_hash:await sha256Hex(salt+':'+key),
        p_window_seconds:300,p_max_count:5,
      });
      if(error||data!==true)return false;
    }
    return true;
  }catch{return false;}
}

export async function changePasswordAction(_previous: PasswordChangeState, form: FormData): Promise<PasswordChangeState> {
  const current=form.get('currentPassword'),password=form.get('password'),confirm=form.get('confirm');
  if(typeof current!=='string'||!current||current.length>4096)return denied('Enter your current password.');
  if(typeof password!=='string'||password.length<12||password.length>4096)return denied('New password must contain between 12 and 4096 characters.');
  if(typeof confirm!=='string'||password!==confirm)return denied('Passwords do not match.');
  if(password===current)return denied('Choose a different new password.');
  let phase:'authority'|'verification'|'update'|'changed'='authority';
  try{
    const actor=await workflowSession('client',{requireUnbannedAuthUser:true});
    if(!actor)return denied('An active client session is required. Sign in again.');
    if(!await allowAttempt(actor.userId))return denied('Too many requests or rate control is unavailable. Please try again later.');
    const raw=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!raw||!key?.startsWith('sb_publishable_'))return denied('Password changes are temporarily unavailable.');
    const url=new URL(raw);
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
      (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))return denied('Password changes are temporarily unavailable.');
    const original=await createSupabaseServerClient();
    const initial=await original.auth.getClaims();
    const sid=initial.data?.claims?.session_id;
    if(initial.error||initial.data?.claims?.sub!==actor.userId||typeof sid!=='string'||!sid)return denied('Sign in again before changing your password.');
    const user=await original.auth.getUser();
    const email=user.data.user?.email;
    if(user.error||user.data.user?.id!==actor.userId||!email)return denied('Sign in again before changing your password.');
    const verifier=createClient(url.origin,key,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,debug:false},
      global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})},
    });
    phase='verification';
    const check=await verifier.auth.signInWithPassword({email,password:current});
    if(check.error||!check.data.session||!check.data.user){
      if(check.data.session)return verificationUnknown;
      if(check.error&&check.error.status&&check.error.status<500)return denied('Current password could not be verified. If it is forgotten or unset, use password recovery.');
      return verificationUnknown;
    }
    let bound=false;
    let sameSession=false;
    try{
      const verified=await verifier.auth.getClaims();
      const temporarySid=verified.data?.claims?.session_id;
      sameSession=temporarySid===sid;
      bound=!verified.error&&check.data.user.id===actor.userId&&verified.data?.claims?.sub===actor.userId&&
        typeof temporarySid==='string'&&!!temporarySid&&!sameSession;
    }catch{
      // Still clean the temporary client if claim verification is unavailable.
    }
    // Never revoke the original session if an unexpected provider result aliases it.
    if(sameSession)return verificationUnknown;
    const cleanup=await verifier.auth.signOut({scope:'local'});
    if(cleanup.error)return verificationUnknown;
    phase='authority';
    if(!bound)return denied('Credential verification did not match the current account.');
    const fresh=await workflowSession('client',{requireUnbannedAuthUser:true});
    const before=await original.auth.getClaims();
    const currentUser=await original.auth.getUser();
    if(!fresh||fresh.userId!==actor.userId||before.error||before.data?.claims?.sub!==actor.userId||
      before.data?.claims?.session_id!==sid||currentUser.error||currentUser.data.user?.id!==actor.userId||
      currentUser.data.user?.email!==email)return denied('Account or session changed. Sign in again before continuing.');
    phase='update';
    // The only mutation uses the original cookie-bound client. Never retry it here.
    const updated=await original.auth.updateUser({password,current_password:current});
    if(updated.error||updated.data.user?.id!==actor.userId)return updateUnknown;
    phase='changed';
    const revoked=await original.auth.signOut({scope:'others'});
    if(revoked.error)return changedUnknown;
    const retained=await original.auth.getClaims();
    if(retained.error||retained.data?.claims?.sub!==actor.userId||retained.data?.claims?.session_id!==sid)return changedUnknown;
    return {status:'complete',notice:'Password changed. This session is retained; other sessions cannot refresh. Existing access tokens may work until they expire.'};
  }catch{
    // No raw provider responses, tokens, passwords or automatic mutation retries.
    if(phase==='changed')return changedUnknown;
    if(phase==='update')return updateUnknown;
    if(phase==='verification')return verificationUnknown;
    return denied('Password changes are temporarily unavailable. Please try again later.');
  }
}
