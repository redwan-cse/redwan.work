'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionFeedbackFormProps {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}

function isNextRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

export function ActionFeedbackForm({
  action,
  className,
  successMessage,
  resetOnSuccess = false,
  children,
}: ActionFeedbackFormProps) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = React.useTransition();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [doneMessage, setDoneMessage] = React.useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrorMessage(null);
    setDoneMessage(null);

    startTransition(async () => {
      try {
        await action(formData);
        if (resetOnSuccess) {
          formRef.current?.reset();
        }
        const okText = successMessage || 'Saved successfully.';
        setDoneMessage(okText);
        if (successMessage) {
          toast.success(successMessage);
        }
      } catch (err) {
        if (isNextRedirectError(err)) {
          return;
        }
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to complete action. Check inputs and try again.';
        setErrorMessage(message);
        toast.error(message);
      }
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={cn(className)}
    >
      <fieldset disabled={isPending} className="contents">
        {children}
      </fieldset>

      {isPending && (
        <div
          aria-live="polite"
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-primary"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Processing request...
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {doneMessage && !errorMessage && successMessage && (
        <div
          role="status"
          className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{doneMessage}</span>
        </div>
      )}
    </form>
  );
}
