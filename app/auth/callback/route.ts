import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeRelativeRedirectPath, shouldUseSecureCookies } from '@/lib/security/safe-redirect';

export const dynamic = 'force-dynamic';

type CookieEntry = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

async function runWithCallbackClient(
  request: NextRequest,
  fn: (supabase: SupabaseClient) => Promise<{ error: unknown }>
): Promise<{ ok: boolean; cookiesToSet: CookieEntry[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return { ok: false, cookiesToSet: [] };
  }

  const cookiesToSet: CookieEntry[] = [];
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(entries) {
        cookiesToSet.push(...entries);
      },
    },
  });

  const { error } = await fn(supabase);
  return { ok: !error, cookiesToSet };
}

function redirectWithCookies(
  target: string,
  origin: string,
  cookiesToSet: CookieEntry[]
): NextResponse {
  const response = NextResponse.redirect(new URL(target, origin));
  const secure = shouldUseSecureCookies();
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      ...(options as Record<string, unknown>),
      secure,
      sameSite: 'lax',
    });
  }
  return response;
}

function resolveRequestOrigin(request: NextRequest): string {
  const protoHeader = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const hostHeader = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    ''
  )
    .split(',')[0]
    ?.trim();

  let configuredOrigin: string | null = null;
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSite) {
    try {
      configuredOrigin = new URL(configuredSite).origin;
    } catch {
      configuredOrigin = null;
    }
  }

  if (hostHeader) {
    const proto =
      protoHeader === 'https' || protoHeader === 'http'
        ? protoHeader
        : request.nextUrl.protocol.replace(/:$/, '');
    try {
      const candidate = new URL(`${proto}://${hostHeader}`);
      const isLoopbackHost =
        candidate.hostname === '127.0.0.1' || candidate.hostname === 'localhost';
      if (isLoopbackHost || (configuredOrigin && candidate.origin === configuredOrigin)) {
        return candidate.origin;
      }
    } catch {
      // fall through
    }
  }

  return configuredOrigin ?? request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = resolveRequestOrigin(request);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const rawNext = sanitizeRelativeRedirectPath(searchParams.get('next'));
  const next = rawNext ?? '/portal';

  if (tokenHash && type) {
    if (type === 'recovery') {
      return NextResponse.redirect(
        new URL(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}`, origin)
      );
    }
    if (type === 'invite') {
      const inviteUrl = new URL('/invite/accept', origin);
      inviteUrl.searchParams.set('token_hash', tokenHash);
      const email = searchParams.get('email');
      if (email) inviteUrl.searchParams.set('email', email);
      return NextResponse.redirect(inviteUrl);
    }
    if (type === 'signup' || type === 'email') {
      try {
        const res = await runWithCallbackClient(request, (supabase) =>
          supabase.auth.verifyOtp({
            type: type as 'signup' | 'email',
            token_hash: tokenHash,
          })
        );
        if (res.ok) {
          return redirectWithCookies(next, origin, res.cookiesToSet);
        }
      } catch {
        // fall through to login notice
      }
      return NextResponse.redirect(new URL('/login?verified=0', origin));
    }
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('token_hash', tokenHash);
    loginUrl.searchParams.set('type', type);
    if (rawNext) loginUrl.searchParams.set('next', rawNext);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    try {
      const res = await runWithCallbackClient(request, (supabase) =>
        supabase.auth.exchangeCodeForSession(code)
      );
      if (res.ok) {
        if (type === 'recovery') {
          return redirectWithCookies('/reset-password?session=1', origin, res.cookiesToSet);
        }
        if (type === 'invite') {
          return redirectWithCookies('/invite/accept?session=1', origin, res.cookiesToSet);
        }
        return redirectWithCookies(next, origin, res.cookiesToSet);
      }
    } catch {
      // fall through to login error redirect
    }
  }

  return NextResponse.redirect(new URL('/login', origin));
}
