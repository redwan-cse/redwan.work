import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { BackToTop } from '@/components/back-to-top';
import { BlogPreloader } from '@/components/blog-preloader';
import { CookiePreferences } from '@/components/cookie-preferences';

/** Public chrome is selected by server route composition, never by auth state. */
export function MarketingFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip" data-marketing-frame="">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to main content
      </a>
      <Navigation />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer />
      <BackToTop />
      <BlogPreloader />
      <CookiePreferences />
    </div>
  );
}
