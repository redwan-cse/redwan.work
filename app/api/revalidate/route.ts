// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireBearer } from '@/lib/auth/bearer';
import { clearBlogCache } from '@/lib/blogger';

/**
 * API Route for On-Demand Revalidation
 *
 * Revalidates allowlisted paths after blog changes.
 *
 * Usage:
 * POST /api/revalidate?path=/blogs
 * Authorization: Bearer YOUR_REVALIDATION_SECRET
 *
 * Set REVALIDATION_SECRET in your Vercel environment variables.
 */

// Only these paths may be revalidated
const ALLOWED_PATHS = new Set(['/blogs']);

function isAuthorized(request: NextRequest): boolean {
  return requireBearer(process.env.REVALIDATION_SECRET, request.headers.get('authorization'));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: 'Invalid or missing credentials' },
      { status: 401 }
    );
  }

  const path = request.nextUrl.searchParams.get('path') || '/blogs';

  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json(
      { message: `Path not allowed. Allowed paths: ${Array.from(ALLOWED_PATHS).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    revalidatePath(path);
    // Also drop the in-process Blogger TTL cache so the next render
    // fetches fresh data even before Next's data cache revalidates
    clearBlogCache();

    return NextResponse.json({
      revalidated: true,
      path,
      now: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { message: 'Error revalidating', error: String(err) },
      { status: 500 }
    );
  }
}
