'use server';
import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {sha256Hex} from '@/lib/contact/lead-schema';
export type ActionState={error?:string;notice?:string};
function safeRelativePath(raw:FormDataEntryValue|null):string|null {
 const hasControl=(value:string)=>Array.from(value).some(character=>{const code=character.charCodeAt(0);return code<32||code===127;});
 if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\')||hasControl(raw))return null;
 try {
  // Fixed validation-only origin: never trust a posted Host/Origin as authority.
  const base='https://return-path.invalid';
  const url=new URL(raw,base);
  const pathname=decodeURIComponent(url.pathname);
  if(url.origin!==base||url.pathname.startsWith('//')||pathname.startsWith('//')||pathname.includes('\\')||hasControl(pathname))return null;
  return url.pathname+url.search+url.hash;
 }catch{return null;}
}
async function panelHomeForCurrentUser():Promise<string> {
 const supabase=await createSupabaseServerClient();const {data}=await supabase.auth.getClaims();return data?.claims?.app_metadata?.role==='admin'?'/admin':'/portal';
}
const MIN_PASSWORD=12;
const INVALID_LINK='This link is invalid or has expired. Ask for a new one.';
const OTP_RATE_MESSAGE='Too many requests. Please try again later.';
async function checkOtpRateLimit():Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;if(!salt){console.error('OTP configuration unavailable.');return false;}
 try {
  const h=await headers();const ip=h.get('cf-connecting-ip')||h.get('x-forwarded-for')?.split(',')[0]?.trim()||h.get('x-real-ip')||'unknown';
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'otp-ip',p_key_hash:await sha256Hex(salt+ip),p_window_seconds:300,p_max_count:5});
  if(error){console.error('OTP rate control unavailable.');return false;}return data===true;
 }catch{console.error('OTP rate control unavailable.');return false;}
}
function credentialEmailOrigin():string|null {
 try{const raw=process.env.NEXT_PUBLIC_SITE_URL;if(!raw)return null;const url=new URL(raw);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;return url.origin;}catch{return null;}
}
function validatePasswordPair(formData:FormData):{error:string}|{password:string} {
 const password=String(formData.get('password')??''),confirm=String(formData.get('confirm')??'');
 if(password.length<MIN_PASSWORD)return {error:`Password must be at least ${MIN_PASSWORD} characters.`};
 if(password!==confirm)return {error:'Passwords do not match.'};return {password};
}
export async function signInWithPasswordAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase(),password=String(formData.get('password')??''),next=safeRelativePath(formData.get('next'));
 if(!email||!password)return {error:'Email and password are required.'};
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithPassword({email,password});if(error)return {error:'Invalid email or password.'};
 const home=await panelHomeForCurrentUser();
 if(next){
  // Navigation policy only. Proxy/layout/action current-account checks still authorize access.
  // Avoid an intermediate wrong-panel Server Action navigation; mirror proxy panel prefixes.
  const pathname=decodeURIComponent(new URL(next,'https://return-path.invalid').pathname);
  if((pathname.startsWith('/admin')&&home!=='/admin')||(pathname.startsWith('/portal')&&home!=='/portal'))redirect(home);
  redirect(next);
 }
 redirect(home);
}
export async function requestMagicLinkAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase();if(!email)return {error:'Email is required.'};
 if(!await checkOtpRateLimit())return {error:OTP_RATE_MESSAGE};
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 if(error?.status===429)return {error:'Too many requests. Please wait a minute and try again.'};
 return {notice:'If that address has an account, a sign-in link is on its way.'};
}
export async function requestPasswordResetAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase();if(!email)return {error:'Email is required.'};
 if(!await checkOtpRateLimit())return {error:OTP_RATE_MESSAGE};
 const origin=credentialEmailOrigin();if(!origin)return {error:'Password recovery is temporarily unavailable. Please try again later.'};
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:origin+'/reset-password'});
 if(error?.status===429)return {error:'Too many requests. Please wait a minute and try again.'};
 return {notice:'If that address has an account, a reset link is on its way.'};
}
export async function setNewPasswordFromRecoveryAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const tokenHash=String(formData.get('token_hash')??'');if(!tokenHash)return {error:INVALID_LINK};
 const checked=validatePasswordPair(formData);if('error' in checked)return checked;
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.verifyOtp({type:'recovery',token_hash:tokenHash});if(error)return {error:INVALID_LINK};
 const updated=await supabase.auth.updateUser({password:checked.password});if(updated.error)return {error:'Could not update your password. Try again.'};redirect(await panelHomeForCurrentUser());
}
export async function acceptInviteAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const tokenHash=String(formData.get('token_hash')??'');if(!tokenHash)return {error:INVALID_LINK};const checked=validatePasswordPair(formData);if('error' in checked)return checked;
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.verifyOtp({type:'invite',token_hash:tokenHash});if(error)return {error:INVALID_LINK};
 const updated=await supabase.auth.updateUser({password:checked.password});if(updated.error)return {error:'Could not save your password. Try again.'};redirect(await panelHomeForCurrentUser());
}
export async function consumeMagicLinkTokenAction(tokenHash:string):Promise<{ok:true;home:string}|{ok:false;error:string}> {
 if(!await checkOtpRateLimit())return {ok:false,error:OTP_RATE_MESSAGE};const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.verifyOtp({type:'magiclink',token_hash:tokenHash});if(error)return {ok:false,error:INVALID_LINK};return {ok:true,home:await panelHomeForCurrentUser()};
}
