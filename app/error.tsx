'use client';

import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // This root boundary replaces nested layouts. Keep it neutral and do not
  // expose exception messages or assume a user's workspace role.
  return (
    <main className="container flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <h2 className="text-3xl font-bold">Something went wrong</h2>
      <p className="max-w-md text-muted-foreground">
        An unexpected error occurred while loading this page. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
