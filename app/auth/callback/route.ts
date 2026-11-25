import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import {
  resolveCallbackOrigin,
  sanitizeRelativeRedirectPath,
  shouldUseSecureCookies,
} from '@/lib/security/safe-redirect';
import { resolveTrustedIp } from '@/lib/security/trusted-ip';

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

function secureRedirect(url: URL | string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
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
      return secureRedirect(
        new URL(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}`, origin)
      );
    }
    if (type === 'invite') {
      const inviteUrl = new URL('/invite/accept', origin);
      inviteUrl.searchParams.set('token_hash', tokenHash);
      const email = searchParams.get('email');
      if (email) inviteUrl.searchParams.set('email', email);
      return secureRedirect(inviteUrl);
    }
    if (type === 'signup' || type === 'email') {
      try {
        const ip = resolveTrustedIp(request.headers);
        const allowed = await consumeRateLimit('auth-callback', ip, 30, 300);
        if (!allowed) {
          return secureRedirect(new URL('/login?verified=0', origin));
        }
        const res = await runWithCallbackClient(request, (supabase) =>
          supabase.auth.verifyOtp({
            type: type as 'signup' | 'email',
            token_hash: tokenHash,
          })
        );
        if (res.ok) {
          const resp = redirectWithCookies(next, origin, res.cookiesToSet);
          resp.headers.set('Cache-Control', 'private, no-store, max-age=0');
          resp.headers.set('Referrer-Policy', 'no-referrer');
          return resp;
        }
      } catch {
        // fall through to login notice
      }
      return secureRedirect(new URL('/login?verified=0', origin));
    }
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('token_hash', tokenHash);
    loginUrl.searchParams.set('type', type);
    if (rawNext) loginUrl.searchParams.set('next', rawNext);
    return secureRedirect(loginUrl);
  }

  if (code) {
    try {
      const ip = resolveTrustedIp(request.headers);
      const allowed = await consumeRateLimit('auth-callback', ip, 30, 300);
      if (!allowed) {
        return secureRedirect(new URL('/login', origin));
      }
      const res = await runWithCallbackClient(request, (supabase) =>
        supabase.auth.exchangeCodeForSession(code)
      );
      if (res.ok) {
        const dest =
          type === 'recovery'
            ? '/reset-password?session=1'
            : type === 'invite'
              ? '/invite/accept?session=1'
              : next;
        const resp = redirectWithCookies(dest, origin, res.cookiesToSet);
        resp.headers.set('Cache-Control', 'private, no-store, max-age=0');
        resp.headers.set('Referrer-Policy', 'no-referrer');
        return resp;
      }
    } catch {
      // fall through to login error redirect
    }
  }

  return secureRedirect(new URL('/login', origin));
}
