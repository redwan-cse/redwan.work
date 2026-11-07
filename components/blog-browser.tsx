'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BlogPreviewModal } from '@/components/blog-preview-modal';
import { InteractiveCard, ScrollReveal } from '@/components/motion/reveal';
import { isDirectBlogImage } from '@/lib/blog-image-policy';
import type { BlogPost } from '@/lib/blogger';
import { cn } from '@/lib/utils';

export interface EnrichedBlogPost {
  post: BlogPost;
  imageUrl: string;
  excerpt: string;
  readingMinutes: number;
}

export function BlogBrowser({
  items,
  currentPage,
}: {
  items: EnrichedBlogPost[];
  currentPage: number;
}) {
  const [query, setQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string>('All');

  const allLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const label of item.post.labels ?? []) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label]) => label);
    return ['All', ...sorted];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(({ post, excerpt }) => {
      const matchesLabel =
        selectedLabel === 'All' || (post.labels ?? []).includes(selectedLabel);
      if (!matchesLabel) return false;
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        excerpt.toLowerCase().includes(q) ||
        (post.labels ?? []).some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [items, query, selectedLabel]);

  const showFeatured =
    currentPage === 1 && !query.trim() && selectedLabel === 'All' && filtered.length > 0;
  const featuredItem = showFeatured ? filtered[0] : null;
  const gridItems = showFeatured ? filtered.slice(1) : filtered;

  return (
    <div className="space-y-10">
      {/* Search & Label Filter Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/60 p-4 backdrop-blur-sm sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles by title, security topic, or tag..."
            className="h-11 rounded-xl border-border/80 bg-background pl-10 pr-10 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {allLabels.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allLabels.map((label) => {
              const active = selectedLabel === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedLabel(label)}
                  className={cn(
                    'relative rounded-full border px-3.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary text-primary-foreground'
                      : 'border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="blog-tag-pill"
                      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                      className="absolute inset-0 rounded-full bg-primary"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Featured Article Hero Card on Page 1 */}
      {featuredItem && (
        <ScrollReveal>
          <InteractiveCard enableTilt={false} className="overflow-hidden p-0">
            <div className="grid gap-0 lg:grid-cols-12">
              <BlogPreviewModal
                post={featuredItem.post}
                imageUrl={featuredItem.imageUrl}
                excerpt={featuredItem.excerpt}
              >
                <button
                  type="button"
                  className="relative block min-h-[260px] w-full cursor-pointer overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:col-span-6 lg:min-h-[340px]"
                >
                  <Image
                    src={featuredItem.imageUrl}
                    alt={featuredItem.post.title}
                    fill
                    priority
                    unoptimized={isDirectBlogImage(featuredItem.imageUrl)}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <Badge className="gap-1 bg-primary text-primary-foreground shadow-sm">
                      <Sparkles className="h-3 w-3" />
                      Featured Dispatch
                    </Badge>
                  </div>
                </button>
              </BlogPreviewModal>

              <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <time>
                        {formatDistanceToNow(new Date(featuredItem.post.published), {
                          addSuffix: true,
                        })}
                      </time>
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {featuredItem.readingMinutes} min read
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    <BlogPreviewModal
                      post={featuredItem.post}
                      imageUrl={featuredItem.imageUrl}
                      excerpt={featuredItem.excerpt}
                    >
                      <button
                        type="button"
                        className="cursor-pointer text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        {featuredItem.post.title}
                      </button>
                    </BlogPreviewModal>
                  </h2>

                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {featuredItem.excerpt}
                  </p>

                  {featuredItem.post.labels && featuredItem.post.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {featuredItem.post.labels.slice(0, 4).map((label) => (
                        <span
                          key={label}
                          className="rounded-md bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
                  <BlogPreviewModal
                    post={featuredItem.post}
                    imageUrl={featuredItem.imageUrl}
                    excerpt={featuredItem.excerpt}
                  >
                    <Button variant="default" size="sm" className="gap-1.5 rounded-full">
                      <BookOpen className="h-3.5 w-3.5" />
                      Quick Preview
                    </Button>
                  </BlogPreviewModal>

                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
                    <Link
                      href={featuredItem.post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read Full Article
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </InteractiveCard>
        </ScrollReveal>
      )}

      {/* Articles Grid */}
      {gridItems.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {gridItems.map(({ post, imageUrl, excerpt, readingMinutes }, index) => (
            <ScrollReveal key={post.id} delay={(index % 3) * 0.05}>
              <InteractiveCard className="flex h-full flex-col justify-between overflow-hidden p-0">
                <div>
                  <BlogPreviewModal post={post} imageUrl={imageUrl} excerpt={excerpt}>
                    <button
                      type="button"
                      className="relative block h-52 w-full cursor-pointer overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Image
                        src={imageUrl}
                        alt={post.title}
                        fill
                        unoptimized={isDirectBlogImage(imageUrl)}
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        loading={index < 3 ? 'eager' : 'lazy'}
                      />
                      {post.labels && post.labels.length > 0 && (
                        <div className="absolute top-3 right-3">
                          <Badge
                            variant="secondary"
                            className="bg-background/90 font-mono text-[11px] backdrop-blur-sm"
                          >
                            {post.labels[0]}
                          </Badge>
                        </div>
                      )}
                    </button>
                  </BlogPreviewModal>

                  <div className="p-6 pb-4">
                    <div className="mb-2.5 flex items-center justify-between font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <time>
                          {formatDistanceToNow(new Date(post.published), {
                            addSuffix: true,
                          })}
                        </time>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary" />
                        {readingMinutes}m
                      </span>
                    </div>

                    <h3 className="line-clamp-2 text-lg font-bold leading-snug">
                      <BlogPreviewModal post={post} imageUrl={imageUrl} excerpt={excerpt}>
                        <button
                          type="button"
                          className="cursor-pointer text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          {post.title}
                        </button>
                      </BlogPreviewModal>
                    </h3>

                    <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {excerpt}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-6 py-4">
                  <BlogPreviewModal post={post} imageUrl={imageUrl} excerpt={excerpt}>
                    <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs">
                      Quick Read
                    </Button>
                  </BlogPreviewModal>
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                    <Link href={post.url} target="_blank" rel="noopener noreferrer">
                      Full Post
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </InteractiveCard>
            </ScrollReveal>
          ))}
        </div>
      ) : (
        !featuredItem && (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-border/80 bg-card/40 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4 text-primary">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-xl font-bold">No Matching Articles</h3>
              <p className="text-sm text-muted-foreground">
                Try clearing your search filter or exploring another topic tag.
              </p>
            </div>
            {(query || selectedLabel !== 'All') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setQuery('');
                  setSelectedLabel('All');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
