import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MarketingFrame } from '@/components/marketing-frame';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';

export const metadata: Metadata = {
  title: 'Sign in · redwan.work',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingFrame>
      <div className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden bg-background px-4 py-14">
        <AntigravityHeroField />
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
      </div>
    </MarketingFrame>
  );
}
