import 'server-only';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
export async function workflowSession(role?: 'admin'|'client', options: {requireUnbannedAuthUser?: boolean} = {}) {
  const session=await getCurrentSession();
  if(!session||(role&&session.role!==role)) return null;
  const {data,error}=await getSupabaseAdmin().from('profiles').select('role,is_active').eq('id',session.userId).maybeSingle();
  if(error||data?.is_active!==true||data.role!==session.role)return null;
  // Recovery reads use service-role storage/catalog access. A valid JWT and
  // active profile alone do not prove that Auth has not since banned the user.
  // Opt in per read boundary; preserve existing mutation/RPC authorization.
  if(options.requireUnbannedAuthUser){
    try {
      const result=await getSupabaseAdmin().auth.admin.getUserById(session.userId);
      if(result.error||!result.data?.user||result.data.user.id!==session.userId)return null;
      const ban:unknown=(result.data.user as {banned_until?:unknown}).banned_until;
      if(ban!==null&&ban!==undefined){
        if(typeof ban!=='string')return null;
        const until=Date.parse(ban);
        if(!Number.isFinite(until)||until>Date.now())return null;
      }
    } catch {
      // No cached fallback and no provider response in logs or client output.
      return null;
    }
  }
  return session;
}
export function workflowPage(value:unknown):number {
  const n=Number(value??1);
  return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:1;
}
