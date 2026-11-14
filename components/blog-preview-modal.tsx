'use client';

import { useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, Clock, ExternalLink, ListTree, Tag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isDirectBlogImage } from '@/lib/blog-image-policy';
import type { BlogPost, BlogTocItem } from '@/lib/blogger';
import { sanitizeHttpUrl } from '@/lib/security/safe-redirect';
import { cn } from '@/lib/utils';

interface BlogPreviewModalProps {
  post: BlogPost;
  imageUrl: string;
  excerpt: string;
  readingMinutes?: number;
  toc?: BlogTocItem[];
  children: React.ReactNode;
}

function numberTocItems(toc: BlogTocItem[]) {
  let sectionNum = 0;
  return toc.map((item) => {
    if (item.level === 2) {
      sectionNum += 1;
      return { item, prefix: String(sectionNum).padStart(2, '0') };
    }
    return { item, prefix: null };
  });
}

export function BlogPreviewModal({
  post,
  imageUrl,
  excerpt,
  readingMinutes,
  toc = [],
  children,
}: BlogPreviewModalProps) {
  const [open, setOpen] = useState(false);
  const safePostUrl = sanitizeHttpUrl(post.url) ?? 'https://blogs.redwan.work';
  const numberedToc = numberTocItems(toc);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden border border-border/80 shadow-2xl">
        <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
          <Image
            src={imageUrl}
            alt={post.title}
            fill
            unoptimized={isDirectBlogImage(imageUrl)}
            className="object-cover"
            priority
          />
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <DialogHeader className="space-y-3 text-left">
            <DialogTitle className="text-xl font-bold leading-tight sm:text-2xl">
              {post.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Article summary and table of contents preview for {post.title}
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <time>{formatDistanceToNow(new Date(post.published), { addSuffix: true })}</time>
              </div>
              {readingMinutes ? (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{readingMinutes} min read</span>
                </div>
              ) : null}
              {post.labels && post.labels.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-primary" />
                  {post.labels.slice(0, 3).map((label) => (
                    <Badge key={label} variant="secondary" className="text-xs">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </DialogHeader>

          {toc.length === 0 && excerpt && (
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {excerpt.length > 220 ? `${excerpt.slice(0, 220).trimEnd()}...` : excerpt}
            </p>
          )}

          {toc.length > 0 && (
            <div className="rounded-xl border border-border/80 bg-muted/35 p-4">
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                  <ListTree className="h-4 w-4 text-primary" />
                  <span>Table of Contents</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {toc.length} {toc.length === 1 ? 'section' : 'sections'}
                </span>
              </div>
              <nav aria-label="Article table of contents">
                <ol className="max-h-64 space-y-1 overflow-y-auto pr-1 text-sm sm:max-h-72">
                  {numberedToc.map(({ item, prefix }, idx) => {
                    const sectionHref = item.id
                      ? `${safePostUrl}#${encodeURIComponent(item.id)}`
                      : safePostUrl;

                    return (
                      <li key={`${item.id}-${idx}`}>
                        <a
                          href={sectionHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'group flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-background/80 hover:text-primary',
                            item.level === 3
                              ? 'pl-7 text-xs text-muted-foreground'
                              : 'font-medium text-foreground/90'
                          )}
                        >
                          {prefix ? (
                            <span className="w-5 shrink-0 font-mono text-xs font-semibold text-primary">
                              {prefix}
                            </span>
                          ) : (
                            <span
                              className="w-3 shrink-0 font-mono text-xs text-muted-foreground/70"
                              aria-hidden="true"
                            >
                              —
                            </span>
                          )}
                          <span className="flex-1 leading-snug">{item.text}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button asChild className="h-11 flex-1" size="lg">
              <a
                href={safePostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2"
              >
                Read Full Article
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-6"
              size="lg"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
