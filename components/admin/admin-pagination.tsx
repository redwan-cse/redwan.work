import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const DEFAULT_ADMIN_PAGE_SIZE = 25;

export function paginateItems<T>(
  items: T[],
  rawPage: string | number | undefined,
  pageSize = DEFAULT_ADMIN_PAGE_SIZE
): {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
} {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const parsed = Number.parseInt(String(rawPage ?? '1'), 10);
  const page = Number.isFinite(parsed) ? Math.min(Math.max(1, parsed), totalPages) : 1;
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(totalItems, startIndex + pageSize);
  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}

export function AdminPagination({
  basePath,
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  query = {},
}: {
  basePath: string;
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  query?: Record<string, string | undefined>;
}) {
  if (totalItems === 0 || totalPages <= 1) return null;

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
      <span className="font-mono">
        Showing {startIndex + 1}–{endIndex} of {totalItems} · Page {page}/{totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-xs">
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled className="h-7 gap-1 px-2.5 text-xs">
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
        )}
        {page < totalPages ? (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-xs">
            <Link href={buildHref(page + 1)}>
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled className="h-7 gap-1 px-2.5 text-xs">
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
