import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSameOriginRequest } from '@/lib/security/safe-redirect';
import { logoutReasonSchema } from '@/lib/validation/schemas';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Same-origin check (enforced strictly on POST, and GET is restricted solely
  // to top-level document navigations for proxy's deactivated-client bounce so
  // cross-site subresource tags like <img src="/api/auth/logout"> return 403).
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    const allowed = new Set([
      request.nextUrl.origin,
      'https://redwan.work',
      'https://www.redwan.work',
    ]);
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      try {
        allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
      } catch {
        // ignore invalid site URL
      }
    }
    const originOk =
      origin !== null &&
      (isSameOriginRequest(request.headers) ||
        (() => {
          try {
            return allowed.has(new URL(origin).origin);
          } catch {
            return false;
          }
        })());
    if (!originOk) {
      return NextResponse.json({ error: 'Request origin not allowed' }, { status: 403 });
    }
  } else if (request.method === 'GET') {
    const secFetchSite = request.headers.get('sec-fetch-site') ?? '';
    const secFetchDest = request.headers.get('sec-fetch-dest') ?? '';
    const secFetchMode = request.headers.get('sec-fetch-mode') ?? '';
    const reason = request.nextUrl.searchParams.get('reason');
    if (
      (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') ||
      (secFetchDest && secFetchDest !== 'document') ||
      (secFetchMode && secFetchMode !== 'navigate') ||
      (reason !== 'deactivated' && reason !== 'session_invalid')
    ) {
      return NextResponse.json(
        { error: 'Method Not Allowed. Use POST /api/auth/logout.' },
        { status: 403 }
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  // GET bounces only clear the local browser session (preventing subdomain/GET CSRF from
  // terminating all other devices); explicit same-origin POST logout performs full signOut.
  if (request.method === 'GET') {
    await supabase.auth.signOut({ scope: 'local' });
  } else {
    await supabase.auth.signOut();
  }

  const parsedReason = logoutReasonSchema.safeParse(request.nextUrl.searchParams.get('reason'));
  const reason = parsedReason.success ? parsedReason.data : null;
  const loginUrl = new URL('/login', request.url);
  if (reason === 'deactivated') {
    loginUrl.searchParams.set('reason', 'deactivated');
  }
  const res = NextResponse.redirect(loginUrl, { status: reason ? 302 : 303 });
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
