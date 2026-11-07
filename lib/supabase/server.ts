import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldUseSecureCookies } from '@/lib/security/safe-redirect';

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase client credentials missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  const cookieStore = await cookies();
  const useSecureCookies = shouldUseSecureCookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              secure: useSecureCookies,
              sameSite: 'lax',
            });
          });
        } catch {
          // Called from a Server Component render — safe to ignore because the
          // proxy refreshes sessions before render for every matched route.
        }
      },
    },
  });
}
