import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem } from '@/components/motion/reveal';
import { BlogBrowser, type EnrichedBlogPost } from '@/components/blog-browser';
import {
  extractExcerpt,
  extractFirstImage,
  getBlogPostsPage,
  stripHtmlToPlainText,
} from '@/lib/blogger';
import { buildPublicMetadata } from '@/lib/seo/metadata';

const POSTS_PER_PAGE = 9;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawPage = params.page;
  const parsedPage = rawPage !== undefined ? Number(rawPage) : 1;
  const isPositiveInt = Number.isSafeInteger(parsedPage) && parsedPage > 0;

  const { totalItems } = await getBlogPostsPage(1, POSTS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(totalItems / POSTS_PER_PAGE));

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
  } = await getBlogPostsPage(currentPage, POSTS_PER_PAGE);

  const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + allPosts.length;

  const enrichedPosts: EnrichedBlogPost[] = allPosts.map((post) => ({
    post,
    imageUrl: extractFirstImage(post.content),
    excerpt: extractExcerpt(post.content, 260),
    readingMinutes: estimateReadingMinutes(post.content),
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

          {/* Server Pagination */}
          {totalPages > 1 && (
            <div className="mt-14 flex flex-col items-center gap-4 border-t border-border/70 pt-8">
              <div className="flex items-center justify-center gap-2">
                <Button
                  asChild={currentPage !== 1}
                  variant="outline"
                  disabled={currentPage === 1}
                  className="h-9 gap-1.5 rounded-full px-4 text-xs"
                >
                  {currentPage === 1 ? (
                    <span className="flex cursor-not-allowed items-center gap-1.5">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  ) : (
                    <Link href={`/blogs?page=${currentPage - 1}`}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  )}
                </Button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    const show =
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);
                    if (
                      (pageNum === currentPage - 2 && currentPage > 3) ||
                      (pageNum === currentPage + 2 && currentPage < totalPages - 2)
                    ) {
                      return (
                        <span key={pageNum} className="px-2 text-xs text-muted-foreground">
                          •••
                        </span>
                      );
                    }
                    if (!show) return null;
                    return (
                      <Button
                        key={pageNum}
                        asChild={pageNum !== currentPage}
                        variant={pageNum === currentPage ? 'default' : 'ghost'}
                        className="h-9 w-9 rounded-full font-mono text-xs"
                      >
                        {pageNum === currentPage ? (
                          <span>{pageNum}</span>
                        ) : (
                          <Link href={`/blogs?page=${pageNum}`}>{pageNum}</Link>
                        )}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  asChild={currentPage !== totalPages}
                  variant="outline"
                  disabled={currentPage === totalPages}
                  className="h-9 gap-1.5 rounded-full px-4 text-xs"
                >
                  {currentPage === totalPages ? (
                    <span className="flex cursor-not-allowed items-center gap-1.5">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <Link href={`/blogs?page=${currentPage + 1}`}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </Button>
              </div>

              <p className="font-mono text-xs text-muted-foreground">
                {allPosts.length > 0 ? (
                  <>
                    Showing {startIndex + 1}–{Math.min(endIndex, totalPosts)} of{' '}
                    {isCapped ? `${totalPosts}+` : totalPosts} articles
                  </>
                ) : (
                  <>
                    Showing 0 of {isCapped ? `${totalPosts}+` : totalPosts} articles
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
