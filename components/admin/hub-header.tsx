import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface HubTabItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

export function AdminHubHeader({
  eyebrow,
  title,
  description,
  tabs,
  activeTab,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tabs?: HubTabItem[];
  activeTab?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wider text-primary">
            {eyebrow}
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-3xl text-xs text-muted-foreground sm:text-sm">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {tabs && tabs.length > 0 && (
        <nav
          aria-label={`${title} views`}
          className="flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-muted/40 p-1"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-2xs ring-1 ring-border/70'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                      isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
