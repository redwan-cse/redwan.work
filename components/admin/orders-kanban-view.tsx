import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { updateOrderStatusAndProgressAction } from '@/lib/crm/actions';
import { formatMoney } from '@/lib/format';

interface OrderBoardItem {
  id: string;
  code: string;
  title: string;
  pillar: string;
  status: string;
  progress_percent: number;
  requires_roe: boolean;
  roe_signed_at: string | null;
  total_cents: number;
  currency: string;
  clientName: string;
}

const KANBAN_COLUMNS = [
  {
    id: 'intake',
    label: 'Payment & Intake',
    statuses: new Set(['awaiting_payment', 'pending_requirements']),
  },
  {
    id: 'queued',
    label: 'Queued / Ready',
    statuses: new Set(['queued']),
  },
  {
    id: 'active',
    label: 'In Execution',
    statuses: new Set(['in_progress']),
  },
  {
    id: 'review',
    label: 'Review & Revisions',
    statuses: new Set(['in_review', 'revision_requested']),
  },
  {
    id: 'delivered',
    label: 'Delivered & Completed',
    statuses: new Set(['delivered', 'completed']),
  },
  {
    id: 'paused',
    label: 'On Hold & Cancelled',
    statuses: new Set(['on_hold', 'cancelled']),
  },
];

export function OrdersKanbanBoard({ orders }: { orders: OrderBoardItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {KANBAN_COLUMNS.map((col) => {
        const colOrders = orders.filter((o) => col.statuses.has(o.status));
        return (
          <div
            key={col.id}
            className="flex flex-col rounded-xl border border-border/80 bg-muted/25 p-2.5"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold tracking-tight">{col.label}</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {colOrders.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {colOrders.length > 0 ? (
                colOrders.map((ord) => (
                  <Card key={ord.id} className="border-border/80 bg-card transition-colors hover:border-primary/40">
                    <CardContent className="space-y-2 p-3 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <Link
                          href={`/admin/orders/${ord.id}`}
                          className="font-mono text-[11px] font-bold text-primary hover:underline"
                        >
                          {ord.code}
                        </Link>
                        <Badge variant="outline" className="font-mono text-[9px]">
                          {ord.progress_percent}%
                        </Badge>
                      </div>
                      <Link
                        href={`/admin/orders/${ord.id}`}
                        className="line-clamp-2 block font-semibold leading-snug hover:text-primary"
                      >
                        {ord.title}
                      </Link>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {ord.clientName}
                      </div>
                      <div className="flex items-center justify-between pt-1 font-mono text-[10px]">
                        <span className="font-semibold">
                          {formatMoney(ord.total_cents, ord.currency)}
                        </span>
                        {ord.requires_roe && (
                          <span
                            className={
                              ord.roe_signed_at
                                ? 'inline-flex items-center gap-0.5 text-emerald-800 dark:text-emerald-300'
                                : 'text-amber-800 dark:text-amber-300'
                            }
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {ord.roe_signed_at ? 'RoE' : 'Need RoE'}
                          </span>
                        )}
                      </div>
                      <ActionFeedbackForm
                        action={updateOrderStatusAndProgressAction}
                        successMessage="Moved stage."
                        className="flex items-center gap-1 border-t border-border/50 pt-2"
                      >
                        <input type="hidden" name="order_id" value={ord.id} />
                        <input type="hidden" name="progress_percent" value={String(ord.progress_percent)} />
                        <select
                          name="status"
                          aria-label={`Change status for ${ord.code}`}
                          defaultValue={ord.status}
                          className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 font-mono text-[10px]"
                        >
                          <option value="awaiting_payment">awaiting_payment</option>
                          <option value="pending_requirements">pending_requirements</option>
                          <option value="queued">queued</option>
                          <option value="in_progress">in_progress</option>
                          <option value="in_review">in_review</option>
                          <option value="revision_requested">revision_requested</option>
                          <option value="delivered">delivered</option>
                          <option value="completed">completed</option>
                          <option value="on_hold">on_hold</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                        <Button type="submit" size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]">
                          Move
                        </Button>
                      </ActionFeedbackForm>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground">
                  Empty stage
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
