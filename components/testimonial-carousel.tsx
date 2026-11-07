'use client';

import * as React from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useReducedMotion } from 'motion/react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { SITE } from '@/lib/content/site';
import type { ApprovedClientReview } from '@/lib/cms/queries';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'VC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TestimonialCarousel({
  reviews = [],
}: {
  reviews?: ApprovedClientReview[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const plugins = React.useMemo(
    () =>
      prefersReducedMotion || reviews.length <= 1
        ? []
        : [Autoplay({ delay: 6000, stopOnInteraction: true, stopOnMouseEnter: true })],
    [prefersReducedMotion, reviews.length]
  );

  const [emblaRef] = useEmblaCarousel(
    { loop: !prefersReducedMotion && reviews.length > 2 },
    plugins
  );

  if (reviews.length === 0) {
    return (
      <Card className="mx-auto max-w-3xl border-border/80 bg-card/80">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            VERIFIED PORTAL REVIEWS ONLY
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Only authenticated reviews submitted after completed Client Portal orders (`ORD-XXXX`) and approved by clients for public attribution appear here. You can also inspect verified historical engagement history directly on Upwork and Fiverr.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
              <a href={SITE.socials.upwork} target="_blank" rel="noopener noreferrer">
                View Upwork Profile
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
              <a href={SITE.socials.fiverr} target="_blank" rel="noopener noreferrer">
                View Fiverr Profile
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full text-primary">
              <Link href="/portfolio">Browse Sanitized Case Studies</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="overflow-hidden"
      ref={emblaRef}
      data-autoplay={prefersReducedMotion || reviews.length <= 1 ? 'disabled' : 'enabled'}
    >
      <div className="flex">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="min-w-0 flex-[0_0_100%] pl-4 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]"
          >
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center gap-3.5">
                  <div
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs font-bold text-primary"
                  >
                    {initialsFromName(review.authorName)}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{review.authorName}</CardTitle>
                    <CardDescription className="truncate text-xs">
                      {review.authorRole}
                    </CardDescription>
                  </div>
                </div>
                <div
                  className="mt-2 flex"
                  role="img"
                  aria-label={`Rated ${review.rating} out of 5 stars`}
                >
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <svg
                      key={i}
                      className="h-4 w-4 fill-primary"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {review.headline && (
                  <p className="text-sm font-semibold text-foreground">{review.headline}</p>
                )}
                <p className="text-sm leading-relaxed text-muted-foreground">{review.content}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
