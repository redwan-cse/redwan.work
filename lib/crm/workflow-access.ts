import 'server-only';
import { getCurrentSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
export async function workflowSession(role?: 'admin'|'client') {
  const session=await getCurrentSession();
  if(!session||(role&&session.role!==role)) return null;
  const {data,error}=await getSupabaseAdmin().from('profiles').select('role,is_active').eq('id',session.userId).maybeSingle();
  return !error&&data?.is_active===true&&data.role===session.role?session:null;
}
export function workflowPage(value:unknown):number {
  const n=Number(value??1);
  return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:1;
}
