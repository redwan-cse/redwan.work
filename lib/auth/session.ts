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
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as ClaimsLike | undefined;

    if (error || typeof claims?.sub !== 'string' || !claims.sub ||
        typeof claims.email !== 'string' || !claims.email) return null;

    const role = claims.app_metadata?.['role'];
    if (role !== 'admin' && role !== 'client') return null;

    // Verify current authority on each read, using the caller's own RLS context.
    // Do not cache this across requests or substitute the privileged client.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', claims.sub)
      .maybeSingle();
    if (profileError || !profile || profile.is_active !== true || profile.role !== role) {
      return null;
    }

    return { userId: claims.sub, email: claims.email, role };
  } catch {
    // No provider messages, identity values or tokens in diagnostics.
    console.error('Session authority check unavailable.');
    return null;
  }
}
