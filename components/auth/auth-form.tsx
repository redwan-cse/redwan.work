'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export function FormMessage({
  state,
}: {
  state: { error?: string; notice?: string; linkHref?: string; linkText?: string };
}) {
  if (!state.error && !state.notice) return null;
  return (
    <div
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        state.error
          ? 'border-destructive/50 text-destructive'
          : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
      )}
    >
      <p>{state.error ?? state.notice}</p>
      {state.linkHref && state.linkText && (
        <p className="mt-1.5 text-xs">
          <Link
            href={state.linkHref}
            className="underline underline-offset-2 font-medium hover:opacity-80"
          >
            {state.linkText}
          </Link>
        </p>
      )}
    </div>
  );
}
