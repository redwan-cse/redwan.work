// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
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
  const expected = process.env.REVALIDATION_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  const provided = Buffer.from(match[1], 'utf-8');
  const secret = Buffer.from(expected, 'utf-8');

  // timingSafeEqual requires equal-length buffers; lengths alone leak
  // nothing useful here, and unequal length short-circuits safely
  return provided.length === secret.length && timingSafeEqual(provided, secret);
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
