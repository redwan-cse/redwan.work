import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MarketingFrame } from '@/components/marketing-frame';

// Next.js's built-in 404 boundary automatically emits a single `<meta name="robots" content="noindex" />`.
// Omitting `robots` here (and on RootLayout) avoids duplicate or conflicting robots meta tags on 404 responses.
export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The requested page could not be found on redwan.work.',
};

export default function NotFound() {
  return (
    <MarketingFrame>
      <div className="container flex min-h-[60dvh] flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="max-w-md text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </MarketingFrame>
  );
}
