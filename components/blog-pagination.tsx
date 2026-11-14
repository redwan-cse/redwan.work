'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalPosts: number;
  visibleCount: number;
  isCapped?: boolean;
}

export function BlogPagination({
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  totalPosts,
  visibleCount,
  isCapped,
}: BlogPaginationProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [targetPage, setTargetPage] = React.useState<number | null>(null);

  const navigateToPage = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    nextPage: number
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setTargetPage(nextPage);
    startTransition(() => {
      router.push(href);
    });
  };

  if (totalPages <= 1) {
    return null;
  }

  const activeTargetPage = isPending && targetPage !== currentPage ? targetPage : null;
  const isLoading = activeTargetPage !== null;

  return (
    <div className="mt-14 flex flex-col items-center gap-4 border-t border-border/70 pt-8">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          asChild={currentPage !== 1}
          variant="outline"
          disabled={currentPage === 1 || isLoading}
          className="h-9 gap-1.5 rounded-full px-4 text-xs"
        >
          {currentPage === 1 ? (
            <span className="flex cursor-not-allowed items-center gap-1.5">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </span>
          ) : (
            <Link
              href={currentPage === 2 ? '/blogs' : `/blogs?page=${currentPage - 1}`}
              onClick={(e) =>
                navigateToPage(
                  e,
                  currentPage === 2 ? '/blogs' : `/blogs?page=${currentPage - 1}`,
                  currentPage - 1
                )
              }
            >
              {isLoading && activeTargetPage === currentPage - 1 ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              )}
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
            const href = pageNum === 1 ? '/blogs' : `/blogs?page=${pageNum}`;
            return (
              <Button
                key={pageNum}
                asChild={pageNum !== currentPage}
                variant={pageNum === currentPage ? 'default' : 'ghost'}
                disabled={isLoading && pageNum !== currentPage}
                className="h-9 w-9 rounded-full font-mono text-xs"
              >
                {pageNum === currentPage ? (
                  <span>{pageNum}</span>
                ) : (
                  <Link href={href} onClick={(e) => navigateToPage(e, href, pageNum)}>
                    {isLoading && activeTargetPage === pageNum ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label={`Loading page ${pageNum}`} />
                    ) : (
                      pageNum
                    )}
                  </Link>
                )}
              </Button>
            );
          })}
        </div>

        <Button
          asChild={currentPage !== totalPages}
          variant="outline"
          disabled={currentPage === totalPages || isLoading}
          className="h-9 gap-1.5 rounded-full px-4 text-xs"
        >
          {currentPage === totalPages ? (
            <span className="flex cursor-not-allowed items-center gap-1.5">
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <Link
              href={`/blogs?page=${currentPage + 1}`}
              onClick={(e) =>
                navigateToPage(e, `/blogs?page=${currentPage + 1}`, currentPage + 1)
              }
            >
              Next
              {isLoading && activeTargetPage === currentPage + 1 ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </Link>
          )}
        </Button>
      </div>

      {isLoading ? (
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-primary" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span>Loading page {activeTargetPage} from blogs.redwan.work...</span>
        </p>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">
          {visibleCount > 0 ? (
            <>
              Showing {startIndex + 1}–{Math.min(endIndex, totalPosts)} of{' '}
              {isCapped ? `${totalPosts}+` : totalPosts} articles
            </>
          ) : (
            <>Showing 0 of {isCapped ? `${totalPosts}+` : totalPosts} articles</>
          )}
        </p>
      )}
    </div>
  );
}
