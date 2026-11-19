import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { shouldUseSecureCookies } from '@/lib/security/safe-redirect';

const AUTH_PAGES = new Set(['/login', '/register', '/reset-password']);

function panelHome(role: unknown): string | null {
  return role === 'admin' ? '/admin' : role === 'client' ? '/portal' : null;
}

function withNoIndex(target: NextResponse): NextResponse {
  target.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return target;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname, search } = request.nextUrl;
  const authPage = AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
  const login = new URL('/login', request.url);

  if (!url || !key) {
    if (authPage) return withNoIndex(NextResponse.next());
    login.searchParams.set('next', pathname + search);
    return withNoIndex(NextResponse.redirect(login));
  }

  const useSecureCookies = shouldUseSecureCookies();

  let response = withNoIndex(NextResponse.next({ request: { headers: request.headers } }));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.cookies.toString());
      },
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = withNoIndex(NextResponse.next({ request: { headers: request.headers } }));
        carry(previous, response);
        cookies.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            secure: useSecureCookies,
            sameSite: 'lax',
          })
        );
        Object.entries(headers ?? {}).forEach(([name, value]) =>
          response.headers.set(name, value)
        );
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as
      | { sub?: string; aal?: string; app_metadata?: Record<string, unknown> }
      | undefined;
    const userId = claims?.sub;

    if (error || typeof userId !== 'string' || !userId) {
      if (authPage) return withNoIndex(response);
      login.searchParams.set('next', pathname + search);
      return withNoIndex(carry(response, NextResponse.redirect(login)));
    }

    if (pathname === '/reset-password') {
      if (request.nextUrl.searchParams.get('session') !== '1') {
        return withNoIndex(response);
      }
      const amr = (claims as { amr?: Array<{ method?: string }> } | undefined)?.amr;
      const hasRecoveryAmr =
        Array.isArray(amr) && amr.some((entry) => entry && entry.method === 'recovery');
      if (!hasRecoveryAmr) {
        const forgotUrl = new URL('/login', request.url);
        forgotUrl.searchParams.set('mode', 'forgot');
        return withNoIndex(carry(response, NextResponse.redirect(forgotUrl)));
      }
      const recProfile = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', userId)
        .maybeSingle();
      if (recProfile.error || !recProfile.data || recProfile.data.is_active !== true) {
        const logoutUrl = new URL('/api/auth/logout?reason=deactivated', request.url);
        return withNoIndex(carry(response, NextResponse.redirect(logoutUrl)));
      }
      if (recProfile.data.role === 'admin' && claims?.aal !== 'aal2') {
        const mfaUrl = new URL('/mfa', request.url);
        mfaUrl.searchParams.set('next', pathname + search);
        return withNoIndex(carry(response, NextResponse.redirect(mfaUrl)));
      }
      return withNoIndex(response);
    }
    if (pathname.startsWith('/invite/')) {
      return withNoIndex(response);
    }

    const profile = await supabase
      .from('profiles')
      .select('role, is_active, mfa_enforced')
      .eq('id', userId)
      .maybeSingle();

    if (profile.error) return unavailable(response);

    const role = profile.data?.role;
    const home = panelHome(role);
    const validAdminClaim = role !== 'admin' || claims?.app_metadata?.role === 'admin';

    if (!home || !profile.data || profile.data.is_active !== true || !validAdminClaim) {
      if (pathname === '/login' || pathname === '/register') return withNoIndex(response);
      const logout = new URL('/api/auth/logout', request.url);
      let inactive = profile.data?.is_active === false;
      if (!profile.data) {
        const state = await supabase.rpc('caller_account_state');
        if (state.error) return unavailable(response);
        inactive = state.data === 'inactive';
      }
      if (inactive) {
        logout.searchParams.set('reason', 'deactivated');
      } else {
        logout.searchParams.set('reason', 'session_invalid');
      }
      return withNoIndex(carry(response, NextResponse.redirect(logout)));
    }

    const adminNeedsMfa =
      role === 'admin' && claims?.aal !== 'aal2';

    let clientNeedsMfa = false;
    if (role === 'client') {
      const mfaApi = (
        supabase.auth as {
          mfa?: {
            getAuthenticatorAssuranceLevel?: () => Promise<{
              data?: { currentLevel?: string | null; nextLevel?: string | null } | null;
            }>;
          };
        }
      ).mfa;
      if (mfaApi?.getAuthenticatorAssuranceLevel) {
        const aalRes = await mfaApi.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
        clientNeedsMfa = Boolean(
          aalRes?.data?.nextLevel === 'aal2' && aalRes.data.currentLevel !== 'aal2'
        );
      }
    }

    if (adminNeedsMfa || clientNeedsMfa) {
      if (pathname === '/mfa') return withNoIndex(response);
      const mfaUrl = new URL('/mfa', request.url);
      if (pathname.startsWith('/admin') || pathname.startsWith('/portal')) {
        mfaUrl.searchParams.set('next', pathname + search);
      }
      return withNoIndex(carry(response, NextResponse.redirect(mfaUrl)));
    }

    if (pathname === '/mfa' && request.method === 'GET' && !request.headers.has('next-action')) {
      return withNoIndex(carry(response, NextResponse.redirect(new URL(home, request.url))));
    }

    if (
      pathname === '/login' ||
      pathname === '/register' ||
      (pathname.startsWith('/admin') && role !== 'admin') ||
      (pathname.startsWith('/portal') && role !== 'client')
    ) {
      return withNoIndex(carry(response, NextResponse.redirect(new URL(home, request.url))));
    }

    if (pathname.startsWith('/admin') || pathname.startsWith('/portal') || pathname === '/mfa') {
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    }
    return withNoIndex(response);
  } catch {
    console.error('Route authority check unavailable.');
    return unavailable(response);
  }
}

function carry(base: NextResponse, target: NextResponse): NextResponse {
  base.cookies.getAll().forEach((cookie) => target.cookies.set(cookie.name, cookie.value, cookie));
  for (const name of ['cache-control', 'expires', 'pragma', 'vary', 'x-robots-tag']) {
    const value = base.headers.get(name);
    if (value) target.headers.set(name, value);
  }
  return target;
}

function unavailable(base: NextResponse): NextResponse {
  const response = withNoIndex(
    carry(
      base,
      new NextResponse('Authentication is temporarily unavailable.', { status: 503 })
    )
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/login', '/register', '/reset-password', '/mfa', '/invite/:path*'],
};
