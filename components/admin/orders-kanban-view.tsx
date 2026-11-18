import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
    id: 'done',
    label: 'Delivered / Closed',
    statuses: new Set(['delivered', 'completed', 'on_hold', 'cancelled']),
  },
];

export function OrdersKanbanBoard({ orders }: { orders: OrderBoardItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
