import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { WhatsAppButton } from '@/components/whatsapp-button';

/** Public chrome is selected by server route composition, never by auth state. */
export function MarketingFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" data-marketing-frame="">
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
