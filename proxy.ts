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
  const isAuthPage = AUTH_PAGES.has(pathname) || pathname.startsWith('/invite/');
  const loginUrl = new URL('/login', request.url);

  if (!url || !publishableKey) {
    if (isAuthPage) return NextResponse.next();
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.cookies.toString());
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          // Make refreshed cookies visible to downstream server components too.
          request.cookies.set(name, value);
        });
        const previous = response;
        response = NextResponse.next({ request: { headers: request.headers } });
        carrySessionResponse(previous, response);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
          });
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();
    const role = readClaimRole(data?.claims);
    const userId = readClaimSub(data?.claims);

    if (error || !userId) {
      if (isAuthPage) return response;
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      return redirectWithCookies(loginUrl, response);
    }

    // Recovery and invitation screens must remain reachable to complete auth.
    if (pathname === '/reset-password' || pathname.startsWith('/invite/')) return response;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) return unavailableResponse(response);

    const home = panelHome(role);
    if (!home || !profile || profile.is_active !== true || profile.role !== role) {
      // Do not bounce a stale claim between /login and its former panel.
      if (pathname === '/login') return response;
      const bye = new URL(LOGOUT_ROUTE, request.url);
      if (profile?.is_active === false) bye.searchParams.set('reason', 'deactivated');
      return redirectWithCookies(bye, response);
    }

    if (pathname === '/login') return redirectWithCookies(new URL(home, request.url), response);
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return redirectWithCookies(new URL(home, request.url), response);
    }
    if (pathname.startsWith('/portal') && role !== 'client') {
      return redirectWithCookies(new URL(home, request.url), response);
    }
    return response;
  } catch {
    console.error('Route authority check unavailable.');
    return unavailableResponse(response);
  }
}

function carrySessionResponse(base: NextResponse, target: NextResponse): NextResponse {
  base.cookies.getAll().forEach((cookie) => target.cookies.set(cookie.name, cookie.value, cookie));
  for (const name of ['cache-control', 'expires', 'pragma', 'vary']) {
    const value = base.headers.get(name);
    if (value) target.headers.set(name, value);
  }
  return target;
}

function redirectWithCookies(target: URL, base: NextResponse): NextResponse {
  return carrySessionResponse(base, NextResponse.redirect(target));
}

function unavailableResponse(base: NextResponse): NextResponse {
  const response = carrySessionResponse(base, new NextResponse('Authentication is temporarily unavailable.', { status: 503 }));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/login', '/reset-password', '/invite/:path*'],
};
