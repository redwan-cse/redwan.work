'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  Bell,
  Briefcase,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FolderLock,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  Package,
  Repeat,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModeToggle } from '@/components/mode-toggle';
import { markAllNotificationsReadAction } from '@/lib/crm/actions';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export interface PanelNavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface PanelNotificationItem {
  id: string;
  title: string;
  body: string;
  href: string | null;
  is_read: boolean;
  created_at: string;
}

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  inquiries: Inbox,
  proposals: FileSpreadsheet,
  orders: Briefcase,
  clients: Users,
  invoices: CreditCard,
  tickets: LifeBuoy,
  retainers: Repeat,
  reviews: Star,
  services: Package,
  audit: Activity,
  emails: Mail,
  files: FolderLock,
  deliverables: FileCheck2,
  profile: UserCheck,
  store: Sparkles,
};

export function PanelShell({
  role,
  userEmail,
  userName,
  unreadNotifications = 0,
  recentNotifications = [],
  navItems,
  children,
}: {
  role: 'admin' | 'client';
  userEmail: string;
  userName?: string | null;
  unreadNotifications?: number;
  recentNotifications?: PanelNotificationItem[];
  navItems: PanelNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const prefersReducedMotion = useReducedMotion();

  const isNavItemActive = (href: string) => {
    if (href === '/admin' || href === '/portal') {
      return pathname === href;
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  const renderNavList = (onItemClick?: () => void) => (
    <nav aria-label={role === 'admin' ? 'Admin navigation' : 'Client portal navigation'} className="flex-1 space-y-1 px-3 py-4">
      {navItems.map((item) => {
        const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
        const active = isNavItemActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onItemClick}
            className={cn(
              'group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            )}
          >
            {active &&
              (prefersReducedMotion ? (
                <span className="absolute inset-0 rounded-lg bg-primary shadow-2xs" />
              ) : (
                <motion.span
                  layoutId="panel-sidebar-active"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-lg bg-primary shadow-2xs"
                />
              ))}
            <span className="relative z-10 flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span
                className={cn(
                  'relative z-10 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold',
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-primary/15 text-primary'
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen overflow-x-clip bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/80 bg-card/50 lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-border/80 px-5">
          <Link
            href={role === 'admin' ? '/admin' : '/portal'}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold leading-none">redwan.work</div>
              <div className="mt-1 font-mono text-[10px] tracking-wider text-primary uppercase">
                {role === 'admin' ? 'Admin Command' : 'Client Portal'}
              </div>
            </div>
          </Link>
        </div>

        {renderNavList()}

        <div className="border-t border-border/80 p-4">
          <div className="mb-3 truncate text-xs">
            <div className="font-semibold text-foreground">
              {userName || (role === 'admin' ? 'Md. Redwan Ahmed' : 'Client Account')}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {userEmail}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
              <Link href="/">
                Public Site
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
            <form action="/api/auth/logout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                title="Sign out"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/80 bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open panel navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[min(256px,86vw)] flex-col p-0">
                <SheetHeader className="border-b border-border p-4 text-left">
                  <SheetTitle className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {role === 'admin' ? 'Admin Command Center' : 'Client Portal'}
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Workspace navigation menu
                  </SheetDescription>
                </SheetHeader>
                {renderNavList(() => setMobileOpen(false))}
                <div className="border-t border-border/80 p-4">
                  <div className="mb-3 truncate text-xs">
                    <div className="font-semibold text-foreground">
                      {userName || (role === 'admin' ? 'Md. Redwan Ahmed' : 'Client Account')}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {userEmail}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
                      <Link href="/" onClick={() => setMobileOpen(false)}>
                        Public Site
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                    <form action="/api/auth/logout" method="post">
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        title="Sign out"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="sr-only">Sign out</span>
                      </Button>
                    </form>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Badge variant="outline" className="hidden font-mono text-xs sm:inline-flex">
              {role === 'admin' ? 'Security Operations & CRM' : 'Encrypted Client Workspace'}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {role === 'client' && (
              <Button asChild size="sm" className="gap-1.5 rounded-full px-2.5 text-xs sm:px-3">
                <Link href="/portal/orders/new">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>New Order</span>
                </Link>
              </Button>
            )}
            {role === 'admin' && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-full px-2.5 text-xs sm:px-3">
                <Link href="/admin/proposals">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>New Proposal</span>
                </Link>
              </Button>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative inline-flex items-center justify-center rounded-full border border-border/80 bg-card p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  aria-label={`Notifications (${unreadNotifications} unread)`}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
                      {unreadNotifications}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5">
                  <span className="text-xs font-bold">
                    Notifications ({unreadNotifications} unread)
                  </span>
                  {unreadNotifications > 0 && (
                    <form action={markAllNotificationsReadAction}>
                      <button
                        type="submit"
                        className="font-mono text-[11px] font-medium text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    </form>
                  )}
                </div>
                <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                  {recentNotifications.length > 0 ? (
                    recentNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={cn(
                          'px-3.5 py-2.5 text-xs transition-colors',
                          !notif.is_read && 'bg-primary/5'
                        )}
                      >
                        {notif.href ? (
                          <Link
                            href={notif.href}
                            className="block font-semibold text-foreground hover:text-primary"
                          >
                            {notif.title}
                          </Link>
                        ) : (
                          <div className="font-semibold text-foreground">{notif.title}</div>
                        )}
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {notif.body}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                      No notifications yet.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <ModeToggle />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 p-4 focus:outline-none sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
