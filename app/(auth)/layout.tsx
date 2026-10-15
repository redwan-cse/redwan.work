import type { Metadata } from 'next';
import { MarketingFrame } from '@/components/marketing-frame';

export const metadata: Metadata = {
  title: 'Sign in · redwan.work',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingFrame>
      <div className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </MarketingFrame>
  );
}
