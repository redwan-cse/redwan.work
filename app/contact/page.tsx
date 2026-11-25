import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Lock,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EnhancedContactForm from '@/components/enhanced-contact-form';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import {
  HeroReveal,
  HeroRevealItem,
  InteractiveCard,
  ScrollReveal,
} from '@/components/motion/reveal';
import { getPublicContactChannels, getPublicServicesCatalog } from '@/lib/cms/queries';
import { readConsentControl } from '@/lib/contact/consent-control';
import { ContactActiveChat } from '@/components/panel/contact-active-chat';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/structured-data';

export const revalidate = 300;

export const metadata: Metadata = buildPublicMetadata({
  title: 'Contact & Project Inquiry — Md. Redwan Ahmed',
  description:
    'Request an offensive security penetration test, full-stack engineering proposal, cloud/Linux hardening, or emergency incident recovery.',
  path: '/contact',
});

export default async function Contact() {
  const [services, channels, consentResult] = await Promise.all([
    getPublicServicesCatalog(),
    getPublicContactChannels(),
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? readConsentControl().catch(() => ({ ok: false as const }))
      : Promise.resolve({ ok: false as const }),
  ]);

  const initialConsentPolicy = consentResult.ok ? consentResult.bundle : null;

  const contactBreadcrumb = buildBreadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Contact & Project Inquiry', path: '/contact' },
  ]);

  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(contactBreadcrumb) }}
      />
      {/* Antigravity Hero Header */}
      <section className="relative overflow-hidden border-b border-border/70 py-14 md:py-20">
        <AntigravityHeroField />
        <div className="container relative z-10">
          <HeroReveal className="mx-auto max-w-3xl text-center">
            <HeroRevealItem>
              <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                CONFIDENTIAL INTAKE · RESPONSE SLA &lt; 12H
              </Badge>
            </HeroRevealItem>
            <HeroRevealItem>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Start an Engagement or Offer a Custom Deal
              </h1>
            </HeroRevealItem>
            <HeroRevealItem>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Choose a fixed package, propose your own custom deal budget &amp; scope, or chat directly on your active contract below.
              </p>
            </HeroRevealItem>
            <HeroRevealItem>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Encrypted Attachment Vault
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Mutual NDA Available on Request
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Direct Ticket &amp; Proposal Reference (INQ-XXXX)
                </span>
              </div>
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-14">
        <div className="container max-w-5xl space-y-12">
          {/* 3 Interactive Quick Channels */}
          <div className="grid gap-6 md:grid-cols-3">
            <ScrollReveal className="h-full">
              <InteractiveCard className="flex h-full flex-col justify-between p-6">
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-bold">Urgent WhatsApp Line</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Experiencing an active security incident, server outage, or need immediate triage? Reach out directly on WhatsApp.
                  </p>
                </div>
                <div className="mt-6 pt-2">
                  <Button asChild variant="outline" size="sm" className="w-full gap-1.5 rounded-full">
                    <Link
                      href={`https://wa.me/${channels.whatsapp_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Chat on WhatsApp
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </InteractiveCard>
            </ScrollReveal>

            <ScrollReveal delay={0.05} className="h-full">
              <InteractiveCard className="flex h-full flex-col justify-between p-6">
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-bold">Discovery &amp; Architecture Call</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Book a 1-on-1 scoping session on Cal.com to walk through your target architecture, timelines, and deliverables.
                  </p>
                </div>
                <div className="mt-6 pt-2">
                  <Button asChild variant="outline" size="sm" className="w-full gap-1.5 rounded-full">
                    <Link
                      href={channels.cal_com_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book on Cal.com
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </InteractiveCard>
            </ScrollReveal>

            <ScrollReveal delay={0.1} className="h-full">
              <InteractiveCard className="flex h-full flex-col justify-between border-primary/35 bg-primary/5 p-6">
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-bold">Existing Client Portal</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Already have an account? Sign in to place package orders, offer custom deals, download encrypted deliverables, or chat live on active contracts.
                  </p>
                </div>
                <div className="mt-6 pt-2">
                  <Button asChild size="sm" className="w-full gap-1.5 rounded-full">
                    <Link href="/portal">
                      Open Client Portal
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </InteractiveCard>
            </ScrollReveal>
          </div>

          {/* Active Contract Live Chat (placed below fold-stable channels to avoid top-of-page CLS) */}
          <ContactActiveChat />

          {/* Comprehensive Project Inquiry Form */}
          <ScrollReveal>
            <Card className="overflow-hidden rounded-2xl border-border/80 shadow-xs">
              <CardHeader className="border-b border-border/70 bg-muted/30 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-xs text-primary">
                    STRUCTURED PROJECT INTAKE &amp; CUSTOM DEALS
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    Encrypted &amp; GDPR-Aligned Intake ({initialConsentPolicy?.version ?? 'v1'})
                  </span>
                </div>
                <CardTitle className="mt-2 text-2xl font-bold">
                  Submit Detailed Service Request or Custom Deal Offer
                </CardTitle>
                <CardDescription className="text-sm">
                  Select any service package below or choose &quot;Offer a Custom Deal&quot; with your preferred budget, and attach any scope documents to our Encrypted Attachment Vault.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-8">
                <EnhancedContactForm
                  initialServices={services}
                  initialConsentPolicy={initialConsentPolicy}
                />
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
