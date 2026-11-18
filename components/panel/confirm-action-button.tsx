'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, type ButtonProps } from '@/components/ui/button';

interface ConfirmActionButtonProps {
  action: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string>;
  triggerLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel?: string;
  successMessage?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  destructive?: boolean;
  extraContent?: React.ReactNode;
}

export function ConfirmActionButton({
  action,
  hiddenFields,
  triggerLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel = 'Confirm',
  successMessage = 'Action completed.',
  variant = 'outline',
  size = 'sm',
  className,
  destructive = false,
  extraContent,
}: ConfirmActionButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const extraFormRef = React.useRef<HTMLFormElement>(null);

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    const formData = extraFormRef.current
      ? new FormData(extraFormRef.current)
      : new FormData();
    for (const [key, val] of Object.entries(hiddenFields)) {
      if (!formData.has(key)) {
        formData.set(key, val);
      }
    }

    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
        toast.success(successMessage);
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Action failed.';
        toast.error(message);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>

        {extraContent ? (
          <form ref={extraFormRef} className="space-y-3 py-1">
            {extraContent}
          </form>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
