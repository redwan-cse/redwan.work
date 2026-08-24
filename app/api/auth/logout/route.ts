import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Same-origin check (mirrors the contact API convention). POST must carry an
  // Origin (browsers always send one on form posts); GET is exempt because it
  // only serves the proxy's own deactivated-client bounce.
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
