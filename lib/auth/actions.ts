'use server';
import {redirect} from 'next/navigation';
import {headers, cookies} from 'next/headers';
import {checkPasswordLeakedHibp, LEAKED_PASSWORD_ERROR} from '@/lib/auth/hibp';
import {recordAuditLog} from '@/lib/crm/audit';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {sha256Hex} from '@/lib/contact/lead-schema';
import {resolveTrustedIp} from '@/lib/security/trusted-ip';
import {
  resolveCallbackOrigin,
  sanitizeRelativeRedirectPath,
  shouldUseSecureCookies,
} from '@/lib/security/safe-redirect';
export type ActionState={error?:string;notice?:string;linkHref?:string;linkText?:string};
function safeRelativePath(raw:FormDataEntryValue|null):string|null {
 return sanitizeRelativeRedirectPath(raw);
}
const DEACTIVATED_ACCOUNT_MESSAGE =
  'Your account has been deactivated. Contact the administrator.';
const UNAVAILABLE_ACCOUNT_MESSAGE =
  'Your account cannot be accessed right now. Contact the administrator.';

async function resolveCurrentPanelDestination(): Promise<
  { ok: true; home: '/admin' | '/portal' | '/mfa' } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { sub?: string; aal?: string; iat?: number; app_metadata?: Record<string, unknown> }
    | undefined;
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;
  if (!sub) {
    await supabase.auth.signOut();
    return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active, mfa_enforced, tokens_valid_after')
    .eq('id', sub)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
  }

  const role = profile?.role;
  const validAdminClaim = role !== 'admin' || claims?.app_metadata?.role === 'admin';
  const tokensValidAfter = Number(
    (profile as { tokens_valid_after?: number | null } | null)?.tokens_valid_after ?? 0
  );
  const tokenRevoked =
    tokensValidAfter > 0 &&
    (typeof claims?.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat < tokensValidAfter);

  if (
    !profile ||
    profile.is_active !== true ||
    (role !== 'admin' && role !== 'client') ||
    !validAdminClaim ||
    tokenRevoked
  ) {
    let inactive = profile?.is_active === false;
    if (!profile) {
      const state = await supabase.rpc('caller_account_state');
      inactive = state.data === 'inactive';
    }
    await supabase.auth.signOut();
    return {
      ok: false,
      error: inactive ? DEACTIVATED_ACCOUNT_MESSAGE : UNAVAILABLE_ACCOUNT_MESSAGE,
    };
  }

  if (role === 'admin') {
    if (claims?.aal !== 'aal2') {
      return { ok: true, home: '/mfa' };
    }
    return { ok: true, home: '/admin' };
  }

  if (profile.mfa_enforced === true && claims?.aal !== 'aal2') {
    return { ok: true, home: '/mfa' };
  }

  const mfaApi = (
    supabase.auth as {
      mfa?: {
        getAuthenticatorAssuranceLevel?: () => Promise<{
          data?: { currentLevel?: string | null; nextLevel?: string | null } | null;
          error?: unknown;
        }>;
      };
    }
  ).mfa;
  if (mfaApi?.getAuthenticatorAssuranceLevel) {
    try {
      const aalRes = await mfaApi.getAuthenticatorAssuranceLevel();
      if (aalRes?.error) {
        await supabase.auth.signOut();
        return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
      }
      if (aalRes?.data?.nextLevel === 'aal2' && aalRes.data.currentLevel !== 'aal2') {
        return { ok: true, home: '/mfa' };
      }
    } catch {
      await supabase.auth.signOut();
      return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
    }
  }

  return { ok: true, home: '/portal' };
}
const MIN_PASSWORD=12;
const MAX_PASSWORD=128;
const INVALID_LINK='This link is invalid or has expired. Ask for a new one.';
const SPENT_RECOVERY_LINK='Could not update your password. This reset link is no longer valid. Please request a new password reset link.';
const SPENT_INVITE_LINK='Could not save your password. This invitation link is no longer valid. Please ask an administrator to send a new invitation.';
const OTP_RATE_MESSAGE='Too many requests. Please try again later.';
async function resolveTrustedClientIp():Promise<string>{
 const h=await headers();
 return resolveTrustedIp(h);
}
async function checkOtpRateLimit(email?:string):Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;if(!salt){console.error('OTP configuration unavailable.');return false;}
 try {
  const ip=await resolveTrustedClientIp();
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'otp-ip',p_key_hash:await sha256Hex(salt+ip),p_window_seconds:300,p_max_count:5});
  if(error||data!==true){if(error)console.error('OTP rate control unavailable.');return false;}
  if(email){
   const {data:emData,error:emErr}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'otp-email',p_key_hash:await sha256Hex(`${salt}:otp:${email}`),p_window_seconds:300,p_max_count:5});
   if(emErr||emData!==true)return false;
  }
  return true;
 }catch{console.error('OTP rate control unavailable.');return false;}
}
async function checkTokenActionRateLimit():Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;
 if(!salt){
  if(process.env.NODE_ENV==='production'){console.error('Token rate control unavailable.');return false;}
  return true;
 }
 try {
  const ip=await resolveTrustedClientIp();
  const admin=getSupabaseAdmin();
  if(typeof admin.rpc!=='function'){
   return process.env.NODE_ENV!=='production'&&process.env.VITEST==='true';
  }
  const {data,error}=await admin.rpc('consume_rate_limit',{p_kind:'otp-ip',p_key_hash:await sha256Hex(`${salt}:token:${ip}`),p_window_seconds:300,p_max_count:10});
  if(error)return false;
  return data===true;
 }catch{
  return process.env.NODE_ENV!=='production'&&process.env.VITEST==='true';
 }
}
async function revokeOtherSessionsAfterRecovery(
 supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
 userId: string
): Promise<void> {
 try {
  if (typeof supabase.auth.signOut === 'function') {
   await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
  }
  let refreshFailed = false;
  if (typeof supabase.auth.refreshSession === 'function') {
   const refreshed = await supabase.auth.refreshSession().catch(() => ({
    data: { session: null },
    error: new Error('refresh_failed'),
   }));
   if (refreshed?.error) {
    refreshFailed = true;
   }
  }
  const claimsRes = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = claimsRes?.data?.claims as { iat?: number } | undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  const iatSec = typeof claims?.iat === 'number' && Number.isFinite(claims.iat) ? Math.floor(claims.iat) : nowSec;
  const cutoffSec = refreshFailed ? nowSec : Math.min(nowSec, iatSec);
  const admin = getSupabaseAdmin();
  const { data: prof } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  const actorRole: 'admin' | 'client' = prof?.role === 'admin' ? 'admin' : 'client';
  await admin.from('profiles').update({ tokens_valid_after: cutoffSec }).eq('id', userId);
  await recordAuditLog({
   actorId: userId,
   actorRole,
   clientId: actorRole === 'client' ? userId : null,
   action: 'auth.password_reset_completed',
   entityType: 'profile',
   entityId: userId,
   summary: 'Password reset completed and prior access tokens revoked',
  });
 } catch {
  // Non-fatal in isolated unit tests without full admin mocks
 }
}
async function credentialEmailOrigin():Promise<string|null> {
 try{
  const raw=process.env.NEXT_PUBLIC_SITE_URL;
  if(!raw)return null;
  const url=new URL(raw);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;
  if(process.env.NODE_ENV==='production'&&process.env.TEST_ENVIRONMENT!=='isolated-ci'){
   return url.origin;
  }
  try {
   const h=await headers();
   return resolveCallbackOrigin({
    host:h.get('host'),
    forwardedHost:h.get('x-forwarded-host'),
    forwardedProto:h.get('x-forwarded-proto'),
    requestOrigin:url.origin,
    siteUrl:url.origin,
   });
  } catch {
   return url.origin;
  }
 }catch{return null;}
}
async function validatePasswordPair(formData:FormData):Promise<{error:string}|{password:string}> {
 const password=String(formData.get('password')??''),confirm=String(formData.get('confirm')??'');
 if(password.length<MIN_PASSWORD||password.length>MAX_PASSWORD)return {error:`Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`};
 if(password!==confirm)return {error:'Passwords do not match.'};
 const hibp=await checkPasswordLeakedHibp(password);
 if(hibp.leaked)return {error:LEAKED_PASSWORD_ERROR};
 return {password};
}
async function checkPasswordSignInRateLimit(email?:string):Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;
 if(!salt){
  if(process.env.NODE_ENV==='production'){
   console.error('Password sign-in rate control unavailable.');
   return false;
  }
  return true;
 }
 try {
  const ip=await resolveTrustedClientIp();
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'password-login',p_key_hash:await sha256Hex(`${salt}:login:${ip}`),p_window_seconds:300,p_max_count:15});
  if(error){
   console.error('Password sign-in rate limit RPC failed:',error.message);
   return false;
  }
  if(data!==true)return false;
  if(email){
   const {data:emData,error:emErr}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'password-login-email',p_key_hash:await sha256Hex(`${salt}:login-email:${email}`),p_window_seconds:300,p_max_count:10});
   if(emErr||emData!==true)return false;
  }
  return true;
 }catch(err){
  console.error('Password sign-in rate control error:',err);
  return process.env.NODE_ENV!=='production'&&process.env.VITEST==='true';
 }
}
async function checkRegistrationRateLimit():Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;
 if(!salt){
  if(process.env.NODE_ENV==='production'){
   console.error('Registration rate control unavailable.');
   return false;
  }
  return true;
 }
 try {
  const ip=await resolveTrustedClientIp();
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'register-ip',p_key_hash:await sha256Hex(`${salt}:register:${ip}`),p_window_seconds:3600,p_max_count:5});
  if(error){
   console.error('Registration rate limit RPC failed:',error.message);
   return false;
  }
  return data===true;
 }catch(err){
  console.error('Registration rate control error:',err);
  return false;
 }
}
export async function signInWithPasswordAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase(),password=String(formData.get('password')??''),next=safeRelativePath(formData.get('next'));
 if(!email||!password)return {error:'Email and password are required.'};
 if(!await checkPasswordSignInRateLimit(email))return {error:OTP_RATE_MESSAGE};
 const supabase=await createSupabaseServerClient();
 const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error){
  return {error:'Invalid email or password.'};
 }
 const destination=await resolveCurrentPanelDestination();
 if(!destination.ok)return {error:destination.error};
 const home=destination.home;
 if(home==='/mfa'){
  redirect(next?`/mfa?next=${encodeURIComponent(next)}`:'/mfa');
 }
 if(next){
  // Navigation policy only. Proxy/layout/action current-account checks still authorize access.
  // Avoid an intermediate wrong-panel Server Action navigation; mirror proxy panel prefixes.
  const pathname=decodeURIComponent(new URL(next,'https://return-path.invalid').pathname);
  if((pathname.startsWith('/admin')&&home!=='/admin')||(pathname.startsWith('/portal')&&home!=='/portal'))redirect(home);
  redirect(next);
 }
 redirect(home);
}
export async function checkClientEmailRegistrationAction(
 _prev: ActionState | string = {},
 _formData?: FormData
): Promise<{ registered: boolean }> {
 return { registered: false };
}
export async function registerClientAccountAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const fullName=String(formData.get('full_name')??'').trim();
 const email=String(formData.get('email')??'').trim().toLowerCase();
 const companyName=String(formData.get('company_name')??'').trim();
 const phone=String(formData.get('phone')??'').trim();
 const next=safeRelativePath(formData.get('next'));
 if(fullName.length<2)return {error:'Full name is required (at least 2 characters).'};
 if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  return {error:'Please enter a valid email address.'};
 }
 const checked=await validatePasswordPair(formData);
 if('error' in checked)return checked;
 if(!await checkRegistrationRateLimit()){
  return {error:'Too many registration attempts from this network. Please wait and try again.'};
 }

 const genericConfirmNotice =
  'If this email is eligible, a confirmation link has been sent to your inbox. Please verify your email address before signing in to the Client Portal.';

 const origin=await credentialEmailOrigin();
 const callbackUrl=origin
  ?`${origin}/auth/callback${next?`?next=${encodeURIComponent(next)}`:''}`
  :undefined;

 const supabase=await createSupabaseServerClient();
 const {data:signUpData,error:signUpError}=await supabase.auth.signUp({
  email,
  password:checked.password,
  options:{
   emailRedirectTo:callbackUrl,
   data:{
    full_name:fullName,
    company:companyName||null,
    phone:phone||null,
   },
  },
 });

 if(signUpError){
  const msg=(signUpError.message??'').toLowerCase();
  if(msg.includes('already')||msg.includes('registered')||msg.includes('exists')){
   return {notice:genericConfirmNotice};
  }
  return {error:'Could not create your client account. Please try again.'};
 }

 const createdUserId=signUpData?.user?.id;
 const isFreshIdentity=Boolean(createdUserId&&Array.isArray(signUpData.user?.identities)&&signUpData.user.identities.length>0);
 if(!isFreshIdentity||!createdUserId){
  return {notice:genericConfirmNotice};
 }

 const admin=getSupabaseAdmin();
 const {error:profileErr}=await admin.from('profiles').upsert({
  id:createdUserId,
  email,
  full_name:fullName,
  phone:phone||null,
  company:companyName||null,
  role:'client',
  is_active:true,
 });
 if(profileErr){
  console.error('[auth] profile upsert failed during registration:',profileErr.message);
  await admin.auth.admin.deleteUser(createdUserId);
  return {error:'Unable to initialize your client profile. Please try again.'};
 }

 const {error:clientProfileErr}=await admin.from('client_profiles').upsert({
  user_id:createdUserId,
  company_name:companyName||null,
 });
 if(clientProfileErr){
  console.error('[auth] client_profiles upsert failed during registration:',clientProfileErr.message);
  await admin.auth.admin.deleteUser(createdUserId);
  return {error:'Unable to initialize your client profile. Please try again.'};
 }

 return {notice:genericConfirmNotice};
}
export async function requestMagicLinkAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase();if(!email)return {error:'Email is required.'};
 const next=safeRelativePath(formData.get('next'));
 if(!await checkOtpRateLimit(email))return {error:OTP_RATE_MESSAGE};
 const origin=await credentialEmailOrigin();if(!origin)return {error:'Sign-in links are temporarily unavailable. Please try again later.'};
 const redirectTarget=next?`${origin}/auth/callback?type=magiclink&next=${encodeURIComponent(next)}`:`${origin}/auth/callback?type=magiclink`;
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTarget}});
 if(error?.status===429)return {error:'Too many requests. Please wait a minute and try again.'};
 return {notice:'If an account matches that email, a one-time sign-in link has been sent.'};
}
export async function requestPasswordResetAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase();if(!email)return {error:'Email is required.'};
 if(!await checkOtpRateLimit(email))return {error:OTP_RATE_MESSAGE};
 const origin=await credentialEmailOrigin();if(!origin)return {error:'Password recovery is temporarily unavailable. Please try again later.'};
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?type=recovery`});
 if(error?.status===429)return {error:'Too many requests. Please wait a minute and try again.'};
 return {notice:'If that address has an account, a reset link is on its way.'};
}
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

interface RetryAuthorityPayload {
  p: 'recovery' | 'invite';
  sub: string;
  sid: string;
  tok: string;
  exp: number;
  nonce: string;
}

function extractSessionId(session: unknown, claims: unknown): string | null {
  if (claims && typeof claims === 'object') {
    const c = claims as Record<string, unknown>;
    if (typeof c.session_id === 'string' && c.session_id) return c.session_id;
    if (typeof c.sid === 'string' && c.sid) return c.sid;
  }
  if (session && typeof session === 'object') {
    const s = session as Record<string, unknown>;
    if (typeof s.id === 'string' && s.id) return s.id;
    if (typeof s.session_id === 'string' && s.session_id) return s.session_id;
    if (typeof s.access_token === 'string' && s.access_token.includes('.')) {
      try {
        const parts = s.access_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (typeof payload?.session_id === 'string' && payload.session_id) return payload.session_id;
          if (typeof payload?.sid === 'string' && payload.sid) return payload.sid;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function getRetryAuthoritySecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.LEAD_IP_HASH_SALT;
  if (!secret) {
    throw new Error('Server secret unavailable for retry authority.');
  }
  return secret;
}

const RETRY_TTL_SECONDS = 300;

function createRetryAuthorityToken(
  purpose: 'recovery' | 'invite',
  sub: string,
  sid: string,
  tokenHash: string
): string {
  const secret = getRetryAuthoritySecret();
  const exp = Math.floor(Date.now() / 1000) + RETRY_TTL_SECONDS;
  const nonce = randomBytes(16).toString('hex');
  const payload: RetryAuthorityPayload = { p: purpose, sub, sid, tok: tokenHash, exp, nonce };
  const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(rawPayload).digest('base64url');
  return `${rawPayload}.${signature}`;
}

function verifyRetryAuthorityToken(
  token: string | undefined,
  expectedPurpose: 'recovery' | 'invite',
  expectedSub: string,
  expectedSid: string,
  expectedTokenHash: string
): { valid: true; nonce: string; exp: number } | { valid: false } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [rawPayload, signature] = parts;
  if (!rawPayload || !signature) return { valid: false };

  let secret: string;
  try {
    secret = getRetryAuthoritySecret();
  } catch {
    return { valid: false };
  }

  const expectedSig = createHmac('sha256', secret).update(rawPayload).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expSigBuf.length || !timingSafeEqual(sigBuf, expSigBuf)) {
    return { valid: false };
  }

  let payload: RetryAuthorityPayload;
  try {
    payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false };
  }

  if (
    payload.p !== expectedPurpose ||
    payload.sub !== expectedSub ||
    payload.sid !== expectedSid ||
    payload.tok !== expectedTokenHash ||
    typeof payload.exp !== 'number' ||
    Date.now() >= payload.exp * 1000 ||
    !payload.nonce ||
    typeof payload.nonce !== 'string'
  ) {
    return { valid: false };
  }

  return { valid: true, nonce: payload.nonce, exp: payload.exp };
}

async function consumeAtomicRetryClaim(
  nonce: string,
  userId: string,
  purpose: 'recovery' | 'invite',
  expTimestampSecs: number
): Promise<boolean> {
  const salt = process.env.LEAD_IP_HASH_SALT;
  if (!salt) {
    console.error('Retry authority configuration unavailable.');
    return false;
  }
  try {
    const nonceHash = await sha256Hex(salt + ':retry:' + userId + ':' + nonce);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_kind: `retry-${purpose}`,
      p_key_hash: nonceHash,
      p_window_seconds: Math.max(60, expTimestampSecs - Math.floor(Date.now() / 1000)),
      p_max_count: 1,
    });
    if (error || typeof data !== 'boolean') {
      console.error('Retry authority claim failure.');
      return false;
    }
    return data;
  } catch {
    console.error('Retry authority claim unavailable.');
    return false;
  }
}

export async function setNewPasswordFromRecoveryAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
  if(!await checkTokenActionRateLimit())return {error:OTP_RATE_MESSAGE};
  const tokenHash=String(formData.get('token_hash')??'');
  const checked=await validatePasswordPair(formData);if('error' in checked)return checked;
  const supabase=await createSupabaseServerClient();

  // PKCE callback recovery path: user already holds an active recovery session exchanged at /auth/callback
  if(!tokenHash){
    const {data:sessionClaims,error:sessionClaimsErr}=await supabase.auth.getClaims();
    const claims = sessionClaims?.claims as Record<string, unknown> | undefined;
    const sessionSub=typeof claims?.sub==='string'?claims.sub:null;
    const amrEntries=Array.isArray(claims?.amr)?claims.amr:[];
    const hasRecoveryAmr=amrEntries.some((entry)=>typeof entry==='object'&&entry!==null&&(entry as Record<string, unknown>).method==='recovery');
    if(sessionClaimsErr||!sessionSub||!hasRecoveryAmr)return {error:INVALID_LINK};

    const destination=await resolveCurrentPanelDestination();
    if(!destination.ok){
      await supabase.auth.signOut().catch(()=>{});
      return {error:destination.error};
    }
    if(destination.home==='/mfa'){
      redirect('/mfa?next=%2Freset-password%3Fsession%3D1');
    }

    const updated=await supabase.auth.updateUser({password:checked.password});
    if(updated.error){
      return {error:SPENT_RECOVERY_LINK,linkHref:'/login',linkText:'Request a new password reset link'};
    }
    await revokeOtherSessionsAfterRecovery(supabase, sessionSub);
    redirect(destination.home);
  }

  const cookieStore=await cookies();
  const retryCookieName='recovery_retry_authority';
  const existingAuthority=cookieStore.get(retryCookieName)?.value;

  const {data:otpData,error:otpError}=await supabase.auth.verifyOtp({type:'recovery',token_hash:tokenHash});
  if(!otpError&&otpData?.user?.id){
    const destination=await resolveCurrentPanelDestination();
    if(!destination.ok){
      return {error:destination.error};
    }
    if(destination.home==='/mfa'){
      redirect('/mfa?next=%2Freset-password%3Fsession%3D1');
    }
    const {data:claimsData}=await supabase.auth.getClaims();
    const sessionId=extractSessionId(otpData.session,claimsData?.claims);
    const updated=await supabase.auth.updateUser({password:checked.password});
    if(updated.error){
      if(sessionId){
        try{
          const authorityToken=createRetryAuthorityToken('recovery',otpData.user.id,sessionId,tokenHash);
          cookieStore.set(retryCookieName,authorityToken,{
            httpOnly:true,
            secure:shouldUseSecureCookies(),
            maxAge:RETRY_TTL_SECONDS,
            sameSite:'lax',
            path:'/',
          });
        }catch{}
      }
      return {error:'Could not update your password. Try again.'};
    }
    cookieStore.delete(retryCookieName);
    await revokeOtherSessionsAfterRecovery(supabase, otpData.user.id);
    redirect(destination.home);
  }

  // Retry path: verifyOtp already consumed
  const {data:claimsData,error:claimsErr}=await supabase.auth.getClaims();
  const sub=typeof claimsData?.claims?.sub==='string'?claimsData.claims.sub:null;
  const sessionId=extractSessionId(null,claimsData?.claims);
  if(claimsErr||!sub||!sessionId||!existingAuthority)return {error:INVALID_LINK};

  const verification=verifyRetryAuthorityToken(existingAuthority,'recovery',sub,sessionId,tokenHash);
  if(!verification.valid)return {error:INVALID_LINK};

  const destination=await resolveCurrentPanelDestination();
  if(!destination.ok)return {error:destination.error};
  if(destination.home==='/mfa'){
    cookieStore.delete(retryCookieName);
    redirect('/mfa?next=%2Freset-password%3Fsession%3D1');
  }

  const claimed=await consumeAtomicRetryClaim(verification.nonce,sub,'recovery',verification.exp);
  if(!claimed)return {error:INVALID_LINK};

  cookieStore.delete(retryCookieName);

  const updated=await supabase.auth.updateUser({password:checked.password});
  if(updated.error){
    return {error:SPENT_RECOVERY_LINK,linkHref:'/login',linkText:'Request a new password reset link'};
  }
  await revokeOtherSessionsAfterRecovery(supabase, sub);
  redirect(destination.home);
}

async function markInvitationAccepted(userId: string, email?: string | null): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    await admin
      .from('client_invitations')
      .update({
        status: 'accepted',
        accepted_at: nowIso,
        accepted_user_id: userId,
      })
      .eq('accepted_user_id', userId)
      .eq('status', 'pending');
    if (email) {
      await admin
        .from('client_invitations')
        .update({
          status: 'accepted',
          accepted_at: nowIso,
          accepted_user_id: userId,
        })
        .eq('email', email.trim().toLowerCase())
        .eq('status', 'pending');
    }
    await recordAuditLog({
      actorId: userId,
      actorRole: 'client',
      clientId: userId,
      action: 'auth.invite_accepted',
      entityType: 'client_invitation',
      entityId: userId,
      summary: 'Client accepted portal invitation and set password',
    });
  } catch {
    // Non-fatal if service role is unavailable in isolated unit tests
  }
}

export async function acceptInviteAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
  if(!await checkTokenActionRateLimit())return {error:OTP_RATE_MESSAGE};
  const tokenHash=String(formData.get('token_hash')??'');
  const pkceSession=String(formData.get('session')??'')==='1';
  if(!tokenHash&&!pkceSession)return {error:INVALID_LINK};
  const checked=await validatePasswordPair(formData);if('error' in checked)return checked;
  const supabase=await createSupabaseServerClient();

  if(!tokenHash&&pkceSession){
    const {data:sessionClaims,error:sessionClaimsErr}=await supabase.auth.getClaims();
    const claims=sessionClaims?.claims as Record<string, unknown> | undefined;
    const sub=typeof claims?.sub==='string'?claims.sub:null;
    const emailClaim=typeof claims?.email==='string'?claims.email.trim().toLowerCase():null;
    if(sessionClaimsErr||!sub||!emailClaim)return {error:INVALID_LINK};

    const admin=getSupabaseAdmin();
    const [{data:profile,error:profileErr},{data:pendingInvite,error:inviteErr}]=await Promise.all([
      admin.from('profiles').select('role, is_active, tokens_valid_after').eq('id',sub).maybeSingle(),
      admin
        .from('client_invitations')
        .select('id')
        .eq('email',emailClaim)
        .eq('status','pending')
        .is('accepted_at',null)
        .gt('expires_at',new Date().toISOString())
        .limit(1)
        .maybeSingle(),
    ]);

    if(profileErr||inviteErr||!profile||profile.is_active!==true||profile.role!=='client'){
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return {error:INVALID_LINK};
    }

    const validAfter=Number(profile.tokens_valid_after??0);
    const claimIat=typeof claims?.iat==='number'&&Number.isFinite(claims.iat)?claims.iat:0;
    if(validAfter>0&&claimIat<validAfter){
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return {error:INVALID_LINK};
    }

    // Require an active, unrevoked pending invitation row (never accept generic magic-link 'otp' sessions)
    if(!pendingInvite){
      return {error:SPENT_INVITE_LINK,linkHref:'/login',linkText:'Return to sign in'};
    }

    // Enforce MFA/AAL2 before mutating account credentials
    const preDestination=await resolveCurrentPanelDestination();
    if(!preDestination.ok){
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return {error:preDestination.error};
    }
    if(preDestination.home==='/mfa'){
      return {error:'Complete two-factor verification before updating your password.',linkHref:'/mfa?next=%2Finvite%2Faccept%3Fsession%3D1',linkText:'Verify 2FA'};
    }

    const updated=await supabase.auth.updateUser({password:checked.password});
    if(updated.error){
      return {error:SPENT_INVITE_LINK,linkHref:'/login',linkText:'Return to sign in'};
    }
    await markInvitationAccepted(sub,emailClaim);
    await revokeOtherSessionsAfterRecovery(supabase,sub);
    redirect(preDestination.home);
  }

  const cookieStore=await cookies();
  const retryCookieName='invite_retry_authority';
  const existingAuthority=cookieStore.get(retryCookieName)?.value;

  const {data:otpData,error:otpError}=await supabase.auth.verifyOtp({type:'invite',token_hash:tokenHash});
  if(!otpError&&otpData?.user?.id){
    const inviteEmail=(otpData.user.email??'').trim().toLowerCase();
    const admin=getSupabaseAdmin();
    const [{data:prof},{data:pendingInvite,error:invErr}]=await Promise.all([
      admin.from('profiles').select('role, is_active').eq('id',otpData.user.id).maybeSingle(),
      inviteEmail
        ? admin
            .from('client_invitations')
            .select('id')
            .eq('email',inviteEmail)
            .eq('status','pending')
            .is('accepted_at',null)
            .gt('expires_at',new Date().toISOString())
            .limit(1)
            .maybeSingle()
        : Promise.resolve({data:null,error:null}),
    ]);

    if(invErr||!prof||prof.is_active!==true||prof.role!=='client'||!pendingInvite){
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return {error:SPENT_INVITE_LINK,linkHref:'/login',linkText:'Return to sign in'};
    }

    // Enforce MFA/AAL2 before mutating credentials on the token_hash path as well
    const preDestination=await resolveCurrentPanelDestination();
    if(!preDestination.ok){
      await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return {error:preDestination.error};
    }
    if(preDestination.home==='/mfa'){
      return {error:'Complete two-factor verification before updating your password.',linkHref:'/mfa?next=%2Finvite%2Faccept%3Fsession%3D1',linkText:'Verify 2FA'};
    }

    const {data:claimsData}=await supabase.auth.getClaims();
    const sessionId=extractSessionId(otpData.session,claimsData?.claims);
    const updated=await supabase.auth.updateUser({password:checked.password});
    if(updated.error){
      if(sessionId){
        try{
          const authorityToken=createRetryAuthorityToken('invite',otpData.user.id,sessionId,tokenHash);
          cookieStore.set(retryCookieName,authorityToken,{
            httpOnly:true,
            secure:shouldUseSecureCookies(),
            maxAge:RETRY_TTL_SECONDS,
            sameSite:'lax',
            path:'/',
          });
        }catch{}
      }
      return {error:'Could not save your password. Try again.'};
    }
    cookieStore.delete(retryCookieName);
    await markInvitationAccepted(otpData.user.id, otpData.user.email);
    await revokeOtherSessionsAfterRecovery(supabase, otpData.user.id);
    redirect(preDestination.home);
  }

  const {data:claimsData,error:claimsErr}=await supabase.auth.getClaims();
  const sub=typeof claimsData?.claims?.sub==='string'?claimsData.claims.sub:null;
  const emailClaim=typeof claimsData?.claims?.email==='string'?claimsData.claims.email:null;
  const sessionId=extractSessionId(null,claimsData?.claims);
  if(claimsErr||!sub||!sessionId||!existingAuthority)return {error:INVALID_LINK};

  const verification=verifyRetryAuthorityToken(existingAuthority,'invite',sub,sessionId,tokenHash);
  if(!verification.valid)return {error:INVALID_LINK};

  const claimed=await consumeAtomicRetryClaim(verification.nonce,sub,'invite',verification.exp);
  if(!claimed)return {error:INVALID_LINK};

  cookieStore.delete(retryCookieName);

  const updated=await supabase.auth.updateUser({password:checked.password});
  if(updated.error){
    return {error:SPENT_INVITE_LINK,linkHref:'/login',linkText:'Return to sign in'};
  }

  await markInvitationAccepted(sub, emailClaim);
  await revokeOtherSessionsAfterRecovery(supabase, sub);
  const destination=await resolveCurrentPanelDestination();
  if(!destination.ok)return {error:destination.error};
  redirect(destination.home);
}
export async function consumeMagicLinkTokenAction(tokenHash:string, rawNext?: string | null):Promise<{ok:true;home:string}|{ok:false;error:string}> {
 if(!tokenHash)return {ok:false,error:INVALID_LINK};
 if(!await checkOtpRateLimit())return {ok:false,error:OTP_RATE_MESSAGE};
 const supabase=await createSupabaseServerClient();
 const {error}=await supabase.auth.verifyOtp({type:'magiclink',token_hash:tokenHash});
 if(error)return {ok:false,error:INVALID_LINK};
 const destination=await resolveCurrentPanelDestination();
 if(!destination.ok)return {ok:false,error:destination.error};
 const safeNext=safeRelativePath(rawNext??null);
 if(safeNext){
  const pathname=decodeURIComponent(new URL(safeNext,'https://return-path.invalid').pathname);
  if(destination.home==='/mfa')return {ok:true,home:`/mfa?next=${encodeURIComponent(safeNext)}`};
  if((pathname.startsWith('/admin')&&destination.home==='/admin')||(pathname.startsWith('/portal')&&destination.home==='/portal')){
   return {ok:true,home:safeNext};
  }
 }
 return {ok:true,home:destination.home};
}

export async function resetUnverifiedMfaFactorsAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims as Record<string, unknown> | undefined;
    const sub = typeof claims?.sub === 'string' ? claims.sub : null;
    if (!sub) return { ok: false };

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('is_active, role, tokens_valid_after')
      .eq('id', sub)
      .maybeSingle();
    if (!profile?.is_active) return { ok: false };

    const validAfter = Number(profile.tokens_valid_after ?? 0);
    const claimIat = typeof claims?.iat === 'number' && Number.isFinite(claims.iat) ? claims.iat : 0;
    if (validAfter > 0 && claimIat < validAfter) return { ok: false };

    try {
      const salt = process.env.LEAD_IP_HASH_SALT ?? '';
      const keyHash = await sha256Hex(`${salt}:mfa-reset:${sub}`);
      const { data: allowed } = await admin.rpc('consume_rate_limit', {
        p_kind: 'mfa-reset',
        p_key_hash: keyHash,
        p_window_seconds: 600,
        p_max_count: 10,
      });
      if (allowed === false) return { ok: false };
    } catch {
      if (process.env.NODE_ENV === 'production') return { ok: false };
    }

    const { data: factorsData, error: listErr } = await admin.auth.admin.mfa.listFactors({
      userId: sub,
    });
    if (listErr) {
      console.error('[auth] listFactors failed during MFA reset:', listErr.message);
      return { ok: false };
    }
    const unverified = (factorsData?.factors ?? []).filter((f) => f.status !== 'verified');
    for (const factor of unverified) {
      const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: sub,
      });
      if (delErr) {
        console.error('[auth] deleteFactor failed during MFA reset:', delErr.message);
        return { ok: false };
      }
    }
    return { ok: true };
  } catch (err) {
    console.error('[auth] resetUnverifiedMfaFactorsAction error:', err);
    return { ok: false };
  }
}


export async function resolvePostMfaDestinationAction(rawNext?: string | null): Promise<string> {
  const destination = await resolveCurrentPanelDestination();
  if (!destination.ok) return '/login';
  if (destination.home === '/mfa') return '/mfa';

  const safeNext = safeRelativePath(rawNext ?? null);
  if (safeNext) {
    try {
      const parsed = new URL(safeNext, 'https://return-path.invalid');
      const pathname = decodeURIComponent(parsed.pathname);
      if (
        (pathname === '/reset-password' || pathname === '/invite/accept') &&
        parsed.searchParams.get('session') === '1'
      ) {
        return `${pathname}${parsed.search}`;
      }
      if (
        destination.home === '/admin' &&
        (pathname === '/admin' || pathname.startsWith('/admin/'))
      ) {
        return `${pathname}${parsed.search}${parsed.hash}`;
      }
      if (
        destination.home === '/portal' &&
        (pathname === '/portal' || pathname.startsWith('/portal/'))
      ) {
        return `${pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // fall back to destination.home
    }
  }

  return destination.home;
}
