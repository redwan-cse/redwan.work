'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { replyToTicketAction } from '@/lib/crm/admin-actions';

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const state = await replyToTicketAction(ticketId, {}, formData);
      if (state.error) {
        setError(state.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="reply-body">Reply</Label>
        <Textarea
          id="reply-body"
          name="body"
          rows={5}
          maxLength={10000}
          required
          placeholder="Write a reply…"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  );
}
