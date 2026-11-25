import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ModeToggle } from '@/components/mode-toggle';

export const metadata: Metadata = {
  title: 'Sign in · redwan.work',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to main content
      </a>

      <header className="border-b border-border/70 bg-background/90">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>redwan.work</span>
          </Link>
          <ModeToggle />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,oklch(from_var(--primary)_l_c_h_/_0.08),transparent_60%)] px-4 py-12 focus:outline-none"
      >
        <div className="relative z-10 w-full max-w-md space-y-5">
          <div className="text-center">
            <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              ENCRYPTED WORKSPACE ACCESS
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight">
              Client Portal &amp; Command Center
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage orders, proposals, deliverables, and support tickets securely.
            </p>
          </div>
          {children}
        </div>
      </main>

      <footer className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
        <div className="container flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>Md. Redwan Ahmed · Security &amp; Engineering Portal</span>
          <Link href="/privacy" className="hover:text-primary hover:underline">
            Privacy
          </Link>
          <Link href="/tos" className="hover:text-primary hover:underline">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
