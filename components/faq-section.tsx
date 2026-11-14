import { ChevronDown, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PUBLIC_FAQS, type FaqEntry } from '@/lib/seo/structured-data';

export function FaqSection({
  faqs = PUBLIC_FAQS,
  heading = 'Frequently Asked Questions',
  description = 'Direct answers covering engagement scope, Rules of Engagement (RoE), billing, encrypted deliverables, and verified credentials.',
}: {
  faqs?: ReadonlyArray<FaqEntry>;
  heading?: string;
  description?: string;
}) {
  return (
    <section
      id="faq"
      aria-labelledby="faq-section-heading"
      className="border-t border-border/70 py-14 md:py-16"
    >
      <div className="container">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              ENGAGEMENT &amp; SECURITY FAQ
            </Badge>
            <h2
              id="faq-section-heading"
              className="text-2xl font-bold tracking-tight sm:text-3xl"
            >
              {heading}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <details
                key={faq.id}
                open={idx === 0}
                className="group rounded-2xl border border-border/80 bg-card/85 px-5 py-4 shadow-xs transition-colors open:border-primary/35"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-foreground marker:content-none sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
                  <span>{faq.question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
