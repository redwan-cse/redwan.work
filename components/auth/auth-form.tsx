'use client';

import { cn } from '@/lib/utils';

export function FormMessage({ state }: { state: { error?: string; notice?: string } }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        state.error
          ? 'border-destructive/50 text-destructive'
          : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
      )}
    >
      {state.error ?? state.notice}
    </p>
  );
}
