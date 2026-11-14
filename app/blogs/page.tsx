import type { Metadata } from 'next';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem } from '@/components/motion/reveal';
import { BlogBrowser, type EnrichedBlogPost } from '@/components/blog-browser';
import { BlogPagination } from '@/components/blog-pagination';
import { BlogPreloader } from '@/components/blog-preloader';
import {
  BLOG_FIRST_PAGE_COUNT,
  BLOG_GRID_PER_PAGE,
  extractBlogToc,
  extractExcerpt,
  extractFirstImage,
  getBlogPaginationMeta,
  getBlogPostsPage,
  stripHtmlToPlainText,
} from '@/lib/blogger';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawPage = params.page;
  const parsedPage = rawPage !== undefined ? Number(rawPage) : 1;
  const isPositiveInt = Number.isSafeInteger(parsedPage) && parsedPage > 0;

  const { totalItems } = await getBlogPostsPage(
    1,
    BLOG_GRID_PER_PAGE,
    BLOG_FIRST_PAGE_COUNT
  );
  const { totalPages } = getBlogPaginationMeta(totalItems, 1);

  const isInvalidOrOutOfRange =
    rawPage !== undefined && (!isPositiveInt || parsedPage > totalPages);

  if (isInvalidOrOutOfRange) {
    return buildPublicMetadata({
      title: 'Security & Engineering Blog — Md. Redwan Ahmed',
      description:
        'Cybersecurity research, offensive security writeups, Wazuh SIEM guides, and full-stack engineering articles by Md. Redwan Ahmed.',
      path: '/blogs',
      noindex: true,
    });
  }

  const canonicalPath = parsedPage > 1 ? `/blogs?page=${parsedPage}` : '/blogs';
  const title =
    parsedPage > 1
      ? `Security & Engineering Blog (Page ${parsedPage}) — Insights by Md. Redwan Ahmed`
      : 'Security & Engineering Blog — Insights by Md. Redwan Ahmed';

  return buildPublicMetadata({
    title,
    description:
      'Cybersecurity research, offensive security writeups, Wazuh SIEM guides, and full-stack engineering articles by Md. Redwan Ahmed.',
    path: canonicalPath,
  });
}

function estimateReadingMinutes(html: string): number {
  const plain = stripHtmlToPlainText(html);
  const words = plain ? plain.split(/\s+/).length : 0;
  return Math.max(2, Math.ceil(words / 200));
}

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.page);
  const currentPage =
    Number.isSafeInteger(requested) && requested > 0 ? requested : 1;

  const {
    posts: allPosts,
    totalItems: totalPosts,
    isCapped,
  } = await getBlogPostsPage(currentPage, BLOG_GRID_PER_PAGE, BLOG_FIRST_PAGE_COUNT);

  const { totalPages, startIndex } = getBlogPaginationMeta(totalPosts, currentPage);
  const endIndex = startIndex + allPosts.length;

  const enrichedPosts: EnrichedBlogPost[] = allPosts.map((post) => ({
    post,
    imageUrl: extractFirstImage(post.content),
    excerpt: extractExcerpt(post.content, 240),
    readingMinutes: estimateReadingMinutes(post.content),
    toc: extractBlogToc(post.content),
  }));

  return (
    <div className="flex flex-col">
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
          <BlogPreloader nextPage={currentPage < totalPages ? currentPage + 1 : null} />
        </div>
      </section>
    </div>
  );
}
