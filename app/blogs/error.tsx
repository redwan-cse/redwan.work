'use client';

import { Button } from '@/components/ui/button';

export default function BlogsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h2 className="text-2xl font-bold tracking-tight">Unable to load articles</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        We encountered a temporary issue loading blog content. Please try again.
      </p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
