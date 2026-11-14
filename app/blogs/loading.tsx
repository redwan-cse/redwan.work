import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function BlogsLoading() {
  return (
    <div className="flex flex-col" role="status" aria-live="polite" aria-label="Loading blog articles">
      {/* Hero Header */}
      <section className="relative overflow-hidden border-b border-border/70 py-16 md:py-20">
        <div className="container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              SYNCING LIVE DISPATCHES FROM BLOGS.REDWAN.WORK
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Security Research &amp; Engineering Dispatch
            </h1>
            <p className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-2 text-sm text-muted-foreground sm:text-base">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <span>Fetching the latest security writeups and research articles in real time...</span>
            </p>
          </div>
        </div>
      </section>

      {/* Main Content Skeleton */}
      <section className="py-14">
        <div className="container space-y-10">
          {/* Search & Label Toolbar Skeleton */}
          <div className="space-y-4 rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5">
            <div className="h-11 w-full animate-pulse rounded-xl bg-muted/70" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 w-24 animate-pulse rounded-full bg-muted/60"
                />
              ))}
            </div>
          </div>

          {/* Featured Dispatch Skeleton */}
          <div className="grid overflow-hidden rounded-2xl border border-border/80 bg-card/85 md:grid-cols-12">
            <div className="min-h-[260px] animate-pulse bg-muted/70 md:col-span-6 lg:col-span-7" />
            <div className="flex flex-col justify-center space-y-4 p-7 md:col-span-6 lg:col-span-5 lg:p-10">
              <div className="h-4 w-36 animate-pulse rounded bg-muted/70" />
              <div className="h-8 w-5/6 animate-pulse rounded bg-muted/80" />
              <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted/60" />
              <div className="flex gap-2.5 pt-2">
                <div className="h-10 w-36 animate-pulse rounded-full bg-muted/80" />
                <div className="h-10 w-36 animate-pulse rounded-full bg-muted/60" />
              </div>
            </div>
          </div>

          {/* 9-Card Grid Skeleton */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/85"
              >
                <div className="aspect-[16/9] w-full animate-pulse bg-muted/70" />
                <div className="space-y-3 p-5">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-muted/60" />
                  <div className="h-6 w-11/12 animate-pulse rounded bg-muted/80" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
                  <div className="flex justify-between border-t border-border/60 pt-3">
                    <div className="h-8 w-24 animate-pulse rounded-full bg-muted/60" />
                    <div className="h-8 w-24 animate-pulse rounded-full bg-muted/60" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
