'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Briefcase,
  CreditCard,
  FileSpreadsheet,
  FolderLock,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

interface SearchResultItem {
  group: string;
  id: string;
  label: string;
  meta: string;
  href: string;
}

const STATIC_HUB_ITEMS = [
  { label: 'Command Overview', href: '/admin', shortcut: 'G O', icon: LayoutDashboard },
  { label: 'Pipeline (Inquiries & Proposals)', href: '/admin/pipeline', shortcut: 'G P', icon: Inbox },
  { label: 'Orders & Delivery Workspace', href: '/admin/orders', shortcut: 'G D', icon: Briefcase },
  { label: 'Clients 360° Directory', href: '/admin/clients', shortcut: 'G C', icon: Users },
  { label: 'Billing, Invoices & Retainers', href: '/admin/billing', shortcut: 'G B', icon: CreditCard },
  { label: 'Support & Verified Reviews', href: '/admin/support', shortcut: 'G S', icon: LifeBuoy },
  { label: 'Content Studio (Services, Portfolio, Resume, Assets, Blogs)', href: '/admin/content', shortcut: 'G M', icon: Package },
  { label: 'Security & Ops (Audit, Outbox, Vault Recovery, Settings)', href: '/admin/ops', shortcut: 'G A', icon: ShieldCheck },
];

const QUICK_ROUTES = [
  { label: 'Create Multi-Line Draft Invoice', href: '/admin/invoices/new', icon: FileSpreadsheet },
  { label: 'Email Outbox & Queue Monitor', href: '/admin/emails/outbox', icon: Mail },
  { label: 'R2 Vault Recovery & Quotas', href: '/admin/recovery', icon: FolderLock },
  { label: 'Audit & Security Log', href: '/admin/audit', icon: Activity },
  { label: 'Consent Policies & Security Settings', href: '/admin/settings', icon: Settings },
];

export function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let chordPending = false;
    let chordTimer: number | null = null;
    const CHORD_ROUTES: Record<string, string> = {
      o: '/admin',
      p: '/admin/pipeline',
      d: '/admin/orders',
      c: '/admin/clients',
      b: '/admin/billing',
      s: '/admin/support',
      m: '/admin/content',
      a: '/admin/ops',
    };

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (chordPending) {
        chordPending = false;
        if (chordTimer !== null) {
          window.clearTimeout(chordTimer);
          chordTimer = null;
        }
        const targetHref = CHORD_ROUTES[key];
        if (targetHref) {
          event.preventDefault();
          router.push(targetHref);
        }
        return;
      }

      if (key === 'g') {
        chordPending = true;
        chordTimer = window.setTimeout(() => {
          chordPending = false;
          chordTimer = null;
        }, 900);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (chordTimer !== null) window.clearTimeout(chordTimer);
    };
  }, [router]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (val.trim().length < 2) {
      setResults([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setResults([]);
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { results?: SearchResultItem[] };
          setResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        // aborted or network transient
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const navigate = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const grouped = results.reduce<Record<string, SearchResultItem[]>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only md:not-sr-only">Quick Jump...</span>
        <kbd
          aria-hidden="true"
          className="hidden rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline"
        >
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput
          value={query}
          onValueChange={handleQueryChange}
          placeholder="Search orders, clients, invoices, tickets, or jump to hub..."
        />
        <CommandList>
          <CommandEmpty>
            {loading ? 'Searching encrypted workspace...' : 'No matching workspace records.'}
          </CommandEmpty>

          {Object.entries(grouped).map(([groupName, groupItems]) => (
            <CommandGroup key={groupName} heading={groupName}>
              {groupItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.meta}`}
                  onSelect={() => navigate(item.href)}
                >
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
                    {item.meta}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {Object.keys(grouped).length > 0 && <CommandSeparator />}

          <CommandGroup heading="Workspace Hubs">
            {STATIC_HUB_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.href}`}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Direct Tools & Consoles">
            {QUICK_ROUTES.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.href}`}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
