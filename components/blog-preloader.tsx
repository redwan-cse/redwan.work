'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';

const PRELOAD_COOLDOWN_MS = 45_000;
const preloadedPages = new Map<number, number>();

interface NetworkInformationLike {
  saveData?: boolean;
}

function shouldSkipPreload(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return Boolean(conn?.saveData);
}

/**
 * Quietly warms /blogs in the background during browser idle time after initial page load:
 * - On non-blog public pages: preloads /blogs Page 1 and warms the serverless Blogger cache.
 * - On /blogs?page=N: when passed `nextPage`, preloads page N + 1 so pagination feels instant.
 * Real-time Blogger updates are preserved via dynamic routes and server stale-while-revalidate.
 */
export function BlogPreloader({ nextPage = null }: { nextPage?: number | null }) {
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    if (shouldSkipPreload()) return;

    const isBlogsRoute = pathname === '/blogs';
    const targetPage = isBlogsRoute ? nextPage : 1;
    if (!targetPage || targetPage < 1) return;

    // On /blogs, let the route's own explicit BlogPreloader(nextPage) trigger the next page preload
    if (isBlogsRoute && nextPage === null) return;

    const lastWarmAt = preloadedPages.get(targetPage) ?? 0;
    if (Date.now() - lastWarmAt < PRELOAD_COOLDOWN_MS) return;

    let cancelled = false;
    let idleId: number | undefined;
    let timerId: number | undefined;
    const controller = new AbortController();
    const targetHref = targetPage === 1 ? '/blogs' : `/blogs?page=${targetPage}`;

    const runPreload = async () => {
      if (cancelled) return;
      preloadedPages.set(targetPage, Date.now());
      router.prefetch(targetHref);
      try {
        const res = await fetch(`/api/blogs/preload?page=${targetPage}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        await res.arrayBuffer();
      } catch {
        // Ignore abort or background preload errors
      }
    };

    const scheduleIdlePreload = () => {
      if (cancelled) return;
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof win.requestIdleCallback === 'function') {
        idleId = win.requestIdleCallback(() => {
          void runPreload();
        }, { timeout: 2000 });
      } else {
        timerId = window.setTimeout(() => {
          void runPreload();
        }, isBlogsRoute ? 600 : 1200);
      }
    };

    const onLoad = () => scheduleIdlePreload();
    if (document.readyState === 'complete') {
      scheduleIdlePreload();
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', onLoad);
      controller.abort();
      const win = window as Window & {
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleId !== undefined) {
        win.cancelIdleCallback?.(idleId);
      }
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [pathname, nextPage, router]);

  return null;
}
