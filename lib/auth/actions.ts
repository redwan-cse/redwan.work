'use server';
import {redirect} from 'next/navigation';
import {headers, cookies} from 'next/headers';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {sha256Hex} from '@/lib/contact/lead-schema';
import {sanitizeRelativeRedirectPath,shouldUseSecureCookies} from '@/lib/security/safe-redirect';
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
    | { sub?: string; aal?: string; app_metadata?: Record<string, unknown> }
    | undefined;
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;
  if (!sub) {
    await supabase.auth.signOut();
    return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active, mfa_enforced')
    .eq('id', sub)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return { ok: false, error: UNAVAILABLE_ACCOUNT_MESSAGE };
  }

  const role = profile?.role;
  const validAdminClaim = role !== 'admin' || claims?.app_metadata?.role === 'admin';

  if (
    !profile ||
    profile.is_active !== true ||
    (role !== 'admin' && role !== 'client') ||
    !validAdminClaim
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
    if (profile.mfa_enforced === true && claims?.aal !== 'aal2') {
      return { ok: true, home: '/mfa' };
    }
    return { ok: true, home: '/admin' };
  }

  return { ok: true, home: '/portal' };
}
const MIN_PASSWORD=12;
const INVALID_LINK='This link is invalid or has expired. Ask for a new one.';
const SPENT_RECOVERY_LINK='Could not update your password. This reset link is no longer valid. Please request a new password reset link.';
const SPENT_INVITE_LINK='Could not save your password. This invitation link is no longer valid. Please ask an administrator to send a new invitation.';
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
async function checkPasswordSignInRateLimit(email:string):Promise<boolean> {
 const salt=process.env.LEAD_IP_HASH_SALT;if(!salt)return true;
 try {
  const h=await headers();const ip=h.get('cf-connecting-ip')||h.get('x-forwarded-for')?.split(',')[0]?.trim()||h.get('x-real-ip')||'unknown';
  const {data,error}=await getSupabaseAdmin().rpc('consume_rate_limit',{p_kind:'password-login',p_key_hash:await sha256Hex(`${salt}:${ip}:${email}`),p_window_seconds:300,p_max_count:10});
  if(error)return true;return data===true;
 }catch{return true;}
}
export async function signInWithPasswordAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase(),password=String(formData.get('password')??''),next=safeRelativePath(formData.get('next'));
 if(!email||!password)return {error:'Email and password are required.'};
 if(!await checkPasswordSignInRateLimit(email))return {error:OTP_RATE_MESSAGE};
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithPassword({email,password});if(error)return {error:'Invalid email or password.'};
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
export async function requestMagicLinkAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
 const email=String(formData.get('email')??'').trim().toLowerCase();if(!email)return {error:'Email is required.'};
 if(!await checkOtpRateLimit())return {error:OTP_RATE_MESSAGE};
 const origin=credentialEmailOrigin();if(!origin)return {error:'Sign-in links are temporarily unavailable. Please try again later.'};
 // Preserve the documented token-hash flow; /login does not exchange PKCE codes.
 // Supabase's Site URL and Magic Link template must also match docs/auth/README.md.
 const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:origin+'/login'}});
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
  const tokenHash=String(formData.get('token_hash')??'');if(!tokenHash)return {error:INVALID_LINK};
  const checked=validatePasswordPair(formData);if('error' in checked)return checked;
  const supabase=await createSupabaseServerClient();
  const cookieStore=await cookies();
  const retryCookieName='recovery_retry_authority';
  const existingAuthority=cookieStore.get(retryCookieName)?.value;

  const {data:otpData,error:otpError}=await supabase.auth.verifyOtp({type:'recovery',token_hash:tokenHash});
  if(!otpError&&otpData?.user?.id){
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
    const destination=await resolveCurrentPanelDestination();
    if(!destination.ok)return {error:destination.error};
    redirect(destination.home);
  }

  // Retry path: verifyOtp already consumed
  const {data:claimsData,error:claimsErr}=await supabase.auth.getClaims();
  const sub=typeof claimsData?.claims?.sub==='string'?claimsData.claims.sub:null;
  const sessionId=extractSessionId(null,claimsData?.claims);
  if(claimsErr||!sub||!sessionId||!existingAuthority)return {error:INVALID_LINK};

  const verification=verifyRetryAuthorityToken(existingAuthority,'recovery',sub,sessionId,tokenHash);
  if(!verification.valid)return {error:INVALID_LINK};

  const claimed=await consumeAtomicRetryClaim(verification.nonce,sub,'recovery',verification.exp);
  if(!claimed)return {error:INVALID_LINK};

  cookieStore.delete(retryCookieName);

  const updated=await supabase.auth.updateUser({password:checked.password});
  if(updated.error){
    return {error:SPENT_RECOVERY_LINK,linkHref:'/login',linkText:'Request a new password reset link'};
  }

  const destination=await resolveCurrentPanelDestination();
  if(!destination.ok)return {error:destination.error};
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
  } catch {
    // Non-fatal if service role is unavailable in isolated unit tests
  }
}

export async function changeAuthenticatedPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const checked = validatePasswordPair(formData);
  if ('error' in checked) return checked;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const sub = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (claimsError || !sub) {
    return { error: 'Your session has expired. Please sign in again.' };
  }
  const updated = await supabase.auth.updateUser({ password: checked.password });
  if (updated.error) {
    return { error: 'Could not update your password. Please choose a different strong password.' };
  }
  return { notice: 'Your account password has been updated.' };
}

export async function acceptInviteAction(_prev:ActionState,formData:FormData):Promise<ActionState> {
  const tokenHash=String(formData.get('token_hash')??'');if(!tokenHash)return {error:INVALID_LINK};
  const checked=validatePasswordPair(formData);if('error' in checked)return checked;
  const supabase=await createSupabaseServerClient();
  const cookieStore=await cookies();
  const retryCookieName='invite_retry_authority';
  const existingAuthority=cookieStore.get(retryCookieName)?.value;

  const {data:otpData,error:otpError}=await supabase.auth.verifyOtp({type:'invite',token_hash:tokenHash});
  if(!otpError&&otpData?.user?.id){
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
    const destination=await resolveCurrentPanelDestination();
    if(!destination.ok)return {error:destination.error};
    redirect(destination.home);
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
  const destination=await resolveCurrentPanelDestination();
  if(!destination.ok)return {error:destination.error};
  redirect(destination.home);
}
export async function consumeMagicLinkTokenAction(tokenHash:string):Promise<{ok:true;home:string}|{ok:false;error:string}> {
 if(!tokenHash)return {ok:false,error:INVALID_LINK};if(!await checkOtpRateLimit())return {ok:false,error:OTP_RATE_MESSAGE};const supabase=await createSupabaseServerClient();const {error}=await supabase.auth.verifyOtp({type:'magiclink',token_hash:tokenHash});if(error)return {ok:false,error:INVALID_LINK};const destination=await resolveCurrentPanelDestination();if(!destination.ok)return {ok:false,error:destination.error};return {ok:true,home:destination.home};
}
