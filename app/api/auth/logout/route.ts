import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Same-origin check (mirrors the contact API convention), enforced on POST
  // only: browsers always send an Origin on form posts, so a cross-origin or
  // Origin-less POST is rejected with 403. GET skips the check entirely — it
  // exists solely for the proxy's deactivated-client bounce, which arrives as
  // a top-level browser GET navigation carrying no Origin header.
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
