import { NextRequest, NextResponse } from 'next/server';
import {
  BLOG_FIRST_PAGE_COUNT,
  BLOG_GRID_PER_PAGE,
  getBlogPaginationMeta,
  getBlogPostsPage,
} from '@/lib/blogger';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { resolveTrustedIp } from '@/lib/security/trusted-ip';
import { blogsPreloadQuerySchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const PRELOAD_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

const memWindow = new Map<string, number[]>();
function allowMemoryBurst(ip: string): boolean {
  const cutoff = Date.now() - 60_000;
  if (memWindow.size >= 2000) memWindow.clear();
  const recent = (memWindow.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= 30) return false;
  memWindow.set(ip, [...recent, Date.now()]);
  return true;
}

export async function GET(request: NextRequest) {
  const ip = resolveTrustedIp(request.headers);
  if (!allowMemoryBurst(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many preload requests.' },
      { status: 429, headers: PRELOAD_HEADERS }
    );
  }

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.LEAD_IP_HASH_SALT
  ) {
    try {
      const allowed = await consumeRateLimit('blogs-preload', ip, 30, 60);
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: 'Too many preload requests.' },
          { status: 429, headers: PRELOAD_HEADERS }
        );
      }
    } catch {
      // Fall back to in-memory burst cap if DB rate limiter is unavailable on read-only blog preload
    }
  }

  const rawPage = request.nextUrl.searchParams.get('page');
  const parsedResult = blogsPreloadQuerySchema.safeParse({
    page: rawPage === null ? 1 : rawPage,
  });

  if (!parsedResult.success || (rawPage !== null && !/^\d+$/.test(rawPage.trim()))) {
    return NextResponse.json(
      { ok: false, error: 'Invalid page parameter' },
      { status: 400, headers: PRELOAD_HEADERS }
    );
  }
  const parsed = parsedResult.data.page;

  const pageData = await getBlogPostsPage(
    parsed,
    BLOG_GRID_PER_PAGE,
    BLOG_FIRST_PAGE_COUNT
  );
  const { totalPages } = getBlogPaginationMeta(pageData.totalItems, parsed);

  return NextResponse.json(
    {
      ok: true,
      page: parsed,
      totalItems: pageData.totalItems,
      totalPages,
    },
    { status: 200, headers: PRELOAD_HEADERS }
  );
}
