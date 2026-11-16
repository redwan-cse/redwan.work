import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeRelativeRedirectPath } from '@/lib/security/safe-redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
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
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.verifyOtp({
          type: type as 'signup' | 'email',
          token_hash: tokenHash,
        });
        if (!error) {
          return NextResponse.redirect(new URL(next, origin));
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
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (type === 'recovery') {
          return NextResponse.redirect(new URL('/reset-password?session=1', origin));
        }
        if (type === 'invite') {
          return NextResponse.redirect(new URL('/invite/accept?session=1', origin));
        }
        return NextResponse.redirect(new URL(next, origin));
      }
    } catch {
      // fall through to login error redirect
    }
  }

  return NextResponse.redirect(new URL('/login', origin));
}
