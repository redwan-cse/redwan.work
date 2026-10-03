'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { PanelNavItem } from './panel-shell';

interface NavigationProps {
  title: string;
  userEmail: string;
  navItems: PanelNavItem[];
  rootHref: string;
}

function currentItem(pathname: string | null, items: PanelNavItem[], rootHref: string) {
  if (!pathname) return undefined;
  const path = pathname.replace(/\/+$/, '') || '/';
  return items.reduce<PanelNavItem | undefined>((best, item) => {
    if (item.enabled === false) return best;
    const href = item.href.replace(/\/+$/, '') || '/';
    const matches = path === href || (href !== rootHref && path.startsWith(`${href}/`));
    return matches && (!best || href.length > best.href.length) ? item : best;
  }, undefined);
}

function NavigationLinks({
  navItems, current, onNavigate,
}: {
  navItems: PanelNavItem[];
  current?: PanelNavItem;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-1">
      {navItems.map((item) => item.enabled === false ? (
        <span key={item.href} aria-disabled="true" title="Coming soon"
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-muted-foreground">
          {item.label}
        </span>
      ) : (
        <Link key={item.href} href={item.href} onClick={onNavigate}
          aria-current={current?.href === item.href ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            current?.href === item.href && 'border-primary bg-primary/10 font-semibold text-primary'
          )}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function SignOut() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button type="submit" variant="ghost" className="min-h-11 w-full justify-start gap-2">
        <LogOut className="size-4" aria-hidden="true" /> Sign out
      </Button>
    </form>
  );
}

function MobileNavigation({
  title, userEmail, navItems, current,
}: Omit<NavigationProps, 'rootHref'> & { current?: PanelNavItem }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex min-w-0 items-center gap-3 border-b bg-background px-4 py-3 md:hidden print:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button ref={trigger} type="button" variant="outline" size="icon"
            className="size-11 shrink-0" aria-label="Open workspace navigation">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-full max-w-sm flex-col overflow-y-auto motion-reduce:animate-none motion-reduce:transition-none"
          onCloseAutoFocus={(event) => {
            if (!trigger.current?.getClientRects().length) {
              event.preventDefault();
              document.getElementById('portal-content')?.focus();
            }
          }}>
          <SheetHeader className="pr-6 text-left">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription className="break-words">{title}</SheetDescription>
          </SheetHeader>
          <p className="break-all text-sm text-muted-foreground">{userEmail}</p>
          <NavigationLinks navItems={navItems} current={current} onNavigate={() => setOpen(false)} />
          <div className="mt-auto border-t pt-4"><SignOut /></div>
        </SheetContent>
      </Sheet>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{title}</p>
        <p className="truncate text-base font-semibold">{current?.label ?? 'Workspace'}</p>
      </div>
    </header>
  );
}

export function PanelNavigation({ title, userEmail, navItems, rootHref }: NavigationProps) {
  const pathname = usePathname();
  const current = currentItem(pathname, navItems, rootHref);
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:sticky md:top-0 md:flex md:h-svh md:overflow-y-auto print:hidden">
        <div className="flex flex-col gap-2 border-b px-5 py-5">
          <Link href={rootHref} className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            redwan.work
          </Link>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        <div className="flex-1 p-3"><NavigationLinks navItems={navItems} current={current} /></div>
        <div className="flex flex-col gap-3 border-t p-3">
          <p className="break-all px-3 text-sm text-muted-foreground">{userEmail}</p>
          <SignOut />
        </div>
      </aside>
      {/* Remount on pathname changes, including browser back/forward. */}
      <MobileNavigation key={pathname ?? rootHref} title={title} userEmail={userEmail} navItems={navItems} current={current} />
    </>
  );
}
