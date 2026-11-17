import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveCallbackOrigin,
  sanitizeRelativeRedirectPath,
  shouldUseSecureCookies,
} from '@/lib/security/safe-redirect';

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = resolveCallbackOrigin({
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    requestOrigin: request.nextUrl.origin,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
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
