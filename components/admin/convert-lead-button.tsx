'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';
import { convertLeadAction } from '@/lib/crm/admin-actions';

export function ConvertLeadButton({ leadId, label }: { leadId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConvert() {
    setError(null);
    startTransition(async () => {
      const state = await convertLeadAction(leadId);
      if (state.error) {
        setError(state.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <UserPlus className="size-3.5" /> Convert
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Convert lead to client</DialogTitle>
          <DialogDescription>
            We will email <span className="font-medium">{label}</span> an invitation to set a
            password, create their portal account, and mark the lead as won.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConvert} disabled={pending}>
            {pending ? 'Converting…' : 'Convert & invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
