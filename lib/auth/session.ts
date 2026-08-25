import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AppRole = 'admin' | 'client';

export interface SessionInfo {
  userId: string;
  email: string;
  role: AppRole;
}

interface ClaimsLike {
  sub?: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

export async function getCurrentSession(): Promise<SessionInfo | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as ClaimsLike | undefined;

  if (!claims?.sub || !claims.email) return null;

  const role = claims.app_metadata?.['role'];
  if (role !== 'admin' && role !== 'client') return null;

  return { userId: claims.sub, email: claims.email, role };
}
