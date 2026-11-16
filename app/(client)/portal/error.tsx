'use client';

import { Button } from '@/components/ui/button';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h2 className="text-2xl font-bold tracking-tight">Unable to load portal view</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred while loading your Client Portal workspace. Please try again.
      </p>
      {error?.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Reference ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} size="sm" className="rounded-full">
        Retry
      </Button>
    </div>
  );
}
