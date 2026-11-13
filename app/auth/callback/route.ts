import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeRelativeRedirectPath } from '@/lib/security/safe-redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = sanitizeRelativeRedirectPath(searchParams.get('next')) ?? '/portal';

  if (tokenHash && type) {
    if (type === 'recovery') {
      return NextResponse.redirect(
        new URL(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}`, origin)
      );
    }
    if (type === 'invite') {
      return NextResponse.redirect(
        new URL(`/invite/accept?token_hash=${encodeURIComponent(tokenHash)}`, origin)
      );
    }
    return NextResponse.redirect(
      new URL(
        `/login?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`,
        origin
      )
    );
  }

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (type === 'recovery') {
          return NextResponse.redirect(new URL('/reset-password?session=1', origin));
        }
        return NextResponse.redirect(new URL(next, origin));
      }
    } catch {
      // fall through to login error redirect
    }
  }

  return NextResponse.redirect(new URL('/login', origin));
}
