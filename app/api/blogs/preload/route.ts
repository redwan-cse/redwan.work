import { NextRequest, NextResponse } from 'next/server';
import {
  BLOG_FIRST_PAGE_COUNT,
  BLOG_GRID_PER_PAGE,
  getBlogPaginationMeta,
  getBlogPostsPage,
} from '@/lib/blogger';

export const dynamic = 'force-dynamic';

const MAX_PRELOAD_PAGE = 50;

export async function GET(request: NextRequest) {
  const rawPage = request.nextUrl.searchParams.get('page');
  const parsed = rawPage === null ? 1 : Number(rawPage);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PRELOAD_PAGE) {
    return NextResponse.json(
      { ok: false, error: 'Invalid page parameter' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  }

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
    {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  );
}
