'use client';

import { useState, useTransition } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { createTicketAction } from '@/lib/crm/client-actions';

export function NewTicketButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const state = await createTicketAction({}, formData);
      if (state.error) setError(state.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="size-3.5" /> New ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>Describe what you need help with.</DialogDescription>
        </DialogHeader>
        <form action={onCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              name="subject"
              maxLength={200}
              required
              placeholder="Brief summary"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-body">Message</Label>
            <Textarea
              id="ticket-body"
              name="body"
              rows={5}
              maxLength={10000}
              required
              placeholder="Add details…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Creating…' : 'Create ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
