import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/lib/crm/tickets';
import type { ProjectStatus } from '@/lib/crm/projects';
import type { EmailDelivery } from '@/lib/crm/email-log';

// Canonical status-badge maps. Later tasks replace the identical inline
// copies in admin/portal pages with these shared components (RSC-safe).

export const TICKET_STATUS_LABELS = {
  open: 'Open',
  answered: 'Answered',
  awaiting_client: 'Awaiting client',
  closed: 'Closed',
} as const;

const TICKET_BADGE: Record<TicketStatus, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  answered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  awaiting_client: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  closed: 'bg-muted text-muted-foreground',
};

const PROJECT_BADGE: Record<ProjectStatus, string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

const LEAD_BADGE: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  contacted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  won: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  lost: 'bg-muted text-muted-foreground',
};

export const DELIVERY_LABELS: Record<EmailDelivery, string> = {
  confirmed: 'Sent',
  handoff: 'Handed off',
  unconfirmed: 'Unconfirmed',
  failed: 'Failed',
};

const DELIVERY_BADGE: Record<EmailDelivery, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  handoff: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  unconfirmed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(TICKET_BADGE[status], className)}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(PROJECT_BADGE[status] ?? '', className)}>
      {status}
    </Badge>
  );
}

export function LeadStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(LEAD_BADGE[status] ?? '', className)}>
      {status}
    </Badge>
  );
}

export function DeliveryBadge({
  delivery,
  className,
}: {
  delivery: EmailDelivery;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(DELIVERY_BADGE[delivery], className)}>
      {DELIVERY_LABELS[delivery]}
    </Badge>
  );
}
