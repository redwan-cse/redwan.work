'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCROLL_THRESHOLD_PX = 350;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncVisibility = () => {
      setVisible(window.scrollY > SCROLL_THRESHOLD_PX);
    };

    syncVisibility();
    window.addEventListener('scroll', syncVisibility, { passive: true });
    return () => window.removeEventListener('scroll', syncVisibility);
  }, []);

  const scrollToTop = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        'print:hidden fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-card/90 text-foreground shadow-lg backdrop-blur-md transition-[opacity,transform,border-color,color,box-shadow] duration-300 sm:h-12 sm:w-12',
        'hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary hover:shadow-xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-3 opacity-0 pointer-events-none'
      )}
    >
      <ArrowUp className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
    </button>
  );
}
