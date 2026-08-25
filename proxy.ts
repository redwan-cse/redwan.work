import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_PAGES = new Set(['/login', '/reset-password']);
const LOGOUT_ROUTE = '/api/auth/logout';

function panelHome(role: string | undefined): string | null {
  if (role === 'admin') return '/admin';
  if (role === 'client') return '/portal';
  return null;
}

function readClaimRole(claims: unknown): string | undefined {
  const c = claims as { app_metadata?: Record<string, unknown> } | null | undefined;
  const role = c?.app_metadata?.['role'];
  return typeof role === 'string' ? role : undefined;
}

function readClaimSub(claims: unknown): string | undefined {
  const sub = (claims as { sub?: unknown } | null | undefined)?.sub;
  return typeof sub === 'string' ? sub : undefined;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname, search } = request.nextUrl;

  // Fail closed for protected paths when Supabase env is absent.
  if (!url || !publishableKey) {
    const isAuthPage =
      AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
    if (isAuthPage) return NextResponse.next();
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.cookies.toString());
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Must happen before any response is committed so refreshed cookies survive.
  const { data } = await supabase.auth.getClaims();
  const role = readClaimRole(data?.claims);
  const authenticated = Boolean(readClaimSub(data?.claims));

  const isAuthPage = AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
  const loginUrl = new URL('/login', request.url);

  if (!authenticated) {
    if (isAuthPage) return response;
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login') {
    const home = panelHome(role);
    if (home) return NextResponse.redirect(new URL(home, request.url));
    return response; // reset-password/invite pages stay reachable while signed in
  }

  if (pathname.startsWith('/admin')) {
    if (role === 'admin') return response;
    const home = panelHome(role);
    if (home) return NextResponse.redirect(new URL(home, request.url));
    await supabase.auth.signOut();
    return redirectWithCookies(loginUrl, response);
  }

  if (pathname.startsWith('/portal')) {
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (role === 'client') {
      const userId = readClaimSub(data?.claims)!;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.error('profiles is_active check failed:', error.message);
      }
      if (profile?.is_active === true) return response;
    }
    // The logout route performs the actual sign-out with proper cookie context;
    // the proxy only bounces there.
    const bye = new URL(LOGOUT_ROUTE, request.url);
    bye.searchParams.set('reason', 'deactivated');
    return NextResponse.redirect(bye);
  }

  return response;
}

function redirectWithCookies(target: URL, base: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(target);
  // signOut() wrote cleared cookie values into `base`; carry them over so the
  // browser actually drops the session cookies on this same response.
  base.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  return redirect;
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/login', '/reset-password', '/invite/:path*'],
};
