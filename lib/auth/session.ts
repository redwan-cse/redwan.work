import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AppRole = 'admin' | 'client';

export interface SessionInfo {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole;
}

interface ClaimsLike {
  sub?: string;
  email?: string;
  aal?: string;
  app_metadata?: Record<string, unknown>;
}

export async function getCurrentSession(): Promise<SessionInfo | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as ClaimsLike | undefined;
    if (
      error ||
      typeof claims?.sub !== 'string' ||
      !claims.sub ||
      typeof claims?.email !== 'string' ||
      !claims.email
    ) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active, mfa_enforced, full_name, email')
      .eq('id', claims.sub)
      .maybeSingle();

    if (profileError || !profile || profile.is_active !== true) {
      return null;
    }

    const role = profile.role as AppRole;
    if (role !== 'admin' && role !== 'client') {
      return null;
    }

    if (role === 'admin') {
      if (claims.app_metadata?.role !== 'admin') {
        return null;
      }
      if (profile.mfa_enforced === true && claims.aal !== 'aal2') {
        return null;
      }
    }

    return {
      userId: claims.sub,
      email: profile.email || claims.email,
      fullName: profile.full_name ?? null,
      role,
    };
  } catch {
    console.error('Session authority check unavailable.');
    return null;
  }
}

export async function getPendingMfaAdminSession(): Promise<{
  userId: string;
  email: string;
  fullName: string | null;
  mfaEnforced: boolean;
  aal: string;
} | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as ClaimsLike | undefined;
    if (
      error ||
      typeof claims?.sub !== 'string' ||
      !claims.sub ||
      typeof claims?.email !== 'string' ||
      !claims.email ||
      claims.app_metadata?.role !== 'admin'
    ) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active, mfa_enforced, full_name, email')
      .eq('id', claims.sub)
      .maybeSingle();

    if (profileError || !profile || profile.is_active !== true || profile.role !== 'admin') {
      return null;
    }

    return {
      userId: claims.sub,
      email: profile.email || claims.email,
      fullName: profile.full_name ?? null,
      mfaEnforced: profile.mfa_enforced === true,
      aal: typeof claims.aal === 'string' ? claims.aal : 'aal1',
    };
  } catch {
    return null;
  }
}
