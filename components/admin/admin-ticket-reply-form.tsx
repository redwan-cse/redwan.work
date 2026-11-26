'use client';

import { useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { R2FileUploader } from '@/components/panel/r2-file-uploader';
import { Button } from '@/components/ui/button';
import { FormCheckbox } from '@/components/ui/form-checkbox';
import { Textarea } from '@/components/ui/textarea';
import { replyTicketAction } from '@/lib/crm/actions';

export function AdminTicketReplyForm({
  ticketId,
  clientId,
}: {
  ticketId: string;
  clientId: string;
}) {
  const [isInternalNote, setIsInternalNote] = useState(false);

  return (
    <ActionFeedbackForm
      action={replyTicketAction}
      successMessage={isInternalNote ? 'Internal note posted.' : 'Ticket reply posted.'}
      resetOnSuccess
      className="space-y-3 border-t border-border/70 pt-4"
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Textarea
        name="body"
        aria-label="Ticket reply or internal note"
        required
        rows={4}
        placeholder={
          isInternalNote
            ? 'Write a private internal admin note (never visible to client)...'
            : 'Write a reply to the client or an internal note...'
        }
      />
      {isInternalNote ? (
        <div
          role="note"
          className="flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Attachments are disabled on internal admin notes to prevent client vault exposure.
          </span>
        </div>
      ) : (
        <R2FileUploader
          category="ticket_attachment"
          clientId={clientId}
          label="Attach Evidence / Patch Archive (Optional)"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <FormCheckbox
            name="is_internal_note"
            checked={isInternalNote}
            onChange={(e) => setIsInternalNote(e.target.checked)}
          />
          Internal Admin Note (Hidden from Client)
        </label>
        <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-full px-4">
          <Send className="h-3.5 w-3.5" />
          {isInternalNote ? 'Post Internal Note' : 'Send Reply'}
        </Button>
      </div>
    </ActionFeedbackForm>
  );
}
