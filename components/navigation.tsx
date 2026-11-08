'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  Briefcase,
  FileText,
  Home,
  LayoutGrid,
  Lock,
  Menu,
  PenTool,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/mode-toggle';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Services', href: '/services', icon: Briefcase },
  { name: 'Portfolio', href: '/portfolio', icon: LayoutGrid },
  { name: 'Blogs', href: '/blogs', icon: PenTool },
  { name: 'Resume', href: '/resume', icon: FileText },
  { name: 'Contact', href: '/contact', icon: Phone },
];

export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-20 items-center justify-between gap-2">
        {/* Brand Identity */}
        <Link href="/" className="group flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/30 bg-muted transition-colors duration-300 group-hover:border-primary sm:h-11 sm:w-11">
            <Image
              src="/profile.jpg"
              alt="Md. Redwan Ahmed"
              fill
              sizes="44px"
              className="object-cover object-top"
              priority
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold tracking-tight text-foreground sm:text-lg">
                Md. Redwan Ahmed
              </span>
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary xl:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                CCEP · CNSP · CAP
              </span>
            </div>
            <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
              Security · Full-Stack · Cloud · AI
            </span>
          </div>
        </Link>

        {/* Desktop Navigation with Antigravity Shared-Layout Pill */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 rounded-full border border-border/80 bg-muted/40 p-1.5 backdrop-blur-md lg:flex"
        >
          {navigation.map(({ name, href }) => {
            const isActive =
              href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200',
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive &&
                  (prefersReducedMotion ? (
                    <span className="absolute inset-0 rounded-full bg-primary shadow-xs" />
                  ) : (
                    <motion.span
                      layoutId="active-nav-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-primary shadow-xs"
                    />
                  ))}
                <span className="relative z-10">{name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-2.5 lg:flex">
          <ModeToggle />
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/portal">
              <Lock className="h-3.5 w-3.5 text-primary" />
              Client Portal
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href="/services#packages">
              <Sparkles className="h-3.5 w-3.5" />
              Order Service
            </Link>
          </Button>
        </div>

        {/* Mobile Navigation */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
          <ModeToggle />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[min(300px,88vw)] flex-col border-l border-border bg-background p-0">
              <SheetHeader className="border-b border-border p-5 text-left">
                <SheetTitle className="flex items-center gap-3">
                  <Image
                    src="/profile.jpg"
                    alt="Md. Redwan Ahmed"
                    width={42}
                    height={42}
                    className="rounded-full border border-primary/30"
                  />
                  <div>
                    <div className="text-base font-bold">Md. Redwan Ahmed</div>
                    <div className="font-mono text-xs text-primary">Security &amp; Full-Stack Consultant</div>
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Primary site navigation and Client Portal links
                </SheetDescription>
              </SheetHeader>

              <nav aria-label="Mobile navigation" className="flex flex-col gap-1.5 p-4">
                {navigation.map(({ name, href, icon: Icon }) => {
                  const isActive =
                    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {name}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-2.5 border-t border-border p-4">
                <Button asChild variant="outline" className="w-full justify-center gap-2">
                  <Link href="/portal" onClick={() => setIsOpen(false)}>
                    <Lock className="h-4 w-4 text-primary" />
                    Client Portal Login
                  </Link>
                </Button>
                <Button asChild className="w-full justify-center gap-2">
                  <Link href="/services#packages" onClick={() => setIsOpen(false)}>
                    <Sparkles className="h-4 w-4" />
                    Order a Service
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
