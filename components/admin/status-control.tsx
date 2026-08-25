'use client';

import { useState, useTransition } from 'react';
import type { TicketStatus } from '@/lib/crm/tickets';
import { setTicketStatusAction } from '@/lib/crm/admin-actions';

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'awaiting_client', label: 'Awaiting client' },
  { value: 'closed', label: 'Closed' },
];

export function StatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: TicketStatus;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    setError(null);
    startTransition(async () => {
      const state = await setTicketStatusAction(ticketId, value);
      if (state.error) setError(state.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <select
        aria-label="Set ticket status"
        key={status}
        defaultValue={status}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
