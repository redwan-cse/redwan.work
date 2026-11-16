import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Same-origin check (enforced strictly on POST, and GET is restricted solely
  // to top-level document navigations for proxy's deactivated-client bounce so
  // cross-site subresource tags like <img src="/api/auth/logout"> return 403).
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    const allowed = new Set([request.nextUrl.origin, 'https://redwan.work']);
    const originOk =
      origin !== null &&
      (() => {
        try {
          return allowed.has(new URL(origin).origin);
        } catch {
          return false;
        }
      })();
    if (!originOk) {
      return NextResponse.json({ error: 'Request origin not allowed' }, { status: 403 });
    }
  } else if (request.method === 'GET') {
    const secFetchSite = request.headers.get('sec-fetch-site') ?? '';
    const secFetchDest = request.headers.get('sec-fetch-dest') ?? '';
    const secFetchMode = request.headers.get('sec-fetch-mode') ?? '';
    const reason = request.nextUrl.searchParams.get('reason');
    if (
      secFetchSite === 'cross-site' ||
      (secFetchDest && secFetchDest !== 'document') ||
      (secFetchMode && secFetchMode !== 'navigate') ||
      reason !== 'deactivated'
    ) {
      return NextResponse.json(
        { error: 'Method Not Allowed. Use POST /api/auth/logout.' },
        { status: 403 }
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const reason = request.nextUrl.searchParams.get('reason');
  const loginUrl = new URL('/login', request.url);
  if (reason === 'deactivated') {
    loginUrl.searchParams.set('reason', 'deactivated');
  }
  return NextResponse.redirect(loginUrl, { status: reason ? 302 : 303 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
