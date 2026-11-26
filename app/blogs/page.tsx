import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem } from '@/components/motion/reveal';
import { BlogBrowser, type EnrichedBlogPost } from '@/components/blog-browser';
import { BlogPagination } from '@/components/blog-pagination';
import {
  BLOG_FIRST_PAGE_COUNT,
  BLOG_GRID_PER_PAGE,
  extractBlogToc,
  extractFirstImage,
  getBlogPaginationMeta,
  getBlogPostsPage,
  stripHtmlToPlainText,
} from '@/lib/blogger';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import {
  buildBlogsArchiveJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo/structured-data';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawPage = params.page;
  const parsedPage = rawPage !== undefined && rawPage.trim() !== '' ? Number(rawPage) : 1;
  const isPositiveInt = Number.isSafeInteger(parsedPage) && parsedPage > 0;

  const targetPage = isPositiveInt ? parsedPage : 1;
  const { totalItems } = await getBlogPostsPage(
    targetPage,
    BLOG_GRID_PER_PAGE,
    BLOG_FIRST_PAGE_COUNT
  );
  const { totalPages } = getBlogPaginationMeta(totalItems, targetPage);

  const isInvalidOrOutOfRange =
    rawPage !== undefined && (!isPositiveInt || parsedPage > totalPages);

  if (isInvalidOrOutOfRange) {
    notFound();
  }

  const canonicalPath = parsedPage > 1 ? `/blogs?page=${parsedPage}` : '/blogs';
  const title =
    parsedPage > 1
      ? `Security & Engineering Blog (Page ${parsedPage})`
      : 'Security & Engineering Blog';

  return buildPublicMetadata({
    title,
    description:
      'Cybersecurity research, offensive security writeups, Wazuh SIEM guides, and full-stack engineering articles by Md. Redwan Ahmed.',
    path: canonicalPath,
  });
}

function estimateReadingMinutesFromPlainText(plain: string): number {
  const words = plain ? plain.split(/\s+/).length : 0;
  return Math.max(2, Math.ceil(words / 200));
}

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const rawPage = params.page;
  const parsedPage = rawPage !== undefined && rawPage.trim() !== '' ? Number(rawPage) : 1;
  const isPositiveInt = Number.isSafeInteger(parsedPage) && parsedPage > 0;

  // Consolidate duplicate ?page=1 into canonical /blogs with HTTP 308
  if (rawPage !== undefined && isPositiveInt && parsedPage === 1) {
    permanentRedirect('/blogs');
  }

  // Reject malformed ?page=0, ?page=abc, ?page= before fetching
  if (rawPage !== undefined && !isPositiveInt) {
    notFound();
  }

  const currentPage = isPositiveInt ? parsedPage : 1;

  const {
    posts: allPosts,
    totalItems: totalPosts,
    isCapped,
  } = await getBlogPostsPage(currentPage, BLOG_GRID_PER_PAGE, BLOG_FIRST_PAGE_COUNT);

  const { totalPages, startIndex } = getBlogPaginationMeta(totalPosts, currentPage);

  // Return true HTTP 404 (not soft-404 HTTP 200) for out-of-range pagination
  if (rawPage !== undefined && currentPage > totalPages) {
    notFound();
  }

  const endIndex = startIndex + allPosts.length;

  // Strip content and precomputed metadata before crossing the RSC -> Client boundary,
  // reusing the compact metadata computed before Next.js Data Cache storage.
  const enrichedPosts: EnrichedBlogPost[] = allPosts.map((post) => {
    const { content, ...postSummary } = post;
    const { imageUrl, excerpt, readingMinutes, toc } = postSummary;
    delete postSummary.imageUrl;
    delete postSummary.excerpt;
    delete postSummary.readingMinutes;
    delete postSummary.toc;
    const plain =
      excerpt !== undefined && readingMinutes !== undefined ? null : stripHtmlToPlainText(content);
    const resolvedExcerpt =
      excerpt ?? (plain && plain.length > 240 ? `${plain.slice(0, 240)}...` : plain ?? '');
    return {
      post: postSummary,
      imageUrl: imageUrl ?? extractFirstImage(content),
      excerpt: resolvedExcerpt,
      readingMinutes: readingMinutes ?? estimateReadingMinutesFromPlainText(plain ?? ''),
      toc: toc ?? extractBlogToc(content),
    };
  });

  const structuredData = [
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      {
        name: currentPage > 1 ? `Blogs (Page ${currentPage})` : 'Blogs',
        path: currentPage > 1 ? `/blogs?page=${currentPage}` : '/blogs',
      },
    ]),
    buildBlogsArchiveJsonLd(allPosts, currentPage),
  ];

  return (
    <div className="flex flex-col">
      {structuredData.map((schema, index) => (
        <script
          key={`blogs-schema-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}
      {/* Antigravity Hero Header */}
      <section className="relative overflow-hidden border-b border-border/70 py-16 md:py-20">
        <AntigravityHeroField />
        <div className="container relative z-10">
          <HeroReveal className="mx-auto max-w-3xl text-center">
            <HeroRevealItem>
              <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                {isCapped ? `${totalPosts}+ PUBLISHED ARTICLES` : `${totalPosts} PUBLISHED ARTICLES`}
              </Badge>
            </HeroRevealItem>
            <HeroRevealItem>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Security Research &amp; Engineering Dispatch
              </h1>
            </HeroRevealItem>
            <HeroRevealItem>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Deep-dive articles on penetration testing, OSINT investigations, Linux &amp; SIEM engineering, and modern software architecture—synced live from{' '}
                <a
                  href="https://blogs.redwan.work"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
                >
                  blogs.redwan.work
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                .
              </p>
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-14">
        <div className="container">
          <BlogBrowser items={enrichedPosts} currentPage={currentPage} />

          {/* Server Pagination with Instant Transition Feedback */}
          <BlogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalPosts={totalPosts}
            visibleCount={allPosts.length}
            isCapped={isCapped}
          />
        </div>
      </section>
    </div>
  );
}
