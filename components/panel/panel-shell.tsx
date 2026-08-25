import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PanelNavItem {
  label: string;
  href: string;
  enabled?: boolean;
}

export function PanelShell({
  title,
  userEmail,
  navItems,
  activeHref,
  children,
}: {
  title: string;
  userEmail: string;
  navItems: PanelNavItem[];
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="border-b px-5 py-4">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) =>
            item.enabled === false ? (
              <span
                key={item.href}
                aria-disabled="true"
                title="Coming soon"
                className="block cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm hover:bg-accent',
                  activeHref === item.href && 'bg-accent font-medium'
                )}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="border-t p-3">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-5 py-3 md:hidden">
          <p className="text-sm font-semibold">{title}</p>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" size="sm" className="gap-2">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
