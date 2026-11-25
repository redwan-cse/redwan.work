'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MilestoneDraft {
  title: string;
  amount_usd: string;
  due_days_offset: string;
}

export function ProposalMilestonesEditor() {
  const [enabled, setEnabled] = React.useState(false);
  const [rows, setRows] = React.useState<MilestoneDraft[]>([
    { title: 'Phase 1: Kickoff & Discovery', amount_usd: '500', due_days_offset: '5' },
    { title: 'Phase 2: Final Delivery & Handover', amount_usd: '500', due_days_offset: '14' },
  ]);

  const jsonValue = React.useMemo(() => {
    if (!enabled) return '';
    return JSON.stringify(
      rows
        .map((r) => ({
          title: r.title.trim(),
          amount_usd: Number(r.amount_usd || 0),
          due_days_offset: Number(r.due_days_offset || 7),
        }))
        .filter((r) => r.title && r.amount_usd > 0)
    );
  }, [enabled, rows]);

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <input type="hidden" name="milestones_json" value={jsonValue} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">
          Milestone Schedule {enabled ? `(${rows.length} custom)` : '(Auto 2-Phase Deposit Split)'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-primary"
          onClick={() => setEnabled((prev) => !prev)}
        >
          {enabled ? 'Use Auto Split' : 'Customize Milestones'}
        </Button>
      </div>

      {enabled && (
        <div className="space-y-2 pt-1">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center gap-1.5">
              <Input
                aria-label={`Milestone ${idx + 1} title`}
                value={row.title}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                  )
                }
                placeholder={`Milestone ${idx + 1}`}
                className="col-span-12 h-9 sm:col-span-6"
              />
              <Input
                aria-label={`Milestone ${idx + 1} amount in USD`}
                type="number"
                value={row.amount_usd}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, amount_usd: e.target.value } : item))
                  )
                }
                placeholder="USD"
                className="col-span-5 h-9 tabular-nums sm:col-span-3"
              />
              <Input
                aria-label={`Milestone ${idx + 1} due days offset`}
                type="number"
                value={row.due_days_offset}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, due_days_offset: e.target.value } : item
                    )
                  )
                }
                placeholder="Days"
                className="col-span-5 h-9 tabular-nums sm:col-span-2"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="col-span-2 h-9 w-9 justify-self-end text-destructive sm:col-span-1"
                disabled={rows.length <= 1}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                aria-label="Remove milestone"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { title: `Phase ${prev.length + 1}`, amount_usd: '250', due_days_offset: '21' },
              ])
            }
          >
            <Plus className="h-3 w-3" />
            Add Milestone Row
          </Button>
        </div>
      )}
    </div>
  );
}
